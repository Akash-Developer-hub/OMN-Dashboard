"use strict";

const axios = require("axios");
const ApiResponse = require("../../utils/ApiResponse");
const ServiceHealth = require("../models/ServiceHealth");
const N8nAlertService = require('../services/n8nAlertService');
const logger = require("../../logs_/logger");
const DEFAULT_WEBHOOK_URL = "https://sandbox.vmmaps.com/n8n/webhook/service-health";
const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

const ALERT_RECIPIENTS = "FALL_BACK_MAIL";

// --- HEALTH CHECK CONSTANTS ---
const HEALTH_URL_MAX_RETRIES = 3;
const HEALTH_URL_TIMEOUT_MS = 60000; // 60 seconds

const formatTimestamp = (date) => {
  const d = date || new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
};

const mapServiceStatus = (status) => {
  if (status === "online") return "healthy";
  if (status === "stopped" || status === "errored") return "down";
  return "degraded";
};

const sendDownAlertIfNeeded = async ({
  pm2Name,
  serviceDefinition,
  previousStatus,
  currentStatus,
  mailTo,
}) => {
  const shouldSendAlert =
    currentStatus === "down" && previousStatus !== "down";

  logger.debug(`Service: ${pm2Name}, Previous Status: ${previousStatus}, Current Status: ${currentStatus}, Should Send Alert: ${shouldSendAlert}`);
  console.log(`Service: ${pm2Name}, Previous Status: ${previousStatus}, Current Status: ${currentStatus}, Should Send Alert: ${shouldSendAlert}`);

  if (!shouldSendAlert) return false;

  try {
    logger.info(`Sending first down alert for service '${pm2Name}'.`);
    const recipients = (Array.isArray(mailTo) ? mailTo.join(", ") : mailTo) || ALERT_RECIPIENTS;
    await N8nAlertService.sendAlert({
      to: recipients,
      titleService: (serviceDefinition || "SERVICE").toUpperCase(),
      services: pm2Name,
      timestamp: formatTimestamp(new Date()),
    });
    return true;
  } catch (mailErr) {
    logger.error(`Failed to send first down alert for service '${pm2Name}'.`, {
      error: mailErr.message,
      response: mailErr.response?.data,
    });
    return false;
  }
};

const parseNumber = (value) => {
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractPm2List = (body) => {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.services)) return body.services;
  if (Array.isArray(body)) return body;
  return [];
};

const findPm2ByName = (list, pm2Name) =>
  list.find(
    (item) => item && String(item.name).toLowerCase() === pm2Name.toLowerCase(),
  );

const callServiceHealthWebhook = async (serverName, command) => {
  const webhookUrl = process.env.SERVICE_HEALTH_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  const reqStart = Date.now();
  const response = await axios({
    method: "get",
    url: webhookUrl,
    headers: { "Content-Type": "application/json" },
    data: {
      command,
      server: serverName,
    },
    timeout: Number(process.env.SERVICE_HEALTH_TIMEOUT_MS) || 15000,
  });
  return {
    response,
    requestTimeMs: Date.now() - reqStart,
  };
};

const fetchPm2ListFromWebhook = async (serverName) => {
  const { response, requestTimeMs } = await callServiceHealthWebhook(
    serverName,
    "pm2 list",
  );
  return {
    response,
    requestTimeMs,
    pm2List: extractPm2List(response.data),
  };
};

