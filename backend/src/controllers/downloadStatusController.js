'use strict';

const axios = require('axios');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../logs_/logger');
const config = require('../config');
const PipelineConfig = require('../models/PipelineConfig');
const VersionedDownloadStatus = require('../models/VersionedDownloadStatus');

const DEFAULT_VERSION = 'v1.0';
const ALLOWED_WORKFLOWS = new Set(['searchTiles', 'routing']);
const LOG_MONITOR_INTERVAL_MS = Number(process.env.DOWNLOAD_LOG_MONITOR_INTERVAL_MS || 3000);
const LOG_MONITOR_MAX_DURATION_MS = Number(process.env.DOWNLOAD_LOG_MONITOR_MAX_DURATION_MS || 6 * 60 * 60 * 1000);
const LOG_MONITOR_REQUEST_TIMEOUT_MS = Number(process.env.DOWNLOAD_LOG_MONITOR_REQUEST_TIMEOUT_MS || 60000);
const MAX_LOG_LINES = Number(process.env.DOWNLOAD_LOG_MONITOR_MAX_LINES || 25000);
const activeLogMonitors = new Map();
const RESERVED_STATUS_KEYS = new Set([
    'workflow',
    'version',
    'runId',
    'job',
    'summary',
    'logState',
    'outputPath',
    'logPath',
    'targetServer',
    'scriptPath',
    'inputFile',
    'addMaxspeedAndTurnlanesToOsm',
    'maxspeedAndTurnlanesPath',
    'status',
    '_id',
    'id',
    'createdAt',
    'updatedAt',
]);

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function cleanVersionString(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value).trim();
    return '';
}

function getRequestedVersion(payload) {
    return cleanVersionString(payload?.version)
        || cleanVersionString(payload?.job?.version)
        || cleanVersionString(payload?.summary?.version)
        || cleanVersionString(payload?.data?.version)
        || cleanVersionString(payload?.data?.job?.version)
        || cleanVersionString(payload?.data?.summary?.version);
}

async function resolveCurrentVersion() {
    const { configs } = await PipelineConfig.findAll({});
    if (!configs || configs.length === 0) return DEFAULT_VERSION;

    const latestConfig = configs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    return cleanString(latestConfig?.version) || DEFAULT_VERSION;
}

async function resolveRequestedVersion(value) {
    return cleanVersionString(value) || resolveCurrentVersion();
}

function normalizeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeTargetServer(value) {
    return normalizeObject(value) || cleanString(value) || null;
}

function normalizeRunLogsTargetServer(value) {
    if (typeof value === 'string') return cleanString(value);

    const server = normalizeObject(value);
    if (!server) return '';

    return cleanString(server.name)
        || cleanString(server.serverName)
        || cleanString(server.host)
        || cleanString(server.ipAddress)
        || cleanString(server.username);
}

function cleanOptionalString(value) {
    const cleaned = cleanString(value);
    return cleaned || null;
}

function cleanOptionalBoolean(value) {
    return typeof value === 'boolean' ? value : null;
}

function buildFullPath(basePath, fileName) {
    if (!basePath || !fileName) return null;

    const cleanedBase = String(basePath).trim().replace(/\\/g, '/').replace(/\/+$/, '');
    const cleanedFile = String(fileName).trim().replace(/\\/g, '/').replace(/^\/+/, '');

    if (!cleanedBase || !cleanedFile) return null;
    return `${cleanedBase}/${cleanedFile}`;
}

function resolveRoutingInputPath(statusDoc) {
    const fullPathFromLogs = findFullOsmFilePathFromLogState(statusDoc?.logState);
    if (fullPathFromLogs) return fullPathFromLogs;

    const rawInputPath = cleanOptionalString(statusDoc?.inputPath);
    const rawInputFile = cleanOptionalString(statusDoc?.inputFile || statusDoc?.job?.inputFile);
    const outputPath = cleanOptionalString(statusDoc?.outputPath || statusDoc?.job?.outputPath);

    // If inputPath is a full path, use it
    if (rawInputPath && (rawInputPath.includes('/') || /^[A-Za-z]:[\/]/.test(rawInputPath))) {
        return rawInputPath;
    }

    // If inputPath is just a filename and we have outputPath, combine them
    if (rawInputPath && outputPath && !rawInputPath.includes('/')) {
        return buildFullPath(outputPath, rawInputPath);
    }

    // If inputFile is available and we have outputPath, combine them
    if (rawInputFile && outputPath && !rawInputFile.includes('/')) {
        return buildFullPath(outputPath, rawInputFile);
    }

    // Fallback to raw values
    return rawInputPath || rawInputFile || null;
}

