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

function cleanOptionalString(value) {
    const cleaned = cleanString(value);
    return cleaned || null;
}

function cleanOptionalBoolean(value) {
    return typeof value === 'boolean' ? value : null;
}

function getLogLineText(line) {
    if (typeof line === 'string') return line;
    if (!line || typeof line !== 'object') return String(line || '');

    return String(line.message || line.line || line.log || line.text || '');
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
    if (hasDownloadCompletedLine(logState)) return 'completed';

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
    const webhookUrl = cleanString(config.n8n?.routingAddMaxspeedWebhookUrl);
    if (!webhookUrl) return;

    const workflow = cleanString(statusDoc?.workflow);
    if (workflow !== 'routing') return;

    const runId = cleanString(statusDoc?.runId || statusDoc?.job?.runId);
    const downloadLocation = cleanOptionalString(statusDoc?.outputPath || statusDoc?.job?.outputPath);

    if (!downloadLocation) {
        logger.warn('Skipping routing addmaxspeed webhook due to missing download location.', {
            workflow,
            runId: runId || null,
        });
        return;
    }

    const payload = {
        workflow,
        runId: runId || null,
        downloadLocation,
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
    const incomingTargetServer = normalizeObject(payload.targetServer);
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
    const targetServer = incomingTargetServer || normalizeObject(existingStatus?.targetServer) || normalizeObject(mergedJob?.targetServer);
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
}

module.exports = DownloadStatusController;