const performHealthUrlCheck = async (healthUrl, apiTimeout, pm2Name) => {
  const timeoutMs = Number(apiTimeout) || HEALTH_URL_TIMEOUT_MS;
  let responseTimeMs = 0;
  let statusCode = 0;
  let finalStatus = "degraded";

  let attempt = 0;
  while (attempt <= HEALTH_URL_MAX_RETRIES) {
    try {
      const apiStartedAt = Date.now();
      console.log(`Health Url Hit Check ${pm2Name} -> ${healthUrl} (Attempt ${attempt + 1})`);
      
      const apiRes = await axios.get(healthUrl, {
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      
      responseTimeMs = Date.now() - apiStartedAt;
      statusCode = apiRes.status;

      if (statusCode >= 200 && statusCode < 300) {
        finalStatus = "healthy";
      } else if (statusCode >= 500) {
        finalStatus = "unhealthy";
      } else {
        finalStatus = "degraded";
      }
      
      return { finalStatus, statusCode, responseTimeMs };
    } catch (err) {
      responseTimeMs = timeoutMs;
      attempt++;
      if (attempt > HEALTH_URL_MAX_RETRIES) {
        finalStatus = "degraded";
        return { finalStatus, statusCode: 0, responseTimeMs };
      }
    }
  }

  return { finalStatus, statusCode, responseTimeMs };
};

const ApiHealthCheck = async (svc) => {
  const nowStr = new Date().toISOString();
  const startedAt = Date.now();

  let statusCode = 0;
  let responseData = null;
  let errorMessage = null;

  try {
    const parsedHeaders = svc.apiHeaders ? JSON.parse(svc.apiHeaders) : {};
    const parsedQuery = svc.apiQueryParams ? JSON.parse(svc.apiQueryParams) : {};
    const parsedBody = svc.apiBody ? JSON.parse(svc.apiBody) : undefined;

    const res = await axios({
      method: (svc.apiMethod || 'GET').toLowerCase(),
      url: svc.apiUrl,
      headers: { 'Content-Type': 'application/json', ...parsedHeaders },
      params: parsedQuery,
      data: parsedBody,
      timeout: Number(svc.apiTimeout) || 60000,
      validateStatus: () => true,
    });

    statusCode = res.status;
    responseData = res.data;
  } catch (err) {
    statusCode = err.response?.status || 0;
    errorMessage = err.message;
  }

  const elapsed = Date.now() - startedAt;

  let status = 'down';
  if (statusCode >= 200 && statusCode < 300) status = 'healthy';
  else if (statusCode >= 300 && statusCode < 400) status = 'degraded';
  else if (statusCode > 0) status = 'down';

  const healthState = {
    status,
    rawStatus: String(statusCode),
    statusCode,
    uptime: responseData?.uptimeSeconds ? `${responseData.uptimeSeconds}s` : '0',
    pid: 0,
    cpu: 0,
    memoryMB: '0 MB',
    restarts: 0,
    lastChecked: nowStr,
    responseTimeMs: elapsed,
  };

  return { healthState, webhookResult: { statusCode, data: responseData, error: errorMessage } };
};

const singleServiceCheck = async (pm2Name) => {
  const checkedAt = new Date().toISOString();
  const snapshot = await ServiceHealth.getSnapshot();
  const svc = snapshot[pm2Name];

  if (!svc) {
    const err = new Error(`Service '${pm2Name}' not configured in database.`);
    err.statusCode = 404;
    throw err;
  }

  if (svc.type === 'api') {
    const { healthState, webhookResult } = await ApiHealthCheck(svc);
    
    const nowStr = new Date().toISOString();
    await sendDownAlertIfNeeded({
      pm2Name,
      serviceDefinition: svc.serviceDefinition,
      previousStatus: svc.status,
      currentStatus: healthState.status,
      mailTo: svc.mailTo,
    });

    const updatedFields = {
      [`${pm2Name}.status`]: healthState.status,
      [`${pm2Name}.rawStatus`]: healthState.rawStatus,
      [`${pm2Name}.statusCode`]: healthState.statusCode,
      [`${pm2Name}.uptime`]: healthState.uptime,
      [`${pm2Name}.lastChecked`]: healthState.lastChecked,
      [`${pm2Name}.responseTimeMs`]: healthState.responseTimeMs,
      [`${pm2Name}.updatedAt`]: nowStr,
    };
    await ServiceHealth.saveSnapshot(updatedFields);
    const freshSnapshot = await ServiceHealth.getSnapshot();
    const payload = compileDbSnapshot(freshSnapshot, checkedAt);
    return { ...payload, webhook: webhookResult };
  }

  const serverName = svc.server;
  if (!serverName) {
    const err = new Error(`No server configured for service '${pm2Name}'.`);
    err.statusCode = 400;
    throw err;
  }

  let pm2Item = null;
  let requestTimeMs = 0;
  let webhookResult = null;

  const {
    response,
    requestTimeMs: elapsed,
    pm2List,
  } = await fetchPm2ListFromWebhook(serverName);
  requestTimeMs = elapsed;
  pm2Item = findPm2ByName(pm2List, pm2Name);
  webhookResult = {
    ...response.data,
    data: pm2Item ? [pm2Item] : [],
  };

  const parsed = parsePm2Process(pm2Item);
  let finalStatus = parsed ? mapServiceStatus(parsed.status) : "down";
  let statusCode = 0;
  let responseTimeMs = 0;

  if (parsed && parsed.status === "online" && svc.healthUrl) {
    const healthResult = await performHealthUrlCheck(svc.healthUrl, svc.apiTimeout, svc.pm2Name);
    finalStatus = healthResult.finalStatus;
    statusCode = healthResult.statusCode;
    responseTimeMs = healthResult.responseTimeMs;
  }

  const nowStr = new Date().toISOString();
  const healthState = {
    status: finalStatus,
    rawStatus: parsed ? parsed.status : "stopped",
    statusCode,
    uptime: parsed ? parsed.uptime : "0",
    pid: parsed ? parsed.pid : 0,
    cpu: parsed ? parsed.cpu : 0,
    memoryMB: parsed ? parsed.memoryMB : "0 MB",
    restarts: parsed ? parsed.restarts : 0,
    lastChecked: nowStr,
    responseTimeMs: parsed && parsed.status === "online" && svc.healthUrl ? responseTimeMs : null,
  };

  if (healthState.responseTimeMs !== null && healthState.responseTimeMs > 0) {
    await ServiceHealth.logResponseTime(pm2Name, healthState.responseTimeMs);
  }

  await sendDownAlertIfNeeded({
    pm2Name,
    serviceDefinition: svc.serviceDefinition,
    previousStatus: svc.status,
    currentStatus: healthState.status,
    mailTo: svc.mailTo,
  });

  const updatedFields = {
    [`${pm2Name}.status`]: healthState.status,
    [`${pm2Name}.rawStatus`]: healthState.rawStatus,
    [`${pm2Name}.statusCode`]: healthState.statusCode,
    [`${pm2Name}.uptime`]: healthState.uptime,
    [`${pm2Name}.pid`]: healthState.pid,
    [`${pm2Name}.cpu`]: healthState.cpu,
    [`${pm2Name}.memoryMB`]: healthState.memoryMB,
    [`${pm2Name}.restarts`]: healthState.restarts,
    [`${pm2Name}.lastChecked`]: healthState.lastChecked,
    [`${pm2Name}.responseTimeMs`]: healthState.responseTimeMs,
    [`${pm2Name}.updatedAt`]: nowStr,
  };

  await ServiceHealth.saveSnapshot(updatedFields);

  const freshSnapshot = await ServiceHealth.getSnapshot();
  const payload = compileDbSnapshot(freshSnapshot, checkedAt);

  return {
    ...payload,
    webhook: webhookResult,
  };
};

const parseMemoryMB = (memory) => {
  if (memory === undefined || memory === null) return "0 MB";
  if (typeof memory === "number") {
    return memory > 0 ? `${(memory / (1024 * 1024)).toFixed(1)} MB` : "0 MB";
  }
  const str = String(memory).trim();
  const lower = str.toLowerCase();
  if (lower.endsWith("mb")) return str.replace(/mb$/i, " MB");
  if (lower.endsWith("gb")) {
    const gb = parseNumber(str);
    return `${(gb * 1024).toFixed(1)} MB`;
  }
  if (lower === "0b" || lower === "0") return "0 MB";
  return str;
};

const parsePm2Process = (proc) => {
  if (!proc) return null;

  const status = proc.status || proc.pm2_env?.status || "stopped";
  const pid = proc.pid || 0;
  const cpu = parseNumber(
    proc.cpu !== undefined ? proc.cpu : proc.monit?.cpu || 0,
  );

  let memoryMB = "0 MB";
  const memValue =
    proc.memory !== undefined
      ? proc.memory
      : proc.monit?.memory || proc.memoryMB;
  if (memValue !== undefined && memValue !== null) {
    memoryMB = parseMemoryMB(memValue);
  } else if (proc.memoryMB) {
    memoryMB = proc.memoryMB;
  }

  const restarts =
    proc.restarts !== undefined
      ? proc.restarts
      : proc.pm2_env?.restart_time || 0;

  let uptime = "-";
  if (proc.uptime) {
    uptime = String(proc.uptime);
  } else if (proc.pm2_env?.pm2_uptime) {
    const uptimeMs = Date.now() - proc.pm2_env.pm2_uptime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    uptime = uptimeHours > 0 ? `${uptimeHours}h` : "0h";
  }

  return {
    status,
    pid,
    cpu,
    memoryMB,
    restarts,
    uptime,
  };
};

const compileDbSnapshot = (snapshot, checkedAt) => {
  const serviceListForFrontend = [];
  const configuredServices = {};

  for (const [key, value] of Object.entries(snapshot)) {
    if (key !== "_id" && value && typeof value === "object") {
      configuredServices[key] = value;
    }
  }

  for (const [pm2Name, svc] of Object.entries(configuredServices)) {
    serviceListForFrontend.push({
      name: svc.serviceDefinition || pm2Name,
      pm2Name: pm2Name,
      type: svc.type || "pm2",
      rawStatus: svc.rawStatus || "stopped",
      status: svc.status || "down",
      statusCode: svc.statusCode || 0,
      responseTimeMs: svc.responseTimeMs || 0,
      lastChecked: svc.lastChecked || checkedAt,
      uptime: svc.uptime || "0",
      pid: svc.pid || 0,
      cpu: svc.cpu || 0,
      memoryMB: svc.memoryMB || "0 MB",
      restarts: svc.restarts || 0,
      server: svc.server || "-",
      mailTo: svc.mailTo || [],
    });
  }

  const total = serviceListForFrontend.length;
  const online = serviceListForFrontend.filter(
    (s) => s.status === "healthy",
  ).length;
  const stopped = total - online;

  return {
    total,
    online,
    stopped,
    checkedAt: snapshot.updatedAt || checkedAt,
    responseTimeMs: 0,
    services: serviceListForFrontend,
  };
};

class ServiceHealthController {
  static getServiceHealth = async (_req, res) => {
    const checkedAt = new Date().toISOString();
    try {
      const snapshot = await ServiceHealth.getSnapshot();
      const payload = compileDbSnapshot(snapshot, checkedAt);
      return ApiResponse.success(
        res,
        200,
        "Service health retrieved successfully.",
        payload,
      );
    } catch (err) {
      return ApiResponse.error(
        res,
        500,
        "Failed to retrieve service health.",
        null,
        err.message,
      );
    }
  };

  static checkService = async (req, res) => {
    const pm2Name = String(req.body?.serviceName || "").trim();

    if (!pm2Name) {
      return ApiResponse.error(res, 400, "serviceName is required.");
    }

    try {
      const payload = await singleServiceCheck(pm2Name);
      return ApiResponse.success(
        res,
        200,
        `Checked service '${pm2Name}' successfully.`,
        payload,
      );
    } catch (err) {
      if (err.statusCode) {
        return ApiResponse.error(res, err.statusCode, err.message);
      }
      const details = err.response?.data || err.message;
      return ApiResponse.error(
        res,
        502,
        "Failed to fetch PM2 status from webhook.",
        null,
        details,
      );
    }
  };

  static getPm2ServiceNames = async (req, res) => {
    const serverName = String(req.query?.server || "").trim();

    try {
      const { pm2List } = await fetchPm2ListFromWebhook(serverName);
      const pm2names = pm2List
        .filter((item) => item && item.name)
        .map((item) => String(item.name));

      return ApiResponse.success(
        res,
        200,
        "PM2 service names retrieved successfully.",
        { pm2names },
      );
    } catch (err) {
      const details = err.response?.data || err.message;
      return ApiResponse.error(
        res,
        502,
        "Failed to fetch PM2 service names from webhook.",
        null,
        details,
      );
    }
  };

  static checkAllServices = async (_req, res) => {
    const checkedAt = new Date().toISOString();

    try {
      const snapshot = await ServiceHealth.getSnapshot();

      const configuredServices = [];
      for (const [key, value] of Object.entries(snapshot)) {
        if (key !== "_id" && value && typeof value === "object") {
          configuredServices.push({ pm2Name: key, ...value });
        }
      }

      const pm2Services = configuredServices.filter(s => s.type !== 'api');
      const apiServices = configuredServices.filter(s => s.type === 'api');

      const updatedFields = {};
      const webhookErrors = [];

      const servicesByServer = {};
      for (const svc of pm2Services) {
        const serverName = svc.server;
        if (!serverName) continue;
        if (!servicesByServer[serverName]) {
          servicesByServer[serverName] = [];
        }
        servicesByServer[serverName].push(svc);
      }

      for (const [serverName, servicesOnServer] of Object.entries(
        servicesByServer,
      )) {
        let pm2ListForServer = [];

        try {
          const { pm2List } = await fetchPm2ListFromWebhook(serverName);
          pm2ListForServer = pm2List;
        } catch (err) {
          webhookErrors.push({
            server: serverName,
            details: err.response?.data || err.message,
          });
          continue;
        }

        const pm2Map = new Map();
        for (const item of pm2ListForServer) {
          if (item && item.name) {
            pm2Map.set(String(item.name).toLowerCase(), item);
          }
        }

        for (const svc of servicesOnServer) {
          const pm2Item = pm2Map.get(svc.pm2Name.toLowerCase());
          const parsed = parsePm2Process(pm2Item);

          let finalStatus = parsed ? mapServiceStatus(parsed.status) : "down";
          let statusCode = 0;
          let responseTimeMs = 0;

          if (parsed && parsed.status === "online" && svc.healthUrl) {
            const healthResult = await performHealthUrlCheck(svc.healthUrl, svc.apiTimeout, svc.pm2Name);
            finalStatus = healthResult.finalStatus;
            statusCode = healthResult.statusCode;
            responseTimeMs = healthResult.responseTimeMs;
          }

          const nowStr = new Date().toISOString();
          const healthState = {
            status: finalStatus,
            rawStatus: parsed ? parsed.status : "stopped",
            statusCode,
            uptime: parsed ? parsed.uptime : "0",
            pid: parsed ? parsed.pid : 0,
            cpu: parsed ? parsed.cpu : 0,
            memoryMB: parsed ? parsed.memoryMB : "0 MB",
            restarts: parsed ? parsed.restarts : 0,
            lastChecked: nowStr,
            responseTimeMs: parsed && parsed.status === "online" && svc.healthUrl ? responseTimeMs : null,
          };

          if (healthState.responseTimeMs !== null && healthState.responseTimeMs > 0) {
            await ServiceHealth.logResponseTime(svc.pm2Name, healthState.responseTimeMs);
          }

          await sendDownAlertIfNeeded({
            pm2Name: svc.pm2Name,
            serviceDefinition: svc.serviceDefinition,
            previousStatus: svc.status,
            currentStatus: healthState.status,
            mailTo: svc.mailTo,
          });

          updatedFields[`${svc.pm2Name}.status`] = healthState.status;
          updatedFields[`${svc.pm2Name}.rawStatus`] = healthState.rawStatus;
          updatedFields[`${svc.pm2Name}.statusCode`] = healthState.statusCode;
          updatedFields[`${svc.pm2Name}.uptime`] = healthState.uptime;
          updatedFields[`${svc.pm2Name}.pid`] = healthState.pid;
          updatedFields[`${svc.pm2Name}.cpu`] = healthState.cpu;
          updatedFields[`${svc.pm2Name}.memoryMB`] = healthState.memoryMB;
          updatedFields[`${svc.pm2Name}.restarts`] = healthState.restarts;
          updatedFields[`${svc.pm2Name}.lastChecked`] = healthState.lastChecked;
          updatedFields[`${svc.pm2Name}.responseTimeMs`] = healthState.responseTimeMs;
          updatedFields[`${svc.pm2Name}.updatedAt`] = nowStr;
        }
      }

      for (const svc of apiServices) {
        try {
          const { healthState } = await ApiHealthCheck(svc);
          const nowStr = new Date().toISOString();
          
          await sendDownAlertIfNeeded({
            pm2Name: svc.pm2Name,
            serviceDefinition: svc.serviceDefinition,
            previousStatus: svc.status,
            currentStatus: healthState.status,
            mailTo: svc.mailTo,
          });
          updatedFields[`${svc.pm2Name}.status`] = healthState.status;
          updatedFields[`${svc.pm2Name}.rawStatus`] = healthState.rawStatus;
          updatedFields[`${svc.pm2Name}.statusCode`] = healthState.statusCode;
          updatedFields[`${svc.pm2Name}.uptime`] = healthState.uptime;
          updatedFields[`${svc.pm2Name}.lastChecked`] = healthState.lastChecked;
          updatedFields[`${svc.pm2Name}.responseTimeMs`] = healthState.responseTimeMs;
          updatedFields[`${svc.pm2Name}.updatedAt`] = nowStr;
        } catch (err) {
          webhookErrors.push({ service: svc.pm2Name, details: err.message });
        }
      }

      if (webhookErrors.length > 0 && Object.keys(updatedFields).length === 0) {
        return ApiResponse.error(
          res,
          502,
          "Failed to fetch PM2 status from webhook.",
          null,
          webhookErrors,
        );
      }

      if (Object.keys(updatedFields).length > 0) {
        await ServiceHealth.saveSnapshot(updatedFields);
      }

      const freshSnapshot = await ServiceHealth.getSnapshot();
      const payload = compileDbSnapshot(freshSnapshot, checkedAt);

      return ApiResponse.success(
        res,
        200,
        "All services checked and updated successfully.",
        payload,
      );
    } catch (err) {
      return ApiResponse.error(
        res,
        500,
        "Failed to check all services.",
        null,
        err.message,
      );
    }
  };

  static saveConfiguration = async (req, res) => {
    const { server, serviceDefinition, pm2Name, type, healthUrl, apiUrl, apiMethod, apiTimeout, apiHeaders, apiQueryParams, apiBody, mailTo } = req.body;

    if (!serviceDefinition || !pm2Name) {
      return ApiResponse.error(
        res,
        400,
        "serviceDefinition and pm2Name are required.",
      );
    }

    if ((!type || type === 'pm2') && !server) {
      return ApiResponse.error(
        res,
        400,
        "server is required for PM2 services.",
      );
    }

    try {
      const isDuplicate = await ServiceHealth.isServiceDefinitionDuplicate(serviceDefinition, pm2Name);
      if (isDuplicate) {
        return ApiResponse.error(
          res,
          409,
          `Service definition name "${serviceDefinition}" already exists.`,
        );
      }

      await ServiceHealth.saveConfiguration({
        server,
        serviceDefinition,
        pm2Name,
        type,
        healthUrl,
        apiUrl,
        apiMethod,
        apiTimeout,
        apiHeaders,
        apiQueryParams,
        apiBody,
        mailTo,
      });

      return ApiResponse.success(
        res,
        200,
        "Service configuration saved successfully.",
      );
    } catch (err) {
      return ApiResponse.error(res, 500, err.message);
    }
  };
  
  static stopService = async (req, res) => {
    const pm2Name = String(req.body?.serviceName || "").trim();

    if (!pm2Name) {
      return ApiResponse.error(res, 400, "serviceName is required.");
    }

    try {
      const snapshot = await ServiceHealth.getSnapshot();
      const serviceConfig = snapshot[pm2Name];

      if (!serviceConfig || !serviceConfig.server) {
        return ApiResponse.error(
          res,
          400,
          `No server configured for service '${pm2Name}'.`,
        );
      }

      const configuredServerName = serviceConfig.server;
      await callServiceHealthWebhook(
        configuredServerName,
        `pm2 stop ${pm2Name}`,
      );

      const payload = await singleServiceCheck(pm2Name);
      return ApiResponse.success(
        res,
        200,
        `service '${pm2Name}' stopped successfully.`,
        payload,
      );
    } catch (err) {
      const details = err.response?.data || err.message;
      return ApiResponse.error(
        res,
        502,
        "Failed to stop service.",
        null,
        details,
      );
    }
  };
  
  static restartService = async (req, res) => {
    const pm2Name = String(req.body?.serviceName || "").trim();

    if (!pm2Name) {
      return ApiResponse.error(res, 400, "serviceName is required.");
    }

    if (!SERVICE_NAME_PATTERN.test(pm2Name)) {
      return ApiResponse.error(res, 400, "Invalid serviceName.");
    }

    try {
      const snapshot = await ServiceHealth.getSnapshot();
      const serviceConfig = snapshot[pm2Name];

      if (!serviceConfig || !serviceConfig.server) {
        return ApiResponse.error(
          res,
          400,
          `No server configured for service '${pm2Name}'.`,
        );
      }

      const serverName = serviceConfig.server;
      await callServiceHealthWebhook(serverName, `pm2 restart ${pm2Name}`);

      const payload = await singleServiceCheck(pm2Name);
      return ApiResponse.success(
        res,
        200,
        `Restarted service '${pm2Name}' successfully.`,
        payload,
      );
    } catch (err) {
      const details = err.response?.data || err.message;
      return ApiResponse.error(
        res,
        502,
        "Failed to restart service.",
        null,
        details,
      );
    }
  };

  /**
   * POST /api/v1/admin-dashboard/service-health/editServiceName
   * Edit only the dashboard service definition name for a configured PM2/API service.
   */
  static editServiceName = async (req, res) => {
    const pm2Name = String(req.body?.pm2Name || req.body?.serviceName || "").trim();
    const serviceDefinition = String(req.body?.serviceDefinition || "").trim();

    if (!pm2Name || !serviceDefinition) {
      return ApiResponse.error(
        res,
        400,
        "pm2Name and serviceDefinition are required.",
      );
    }

    try {
      const snapshot = await ServiceHealth.getSnapshot();
      if (!snapshot[pm2Name]) {
        return ApiResponse.error(res, 404, `Service '${pm2Name}' not found.`);
      }

      const isDuplicate = await ServiceHealth.isServiceDefinitionDuplicate(
        serviceDefinition,
        pm2Name,
      );

      if (isDuplicate) {
        return ApiResponse.error(
          res,
          409,
          `Service definition name "${serviceDefinition}" already exists.`,
        );
      }

      const result = await ServiceHealth.editServiceName(pm2Name, serviceDefinition);
      if (result.matchedCount === 0) {
        return ApiResponse.error(res, 404, `Service '${pm2Name}' not found.`);
      }

      const freshSnapshot = await ServiceHealth.getSnapshot();
      const payload = compileDbSnapshot(freshSnapshot, new Date().toISOString());

      return ApiResponse.success(
        res,
        200,
        "Service name updated successfully.",
        payload,
      );
    } catch (err) {
      return ApiResponse.error(res, 500, err.message);
    }
  };

  /**
   * POST /api/v1/admin-dashboard/service-health/deleteService
   * Delete a configured PM2/API service from service health storage.
   */
  static deleteService = async (req, res) => {
    const pm2Name = String(req.body?.pm2Name || req.body?.serviceName || "").trim();

    if (!pm2Name) {
      return ApiResponse.error(res, 400, "pm2Name is required.");
    }

    try {
      const result = await ServiceHealth.deleteService(pm2Name);
      if (result.matchedCount === 0) {
        return ApiResponse.error(res, 404, `Service '${pm2Name}' not found.`);
      }

      const freshSnapshot = await ServiceHealth.getSnapshot();
      const payload = compileDbSnapshot(freshSnapshot, new Date().toISOString());

      return ApiResponse.success(
        res,
        200,
        "Service deleted successfully.",
        payload,
      );
    } catch (err) {
      return ApiResponse.error(res, 500, err.message);
    }
  };

  static getConfigurationList = async (_req, res) => {
    try {
      const configurations = await ServiceHealth.getConfigurations();
      return ApiResponse.success(
        res,
        200,
        "Service configurations retrieved successfully.",
        configurations,
      );
    } catch (err) {
      return ApiResponse.error(
        res,
        500,
        "Failed to retrieve service configurations.",
        null,
        err.message,
      );
    }
  };

  /**
   * POST /api/v1/admin-dashboard/service-health/test-alert
   * Manually test the n8n alert webhook.
   */
  static testAlert = async (req, res) => {
    const { to, services, timestamp } = req.body;

    try {
      const data = await N8nAlertService.sendAlert({
        to: to || ALERT_RECIPIENTS,
        services: services || "test-service",
        timestamp: timestamp || formatTimestamp(new Date())
      });

      return ApiResponse.success(res, 200, "Alert sent successfully.", data);
    } catch (err) {
      return ApiResponse.error(res, 500, "Failed to send alert.", null, err.message);
    }
  };

  /**
   * --- ENDPOINT FOR TREND RESPONSE ---
   * GET /api/v1/admin-dashboard/service-health/response-time-trends
   * Pass parameters via query string (e.g. ?serviceName=my-service&range=24h)
   */
  static getResponseTimeTrends = async (req, res) => {
    const pm2Name = String(req.query?.serviceName || req.params?.serviceName || "").trim();
    const range = String(req.query?.range || "24h").trim();

    if (!pm2Name) {
      return ApiResponse.error(res, 400, "serviceName is required.");
    }

    try {
      const metrics = await ServiceHealth.getResponseTimeMetrics(pm2Name, range);
      return ApiResponse.success(
        res,
        200,
        "Response time trends retrieved successfully.",
        metrics
      );
    } catch (err) {
      return ApiResponse.error(
        res,
        500,
        "Failed to retrieve response time trends.",
        null,
        err.message
      );
    }
  };
}

module.exports = ServiceHealthController;