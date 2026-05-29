'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../logs_/logger');
const PipelineConfig = require('../models/PipelineConfig');
const VersionedDownloadStatus = require('../models/VersionedDownloadStatus');

const DEFAULT_VERSION = 'v1.0';
const ALLOWED_WORKFLOWS = new Set(['searchTiles', 'routing']);

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

async function resolveCurrentVersion() {
    const { configs } = await PipelineConfig.findAll({});
    if (!configs || configs.length === 0) return DEFAULT_VERSION;

    const latestConfig = configs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    return cleanString(latestConfig?.version) || DEFAULT_VERSION;
}

async function resolveRequestedVersion(value) {
    return cleanString(value) || resolveCurrentVersion();
}

function normalizeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

class DownloadStatusController {
    static upsertStatus = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const workflow = cleanString(payload.workflow);

        if (!ALLOWED_WORKFLOWS.has(workflow)) {
            return ApiResponse.error(res, 400, 'workflow must be searchTiles or routing.');
        }

        const version = await resolveRequestedVersion(payload.version);
        const job = normalizeObject(payload.job);
        const summary = normalizeObject(payload.summary);
        const logState = normalizeObject(payload.logState);
        const runId = cleanString(payload.runId || job?.runId);

        const savedStatus = await VersionedDownloadStatus.upsertByWorkflow(version, workflow, {
            runId: runId || null,
            job,
            summary,
            logState,
            status: cleanString(payload.status || summary?.validatedStatus || job?.status) || null,
        });

        logger.audit('DOWNLOAD_STATUS_UPSERTED', {
            workflow,
            version,
            runId: runId || null,
            updatedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Download status stored.', {
            version,
            status: savedStatus,
        });
    });

    static getStatuses = asyncHandler(async (req, res) => {
        const version = await resolveRequestedVersion(req.query.version);
        const statuses = await VersionedDownloadStatus.findAll(version);

        return ApiResponse.success(res, 200, 'Download statuses fetched.', {
            version,
            statuses,
        });
    });
}

module.exports = DownloadStatusController;