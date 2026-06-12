'use strict';

const axios = require('axios');
const ApiResponse = require('../../utils/ApiResponse');
const DataPipelineRun = require('../models/DataPipelineRun');
const PipelineConfig = require('../models/PipelineConfig');
const logger = require('../../logs_/logger');
const config = require('../config');

const MULTIPART_LOG_MONITOR_INTERVAL_MS = Number(process.env.MULTIPART_LOG_MONITOR_INTERVAL_MS || 3000);
const MULTIPART_LOG_MONITOR_MAX_DURATION_MS = Number(process.env.MULTIPART_LOG_MONITOR_MAX_DURATION_MS || 6 * 60 * 60 * 1000);
const activeMultipartLogMonitors = new Map();

function getLogLineText(line) {
    if (typeof line === 'string') return line;
    if (!line || typeof line !== 'object') return String(line || '');

    return String(line.message || line.line || line.log || line.text || '');
}

function stripAnsi(value) {
    /* eslint-disable-next-line no-control-regex */
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
            .filter(Boolean);
    }

    if (typeof raw === 'string') {
        return raw.split(/\r?\n/).map(sanitizeLogLine).filter(Boolean);
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

function collectAdminEmails(adminList) {
    if (!adminList || typeof adminList !== 'object') return [];
    return Array.from(new Set(
        Object.values(adminList)
            .map((item) => {
                if (typeof item === 'string') return item.trim();
                return item?.email || item?.mail || item?.to || '';
            })
            .filter(Boolean)
    ));
}

class MultipartController {
    static startMultipart = async (req, res) => {
        try {
            const { targetServer, sId, inputPath, multithreadscriptpath, multithreadoutputpath, logPath, parentRunId } = req.body;

            if (!sId) {
                return ApiResponse.error(res, 400, 'sId (runId) is required.');
            }

            const targetRunId = parentRunId || sId;

            // Find if parent run exists in data_pipeline_runs
            let existingDoc = await DataPipelineRun.findByRunId(targetRunId);
            if (!existingDoc) {
                existingDoc = await DataPipelineRun.collection.findOne({ 'services.routing.sId': sId });
            }

            const now = new Date().toISOString();
            const updateObj = {
                updatedAt: now,
                'services.routing.service': 'routing',
                'services.routing.sId': sId,
                'services.routing.status': 'running',
                'services.routing.log': '',
                'services.routing.logState': {
                    lines: [],
                    offset: 0,
                    source: 'remote',
                },
                'services.routing.targetServer': targetServer,
                'services.routing.inputPath': inputPath,
                'services.routing.multithreadscriptpath': multithreadscriptpath,
                'services.routing.multithreadoutputpath': multithreadoutputpath,
                'services.routing.logPath': logPath,
                'services.routing.updatedAt': now,
                'routingStatus': 'running',
            };

            // Update/Upsert the data_pipeline_runs document
            const savedRaw = await DataPipelineRun.collection.findOneAndUpdate(
                { runId: existingDoc?.runId || targetRunId },
                {
                    $set: updateObj,
                    $addToSet: { servicesList: 'routing' },
                    $setOnInsert: {
                        runId: existingDoc?.runId || targetRunId,
                        createdAt: now,
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );

            const savedDoc = savedRaw && savedRaw.value ? savedRaw.value : savedRaw;

            // Triggering the external webhook is now handled directly from the frontend.
            logger.info('Multipart webhook trigger bypassed in backend (delegated to frontend).', { sId });

            // Start log polling in the background
            MultipartController.startLogMonitor({
                sId,
                targetServer,
                logPath,
                parentRunId: savedDoc?.runId || targetRunId,
            });

            return ApiResponse.success(res, 200, 'Multipart process started.', DataPipelineRun.toResponse(savedDoc));
        } catch (err) {
            logger.error('Multipart start error:', err.message);
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static getStatus = async (req, res) => {
        try {
            const { sId } = req.params;

            let doc = await DataPipelineRun.collection.findOne({ 'services.routing.sId': sId });
            if (!doc) {
                doc = await DataPipelineRun.findByRunId(sId);
            }

            if (!doc) {
                return ApiResponse.error(res, 404, 'Multipart run not found.');
            }

            const routingService = doc.services?.routing || {};
            const status = routingService.status || 'unknown';

            // If status is running in DB but no active log monitor is in memory, resume it!
            if (status === 'running' && sId && !activeMultipartLogMonitors.has(sId)) {
                logger.info(`Resuming log monitor for ${sId} on getStatus check.`);
                MultipartController.startLogMonitor({
                    sId,
                    targetServer: routingService.targetServer,
                    logPath: routingService.logPath,
                    parentRunId: doc.runId,
                });
            }

            const responseData = {
                runId: doc.runId,
                sId: routingService.sId || sId,
                status,
                logs: routingService.log || '',
                offset: routingService.logState?.offset || 0,
                updatedAt: doc.updatedAt,
            };

            return ApiResponse.success(res, 200, 'Multipart run status fetched.', responseData);
        } catch (err) {
            logger.error('Multipart getStatus error:', err.message);
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static stopMultipart = async (req, res) => {
        try {
            const { sId } = req.params;

            // Stop background monitor if running in memory
            if (activeMultipartLogMonitors.has(sId)) {
                const state = activeMultipartLogMonitors.get(sId);
                state.stopped = true;
                if (state.timer) clearTimeout(state.timer);
                activeMultipartLogMonitors.delete(sId);
                logger.info(`Stopped multipart log monitor for ${sId} via API request.`);
            }

            // Find matching data pipeline run document in DB
            let doc = await DataPipelineRun.collection.findOne({ 'services.routing.sId': sId });
            if (!doc) {
                doc = await DataPipelineRun.findByRunId(sId);
            }

            if (!doc) {
                return ApiResponse.error(res, 404, 'Multipart run not found.');
            }

            const parentRunId = doc.runId;
            const now = new Date().toISOString();

            // Mark routing service status as failed so it stops polling and stops displaying as running
            await DataPipelineRun.collection.findOneAndUpdate(
                { runId: parentRunId },
                {
                    $set: {
                        updatedAt: now,
                        'services.routing.status': 'failed',
                        'routingStatus': 'failed',
                    }
                }
            );

            return ApiResponse.success(res, 200, 'Multipart process stopped successfully.');
        } catch (err) {
            logger.error('Multipart stop error:', err.message);
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static monitorMultipartLogs = async (req, res) => {
        try {
            const { sId, targetServer, logPath, parentRunId } = req.body;
            if (!sId) {
                return ApiResponse.error(res, 400, 'sId is required.');
            }

            MultipartController.startLogMonitor({ sId, targetServer, logPath, parentRunId });
            return ApiResponse.success(res, 202, 'Multipart log monitor started/resumed.');
        } catch (err) {
            logger.error('Multipart monitorMultipartLogs error:', err.message);
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static startLogMonitor = (payload) => {
        const { sId, targetServer, logPath, parentRunId } = payload;
        const monitorKey = sId;

        if (activeMultipartLogMonitors.has(monitorKey)) {
            return;
        }

        const state = {
            sId,
            targetServer,
            logPath,
            parentRunId,
            offset: 0,
            previousLines: [],
            startedAt: Date.now(),
            stopped: false,
            timer: null,
        };

        const stop = () => {
            state.stopped = true;
            if (state.timer) clearTimeout(state.timer);
            activeMultipartLogMonitors.delete(monitorKey);
        };

        const tick = async () => {
            if (state.stopped) return;

            try {
                const monitorResult = await MultipartController.fetchAndPersistLogs(state);
                state.offset = monitorResult.offset;
                state.previousLines = monitorResult.lines;

                if (['success', 'failed'].includes(monitorResult.status) || Date.now() - state.startedAt >= MULTIPART_LOG_MONITOR_MAX_DURATION_MS) {
                    logger.info(`Stopping multipart log monitor for ${sId}. Status: ${monitorResult.status}`);
                    stop();
                    return;
                }
            } catch (error) {
                logger.error('Multipart log monitor failed to fetch logs.', {
                    sId,
                    error: error.message,
                });
            }

            if (!state.stopped) {
                state.timer = setTimeout(tick, MULTIPART_LOG_MONITOR_INTERVAL_MS);
            }
        };

        activeMultipartLogMonitors.set(monitorKey, state);
        setTimeout(tick, 0);
    };

    static fetchAndPersistLogs = async (state) => {
        const { sId, targetServer, logPath, parentRunId, offset, previousLines } = state;
        const webhookUrl = config.n8n.runIdLogsWebhookUrl;

        if (!webhookUrl) {
            throw new Error('N8N_RUN_ID_LOGS_WEBHOOK_URL is not configured.');
        }

        logger.info('Calling runId-logs webhook for multipart routing monitor.', {
            runId: parentRunId,
            sId,
            offset,
            logPath,
            targetServer,
        });

        const response = await axios.post(webhookUrl, {
            targetServer,
            sId,
            offset,
            logPath,
        }, { timeout: 60000 });

        const newLines = normalizeLogLines(response.data);
        const mergedLines = [...previousLines, ...newLines];
        const nextOffset = extractNewOffset(response.data, offset, newLines.length);

        // Determine status: look for keyword "All countries have been processed successfully."
        let status = 'running';
        const hasSuccessWord = mergedLines.some((line) => line.includes('All countries have been processed successfully.'));
        const hasError = mergedLines.some((line) => /NewConnectionError|ConnectionError|MaxRetryError|NetworkError|Connection timed out|Connection|Traceback|Exception|ValueError|TypeError|KeyError|AttributeError|ReadTimeout|ConnectTimeout|TimeoutError|BrokenPipeError/i.test(line));

        if (hasSuccessWord) {
            status = 'success';
        } else if (hasError) {
            status = 'failed';
        }

        const logText = mergedLines.join('\n');
        const now = new Date().toISOString();

        // Update database
        await DataPipelineRun.collection.findOneAndUpdate(
            { runId: parentRunId },
            {
                $set: {
                    updatedAt: now,
                    'services.routing.status': status,
                    'services.routing.log': logText,
                    'services.routing.logState': {
                        lines: mergedLines,
                        offset: nextOffset,
                        source: 'remote',
                    },
                    'routingStatus': status,
                }
            }
        );

        if (['success', 'failed'].includes(status)) {
            await MultipartController.sendEmailNotification(sId, targetServer, status);
        }

        return {
            lines: mergedLines,
            offset: nextOffset,
            status,
        };
    };

    static sendEmailNotification = async (sId, targetServer, status) => {
        const webhookUrl = config.n8n.mailAutoWebhookUrl;
        if (!webhookUrl) {
            logger.warn('Skipping email notification because N8N_MAIL_AUTO_WEBHOOK_URL is not configured.');
            return;
        }

        let emails = [];
        try {
            const { configs } = await PipelineConfig.findAll({ limit: 1 });
            const latestConfig = configs?.[0];
            if (latestConfig) {
                emails = collectAdminEmails(latestConfig.adminList);
            }
        } catch (error) {
            logger.error('Failed to fetch admin list for multipart notification email.', { sId, error: error.message });
            return;
        }

        if (emails.length === 0) {
            logger.warn('Skipping multipart notification email because notify admin list is empty.', { sId });
            return;
        }

        const statusLabel = status === 'success' ? 'Success' : 'Failed';
        const text = `Multipart multithread routing process completed with status: ${statusLabel}. sId: ${sId}, server: ${targetServer}.`;
        const subject = `${sId} - Multipart Multithread - ${targetServer}`;

        await Promise.all(emails.map(async (to) => {
            const payload = {
                to,
                text,
                status: statusLabel,
                subject,
            };

            try {
                await axios.post(webhookUrl, payload, { timeout: 30000 });
                logger.info('Multipart status mail webhook triggered successfully.', { to, sId, status });
            } catch (error) {
                logger.error('Failed to trigger multipart status mail webhook.', {
                    payload,
                    error: error.message,
                });
            }
        }));
    };
}

module.exports = MultipartController;