function getLogLineText(line) {
    if (typeof line === 'string') return line;
    if (!line || typeof line !== 'object') return String(line || '');

    return String(line.message || line.line || line.log || line.text || '');
}

function stripAnsi(value) {
    return String(value || '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function sanitizeLogLine(line) {
    return stripAnsi(line).replace(/\s+/g, ' ').trim();
}

function normalizeLogLines(payload) {
    const body = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
    const record = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const nested = record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : {};
    const candidates = [
        record.logs,
        record.lines,
        record.logLines,
        nested.logs,
        nested.lines,
        Array.isArray(body) ? body : null,
        typeof body === 'string' ? body : null,
    ];
    const raw = candidates.find((candidate) => Array.isArray(candidate) || typeof candidate === 'string');

    if (Array.isArray(raw)) {
        return raw
            .map((item) => getLogLineText(item))
            .join('\n')
            .split(/\r?\n/)
            .map(sanitizeLogLine)
            .filter(Boolean)
            .slice(-MAX_LOG_LINES);
    }

    if (typeof raw === 'string') {
        return raw.split(/\r?\n/).map(sanitizeLogLine).filter(Boolean).slice(-MAX_LOG_LINES);
    }

    if (typeof record.log === 'string') return normalizeLogLines(record.log);
    if (typeof record.message === 'string') return normalizeLogLines(record.message);

    return [];
}

function extractNewOffset(payload, fallbackOffset, lineCount) {
    const body = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
    const record = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const nested = record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : {};
    const nextOffset = Number(record.newOffset ?? nested.newOffset ?? record.offset ?? nested.offset);

    if (Number.isFinite(nextOffset)) return nextOffset;
    return Number(fallbackOffset || 0) + Number(lineCount || 0);
}

function extractLogCompleted(payload, lines) {
    const body = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
    const record = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const nested = record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : {};
    const value = record.completed ?? record.complete ?? record.done ?? record.finished ?? record.isComplete
        ?? nested.completed ?? nested.complete ?? nested.done ?? nested.finished ?? nested.isComplete;

    return value === true || String(value).toLowerCase() === 'true' || hasDownloadCompletedLine({ lines });
}

function normalizeOsmFilePath(rawValue) {
    const cleaned = String(rawValue || '')
        .trim()
        .replace(/['"]/g, '')
        .replace(/\\/g, '/')
        .replace(/\.osm\.pbf\.\d+$/i, '.osm.pbf');
    const urlMatch = cleaned.match(/https?:\/\/[^/]+(\/.*)/i);
    const pathValue = urlMatch ? urlMatch[1] : cleaned;
    const segments = pathValue.split('/').filter(Boolean);
    const fileIndex = segments.findIndex((segment) => segment.toLowerCase().includes('.osm.pbf'));

    if (fileIndex < 0) return null;

    const fileName = segments[fileIndex].replace(/\.osm\.pbf\.\d+$/i, '.osm.pbf');
    const parent = fileIndex === 0 ? null : segments[fileIndex - 1];

    return parent ? `/${parent}/${fileName}` : `/${fileName}`;
}

function extractOsmFilePathFromLog(line) {
    const downloadingMatch = String(line || '').match(/Downloading:\s*(\S+)/i);
    if (downloadingMatch) return normalizeOsmFilePath(downloadingMatch[1]);

    const savedMatch = String(line || '').match(/["']?(.+?\.osm\.pbf(?:\.\d+)?)["']?\s*saved/i);
    if (savedMatch) return normalizeOsmFilePath(savedMatch[1]);

    const anyPathMatch = String(line || '').match(/([\w\-/.]+\.osm\.pbf(?:\.\d+)?)/i);
    if (anyPathMatch) return normalizeOsmFilePath(anyPathMatch[1]);

    return null;
}

function extractFullOsmFilePathFromLogLine(line) {
    const candidate = String(line || '');
    const match = candidate.match(/(?:Downloading:\s*)?(?:["']?)((?:[A-Za-z]:[\/]|\/)?(?:[^"'<>:\s]+[\/])*[^"'<>:\s]+?\.osm\.pbf(?:\.\d+)?)(?:["'])?/i);
    if (!match) return null;
    return match[1].replace(/\.osm\.pbf\.\d+$/i, '.osm.pbf');
}

function findFullOsmFilePathFromLogState(logState) {
    const lines = collectLogLines(logState).reverse();
    for (const line of lines) {
        const filePath = extractFullOsmFilePathFromLogLine(line);
        if (filePath) return filePath;
    }
    return null;
}

function summarizeLogLines(workflow, lines, complete) {
    const completed = new Set();
    const failed = new Set();
    const processing = new Set();

    lines.forEach((line) => {
        const path = extractOsmFilePathFromLog(line);
        if (!path) return;

        if (/\b(saved|completed processing for|successfully downloaded|download complete)\b/i.test(line)) {
            completed.add(path);
            processing.delete(path);
            return;
        }

        if (/\b(failed|error|timeout|timed out|not found|exception)\b/i.test(line)) {
            failed.add(path);
            processing.delete(path);
            return;
        }

        if (/\b(downloading|processing|starting)\b/i.test(line)) {
            processing.add(path);
        }
    });

    failed.forEach((path) => completed.delete(path));
    completed.forEach((path) => processing.delete(path));

    const completedFiles = Array.from(completed).sort();
    const failedFiles = Array.from(failed).sort();
    const processingFiles = Array.from(processing).sort();
    const status = failedFiles.length > 0
        ? 'failed'
        : complete
            ? 'completed'
            : (lines.length > 0 || processingFiles.length > 0)
                ? 'running'
                : 'queued';

    return {
        totalCount: completedFiles.length + failedFiles.length + processingFiles.length,
        completedCount: completedFiles.length,
        failedCount: failedFiles.length,
        processingCount: processingFiles.length,
        pendingCount: 0,
        completedSubRegionCount: 0,
        totalSubRegionCount: 0,
        downloadCompleted: Boolean(complete),
        source: 'remote',
        validatedStatus: status,
        statusFiles: {
            completed: completedFiles,
            failed: failedFiles,
            processing: processingFiles,
            pending: [],
        },
        workflow,
    };
}

function collectLogLines(value) {
    if (!value) return [];
    if (typeof value === 'string') return value.split(/\r?\n/);
    if (Array.isArray(value)) return value.flatMap((entry) => collectLogLines(entry));
    if (typeof value !== 'object') return [String(value)];

    return [
        ...collectLogLines(value.lines),
        ...collectLogLines(value.logs),
        ...collectLogLines(value.logLines),
        ...collectLogLines(value.log),
        ...collectLogLines(value.message),
        getLogLineText(value),
    ].filter(Boolean);
}

function hasDownloadCompletedLine(logState) {
    const lines = collectLogLines(logState);
    return lines.some((line) => /All downloads complete\.\s*Files saved in\s+['"][^'"]+['"]\.?/i.test(String(line || '')));
}

function normalizeSearchTilesStatus(status, summary, logState) {
    if (
        status === 'completed'
        || summary?.validatedStatus === 'completed'
        || summary?.downloadCompleted === true
        || logState?.complete === true
        || hasDownloadCompletedLine(logState)
    ) {
        return 'completed';
    }

    const hasLogLines = Array.isArray(logState?.lines) && logState.lines.length > 0;
    const hasSummaryActivity = Number(summary?.totalCount || 0) > 0
        || Number(summary?.completedCount || 0) > 0
        || Number(summary?.failedCount || 0) > 0
        || Number(summary?.processingCount || 0) > 0
        || Number(summary?.pendingCount || 0) > 0;

    if (hasLogLines || hasSummaryActivity || status === 'completed' || status === 'failed') {
        return 'running';
    }

    return status || null;
}

function isSafeMergeKey(key) {
    return key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
}

function mergeObjects(currentValue, nextValue) {
    const currentObject = normalizeObject(currentValue);
    const nextObject = normalizeObject(nextValue);

    if (!nextObject) return currentObject;
    if (!currentObject) return nextObject;

    const filteredNextObject = Object.fromEntries(
        Object.entries(nextObject).filter(([key, value]) => isSafeMergeKey(key) && value !== undefined && value !== null)
    );

    return {
        ...currentObject,
        ...filteredNextObject,
    };
}

function buildAdditionalTopLevelFields(payload) {
    const entries = Object.entries(payload || {})
        .filter(([key, value]) => !RESERVED_STATUS_KEYS.has(key) && isSafeMergeKey(key) && value !== undefined)
        .map(([key, value]) => {
            const nextObject = normalizeObject(value);
            if (nextObject) {
                return [key, nextObject];
            }

            return [key, value];
        });

    return Object.fromEntries(entries);
}

function extractEmail(value) {
    return cleanString(value?.email || value?.mail || value?.to || value);
}

function collectAdminEmails(adminList) {
    if (!adminList || typeof adminList !== 'object') return [];

    return Array.from(new Set(
        Object.values(adminList)
            .map(extractEmail)
            .filter(Boolean)
    ));
}

async function getNotifyAdminEmails(version) {
    const { configs } = await PipelineConfig.findAll({ version, limit: 1 });
    const versionConfig = configs?.[0] || null;

    if (versionConfig) {
        const emails = collectAdminEmails(versionConfig.adminList);
        if (emails.length > 0) return emails;
    }

    const { configs: latestConfigs } = await PipelineConfig.findAll({ limit: 1 });
    return collectAdminEmails(latestConfigs?.[0]?.adminList);
}

async function sendCompletedStatusMail(statusDoc, version) {
    const webhookUrl = cleanString(config.n8n?.mailAutoWebhookUrl);
    if (!webhookUrl) return;

    let emails = [];
    try {
        emails = await getNotifyAdminEmails(version);
    } catch (error) {
        logger.error('Failed to fetch admin notify list for download completion mail.', {
            version,
            error: error.message,
        });
        return;
    }

    if (emails.length === 0) {
        logger.warn('Skipping download completion mail because notify admin list is empty.', {
            version,
            workflow: cleanString(statusDoc?.workflow) || null,
            runId: cleanString(statusDoc?.runId || statusDoc?.job?.runId) || null,
        });
        return;
    }

    const workflow = cleanString(statusDoc?.workflow) || 'download';
    const runId = cleanString(statusDoc?.runId || statusDoc?.job?.runId);
    const text = `Download status completed for ${workflow}${version ? ` (${version})` : ''}${runId ? `, run ${runId}` : ''}.`;

    await Promise.all(emails.map(async (to) => {
        const payload = {
            to,
            text,
            status: 'Completed',
        };

        try {
            await axios.post(webhookUrl, payload, { timeout: 30000 });
            logger.info('Download completion mail webhook triggered successfully.', {
                to,
                workflow,
                version,
                runId: runId || null,
            });
        } catch (error) {
            logger.error('Failed to trigger download completion mail webhook.', {
                payload,
                error: error.message,
                response: error.response?.data,
            });
        }
    }));
}

async function triggerCompletedWebhook(statusDoc) {
    const webhookUrl = cleanString(config.n8n?.downloadStatusCompletedWebhookUrl);
    if (!webhookUrl) return;

    const workflow = cleanString(statusDoc?.workflow);
    const runId = cleanString(statusDoc?.runId || statusDoc?.job?.runId);
    const scriptPath = cleanOptionalString(statusDoc?.scriptPath || statusDoc?.job?.scriptPath);
    const inputFile = cleanOptionalString(statusDoc?.inputFile || statusDoc?.job?.inputFile);

    if (!workflow || !runId || !scriptPath || !inputFile) {
        logger.warn('Skipping download status completion webhook due to missing payload fields.', {
            workflow: workflow || null,
            runId: runId || null,
            hasScriptPath: Boolean(scriptPath),
            hasInputFile: Boolean(inputFile),
        });
        return;
    }

    const payload = {
        workflow,
        runId,
        scriptPath,
        inputFile,
    };

    try {
        await axios.post(webhookUrl, payload, { timeout: 30000 });
        logger.info('Download completion n8n webhook triggered successfully.', payload);
    } catch (error) {
        logger.error('Failed to trigger download completion n8n webhook.', {
            payload,
            error: error.message,
            response: error.response?.data,
        });
    }
}

async function triggerRoutingAddMaxspeedWebhook(statusDoc) {
    const webhookUrl = cleanString(config.n8n?.maxspeedWebhookUrl);
    if (!webhookUrl) return;

    const workflow = cleanString(statusDoc?.workflow);
    if (workflow !== 'routing') return;

    const addMaxspeedAndTurnlanesToOsm = statusDoc?.addMaxspeedAndTurnlanesToOsm === true
        || statusDoc?.job?.addMaxspeedAndTurnlanesToOsm === true;
    if (!addMaxspeedAndTurnlanesToOsm) return;

    const runId = cleanString(statusDoc?.runId || statusDoc?.job?.runId);
    const maxspeedAndTurnlanesPath = cleanOptionalString(statusDoc?.maxspeedAndTurnlanesPath || statusDoc?.job?.maxspeedAndTurnlanesPath);
    const logPath = cleanOptionalString(statusDoc?.logPath || statusDoc?.job?.logPath);
    const inputPath = resolveRoutingInputPath(statusDoc);

    if (!runId || !maxspeedAndTurnlanesPath || !inputPath || !logPath) {
        logger.warn('Skipping routing addmaxspeed webhook due to missing required payload fields.', {
            workflow,
            runId: runId || null,
            hasMaxspeedAndTurnlanesPath: Boolean(maxspeedAndTurnlanesPath),
            hasInputPath: Boolean(inputPath),
            hasLogPath: Boolean(logPath),
        });
        return;
    }

    const payload = {
        runId,
        maxspeedAndTurnlanesPath,
        inputPath,
        logPath,
    };

    try {
        await axios.post(webhookUrl, payload, { timeout: 30000 });
        logger.info('Routing addmaxspeed n8n webhook triggered successfully.', payload);
    } catch (error) {
        logger.error('Failed to trigger routing addmaxspeed n8n webhook.', {
            payload,
            error: error.message,
            response: error.response?.data,
        });
    }
}

async function persistStatusUpdate(payload, updatedBy) {
    const workflow = cleanString(payload.workflow);

    if (!ALLOWED_WORKFLOWS.has(workflow)) {
        return { error: 'workflow must be searchTiles or routing.' };
    }

    const requestedVersion = getRequestedVersion(payload);
    const version = await resolveRequestedVersion(requestedVersion);
    const incomingTargetServer = normalizeTargetServer(payload.targetServer);
    const incomingAddMaxspeedAndTurnlanesToOsm = cleanOptionalBoolean(payload.addMaxspeedAndTurnlanesToOsm);
    const incomingMaxspeedAndTurnlanesPath = cleanOptionalString(payload.maxspeedAndTurnlanesPath);
    const incomingJob = mergeObjects(normalizeObject(payload.job), {
        outputPath: cleanOptionalString(payload.outputPath),
        logPath: cleanOptionalString(payload.logPath),
        scriptPath: cleanOptionalString(payload.scriptPath),
        inputFile: cleanOptionalString(payload.inputFile),
        targetServer: incomingTargetServer,
        addMaxspeedAndTurnlanesToOsm: incomingAddMaxspeedAndTurnlanesToOsm,
        maxspeedAndTurnlanesPath: incomingMaxspeedAndTurnlanesPath,
    });
    const incomingSummary = normalizeObject(payload.summary);
    const incomingLogState = normalizeObject(payload.logState);
    const incomingScriptPath = cleanOptionalString(payload.scriptPath || incomingJob?.scriptPath);
    const incomingInputFile = cleanOptionalString(payload.inputFile || incomingJob?.inputFile);
    const incomingRunId = cleanString(payload.runId || incomingJob?.runId);
    const existingStatus = await VersionedDownloadStatus.findByWorkflow(version, workflow, incomingRunId);
    const additionalTopLevelFields = buildAdditionalTopLevelFields(payload);
    const previousStatus = cleanString(existingStatus?.status || existingStatus?.summary?.validatedStatus || existingStatus?.job?.status);

    logger.info('Download status payload received.', {
        source: updatedBy || 'unknown',
        workflow,
        version,
        requestedVersion: requestedVersion || null,
        collectionName: VersionedDownloadStatus.collectionNameForVersion(version),
        runId: incomingRunId || null,
        hasJob: Boolean(incomingJob),
        hasSummary: Boolean(incomingSummary),
        hasLogState: Boolean(incomingLogState),
        payloadKeys: Object.keys(payload || {}),
    });

    const mergedJob = mergeObjects(existingStatus?.job, incomingJob);
    const mergedSummary = mergeObjects(existingStatus?.summary, incomingSummary);
    const mergedLogState = mergeObjects(existingStatus?.logState, incomingLogState);
    const runId = incomingRunId || cleanString(existingStatus?.runId) || cleanString(mergedJob?.runId);
    const scriptPath = incomingScriptPath || cleanOptionalString(existingStatus?.scriptPath) || cleanOptionalString(mergedJob?.scriptPath);
    const inputFile = incomingInputFile || cleanOptionalString(existingStatus?.inputFile) || cleanOptionalString(mergedJob?.inputFile);
    const outputPath = cleanOptionalString(payload.outputPath) || cleanOptionalString(existingStatus?.outputPath) || cleanOptionalString(mergedJob?.outputPath);
    const logPath = cleanOptionalString(payload.logPath) || cleanOptionalString(existingStatus?.logPath) || cleanOptionalString(mergedJob?.logPath);
    const targetServer = incomingTargetServer || normalizeTargetServer(existingStatus?.targetServer) || normalizeTargetServer(mergedJob?.targetServer);
    const addMaxspeedAndTurnlanesToOsm = incomingAddMaxspeedAndTurnlanesToOsm ?? existingStatus?.addMaxspeedAndTurnlanesToOsm ?? mergedJob?.addMaxspeedAndTurnlanesToOsm ?? null;
    const maxspeedAndTurnlanesPath = incomingMaxspeedAndTurnlanesPath || cleanOptionalString(existingStatus?.maxspeedAndTurnlanesPath) || cleanOptionalString(mergedJob?.maxspeedAndTurnlanesPath);
    const requestedStatus = cleanString(payload.status || incomingSummary?.validatedStatus || incomingJob?.status)
        || cleanString(existingStatus?.status || existingStatus?.summary?.validatedStatus || existingStatus?.job?.status)
        || null;
    const status = workflow === 'searchTiles'
        ? normalizeSearchTilesStatus(requestedStatus, mergedSummary, mergedLogState)
        : requestedStatus;
    const finalSummary = mergedSummary && workflow === 'searchTiles'
        ? { ...mergedSummary, validatedStatus: status }
        : mergedSummary;

    const saveResult = await VersionedDownloadStatus.upsertByWorkflow(version, workflow, {
        runId: runId || null,
        job: mergedJob,
        summary: finalSummary,
        logState: mergedLogState,
        outputPath,
        logPath,
        targetServer,
        scriptPath,
        inputFile,
        addMaxspeedAndTurnlanesToOsm,
        maxspeedAndTurnlanesPath,
        status,
        ...additionalTopLevelFields,
    });
    const savedStatus = saveResult?.workflowStatus || null;
    const savedDocument = saveResult?.document || null;

    logger.info('Download status saved.', {
        source: updatedBy || 'unknown',
        workflow,
        version,
        runId: runId || null,
        status,
        savedStatusId: savedDocument?.id || null,
        savedStatusKeys: savedStatus ? Object.keys(savedStatus) : [],
        savedDocumentKeys: savedDocument ? Object.keys(savedDocument) : [],
    });

    if (status === 'completed' && previousStatus !== 'completed') {
        await triggerCompletedWebhook(savedStatus);
        await sendCompletedStatusMail(savedStatus, version);
        await triggerRoutingAddMaxspeedWebhook(savedStatus);
    }

    logger.audit('DOWNLOAD_STATUS_UPSERTED', {
        workflow,
        version,
        runId: runId || null,
        updatedBy: updatedBy || null,
    });

    return {
        version,
        status: savedStatus,
        document: savedDocument,
    };
}

function buildRunLogsPayload(payload, offset) {
    const targetServer = normalizeRunLogsTargetServer(payload.targetServer)
        || normalizeRunLogsTargetServer(payload.job?.targetServer);
    const sId = cleanString(payload.sId || payload.job?.sId || payload.runId || payload.job?.runId);
    const logPath = cleanString(payload.logPath || payload.job?.logPath);

    return {
        targetServer,
        sId,
        offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
        logPath,
    };
}

async function fetchAndPersistRunLogs(payload, updatedBy) {
    const webhookUrl = cleanString(config.n8n?.runIdLogsWebhookUrl);
    if (!webhookUrl) return { error: 'N8N_RUN_ID_LOGS_WEBHOOK_URL is not configured.' };

    const workflow = cleanString(payload.workflow);
    if (!ALLOWED_WORKFLOWS.has(workflow)) return { error: 'workflow must be searchTiles or routing.' };

    const runLogsPayload = buildRunLogsPayload(payload, payload.offset);
    if (!runLogsPayload.targetServer || !runLogsPayload.sId || !runLogsPayload.logPath) {
        return { error: 'targetServer, sId, and logPath are required to monitor logs.' };
    }

    logger.info('Calling runId-logs webhook for download monitor.', {
        workflow,
        runId: cleanString(payload.runId || payload.job?.runId || runLogsPayload.sId),
        sId: runLogsPayload.sId,
        offset: runLogsPayload.offset,
        logPath: runLogsPayload.logPath,
        targetServer: typeof runLogsPayload.targetServer === 'string'
            ? runLogsPayload.targetServer
            : runLogsPayload.targetServer?.name || runLogsPayload.targetServer?.host || null,
    });

    const response = await axios.post(webhookUrl, runLogsPayload, { timeout: LOG_MONITOR_REQUEST_TIMEOUT_MS });
    const lines = normalizeLogLines(response.data);
    const complete = extractLogCompleted(response.data, lines);
    const nextOffset = extractNewOffset(response.data, runLogsPayload.offset, lines.length);
    const previousLines = Array.isArray(payload.previousLines) ? payload.previousLines : [];
    const mergedLines = [...previousLines, ...lines].slice(-MAX_LOG_LINES);
    const summary = summarizeLogLines(workflow, mergedLines, complete);

    logger.info('runId-logs webhook response processed for download monitor.', {
        workflow,
        runId: cleanString(payload.runId || payload.job?.runId || runLogsPayload.sId),
        sId: runLogsPayload.sId,
        requestedOffset: runLogsPayload.offset,
        nextOffset,
        fetchedLineCount: lines.length,
        mergedLineCount: mergedLines.length,
        completedLineFound: hasDownloadCompletedLine({ lines: mergedLines }),
        complete,
        status: summary.validatedStatus,
        lastLine: mergedLines[mergedLines.length - 1] || null,
    });

    const result = await persistStatusUpdate({
        ...payload,
        runId: cleanString(payload.runId || payload.job?.runId || runLogsPayload.sId),
        sId: runLogsPayload.sId,
        logPath: runLogsPayload.logPath,
        targetServer: runLogsPayload.targetServer,
        status: summary.validatedStatus,
        summary,
        logState: {
            lines: mergedLines,
            complete,
            offset: nextOffset,
            source: 'remote',
        },
    }, updatedBy);

    return {
        result,
        lines: mergedLines,
        offset: nextOffset,
        complete,
        status: summary.validatedStatus,
    };
}

function startRunLogMonitor(payload, updatedBy) {
    const workflow = cleanString(payload.workflow);
    const requestedVersion = getRequestedVersion(payload) || DEFAULT_VERSION;
    const runId = cleanString(payload.runId || payload.job?.runId || payload.sId || payload.job?.sId);
    const monitorKey = [requestedVersion, workflow, runId].join(':');

    if (activeLogMonitors.has(monitorKey)) {
        return { monitorKey, alreadyRunning: true };
    }

    const state = {
        payload: { ...payload },
        startedAt: Date.now(),
        stopped: false,
        timer: null,
    };

    const stop = () => {
        state.stopped = true;
        if (state.timer) clearTimeout(state.timer);
        activeLogMonitors.delete(monitorKey);
    };

    const tick = async () => {
        if (state.stopped) return;

        try {
            const monitorResult = await fetchAndPersistRunLogs(state.payload, updatedBy);
            if (monitorResult.error) {
                logger.warn('Download log monitor skipped.', { monitorKey, error: monitorResult.error });
                stop();
                return;
            }

            state.payload = {
                ...state.payload,
                offset: monitorResult.offset,
                previousLines: monitorResult.lines,
            };

            if (monitorResult.complete || monitorResult.status === 'completed' || Date.now() - state.startedAt >= LOG_MONITOR_MAX_DURATION_MS) {
                stop();
                return;
            }
        } catch (error) {
            logger.error('Download log monitor failed to fetch logs.', {
                monitorKey,
                error: error.message,
                response: error.response?.data,
            });
        }

        if (!state.stopped) state.timer = setTimeout(tick, LOG_MONITOR_INTERVAL_MS);
    };

    activeLogMonitors.set(monitorKey, state);
    setTimeout(tick, 0);

    return { monitorKey, alreadyRunning: false };
}

class DownloadStatusController {
    static upsertStatus = asyncHandler(async (req, res) => {
        const result = await persistStatusUpdate(req.body || {}, req.user?.id);
        if (result.error) return ApiResponse.error(res, 400, result.error);

        return ApiResponse.success(res, 200, 'Download status stored.', result);
    });

    static upsertStatusFromN8n = asyncHandler(async (req, res) => {
        const result = await persistStatusUpdate(req.body || {}, 'n8n');
        if (result.error) return ApiResponse.error(res, 400, result.error);

        logger.info('Sending n8n download status response.', {
            workflow: result.status?.workflow || null,
            runId: result.status?.runId || null,
            responseKeys: result.document ? Object.keys(result.document) : [],
            responseBody: result.document,
        });

        return res.status(200).json(result.document || result.status);
    });

    static getStatuses = asyncHandler(async (req, res) => {
        const version = await resolveRequestedVersion(req.query.version);
        const statuses = await VersionedDownloadStatus.findAll(version);

        return ApiResponse.success(res, 200, 'Download statuses fetched.', {
            version,
            statuses,
        });
    });

    static getLatestDocument = asyncHandler(async (_req, res) => {
        const latest = await VersionedDownloadStatus.findLatestDocument();

        if (!latest) {
            return ApiResponse.success(res, 200, 'No download status documents found.', {
                latest: null,
            });
        }

        return ApiResponse.success(res, 200, 'Latest download status document fetched.', latest);
    });

    static getLatestDocumentForN8n = asyncHandler(async (_req, res) => {
        const latest = await VersionedDownloadStatus.findLatestDocument();
        return res.status(200).json(latest || null);
    });

    static monitorRunLogs = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const workflow = cleanString(payload.workflow);

        if (!ALLOWED_WORKFLOWS.has(workflow)) {
            return ApiResponse.error(res, 400, 'workflow must be searchTiles or routing.');
        }

        const monitor = startRunLogMonitor(payload, req.user?.id || 'frontend');

        return ApiResponse.success(res, 202, monitor.alreadyRunning ? 'Download log monitor already running.' : 'Download log monitor started.', monitor);
    });
}

module.exports = DownloadStatusController;
