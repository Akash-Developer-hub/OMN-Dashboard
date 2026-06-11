'use strict';

const express = require('express');
const router = express.Router();
const DataPipelineController = require('../controllers/dataPipelineController');

/**
 * POST /api/v1/admin-dashboard/data-pipeline
 * Body: full pipeline payload (must include runId)
 */
router.post('/', DataPipelineController.createRun);

/**
 * PATCH /api/v1/admin-dashboard/data-pipeline/update
 * Body: { runId, sId, service, routingStatus, routingLog, ... }
 * Updates service status/logs for existing or new run
 */
router.patch('/update', DataPipelineController.updateServiceRun);

/**
 * PATCH /api/v1/admin-dashboard/data-pipeline/update-results
 * Body: { result: [ ... ] } or an array of such objects
 * Stores pipeline generation results against the matching runId
 */
router.patch('/update-results', DataPipelineController.updateResults);

/**
 * POST /api/v1/admin-dashboard/data-pipeline/monitor-logs
 * Body: { runId, service, targetServer, sId, logPath, offset? }
 * Starts backend polling of n8n runId logs and updates service status.
 */
router.post('/monitor-logs', DataPipelineController.monitorRunLogs);

/**
 * GET /api/v1/admin-dashboard/data-pipeline
 * ?runId=... or ?limit=...
 */
router.get('/getdataPipeline', DataPipelineController.getRuns);

/**
 * GET /api/v1/admin-dashboard/data-pipeline/fetch-pipeline
 * Query: ?runId=run_xxx (specific) or ?limit=20&offset=0 (all with pagination)
 * Returns: services, servicesList, sshSuccess, sshStatus
 */
router.get('/fetch-pipeline', DataPipelineController.fetchPipeline);

/**
 * GET /api/v1/admin-dashboard/data-pipeline/fetch-transfers
 * Query: ?runId=run_xxx (required), ?limit=20&offset=0
 * Returns: Transfer data + related pipeline run data
 */
router.get('/fetch-transfers', DataPipelineController.fetchTransfers);

/**
 * PATCH /api/v1/admin-dashboard/data-pipeline/transfer-files
 * Body: { runId, transfers: [ { service, fileName, basePath, from, to, status, ... } ] }
 * Updates services with file transfer information
 */
router.patch('/transfer-files', DataPipelineController.transferFiles);

/**
 * PATCH /api/v1/admin-dashboard/data-pipeline/service-status
 * Body: { runId, service, status, ... } or { runId, statuses: [ { service, status, ... } ] }
 * Updates service status(es) without file transfer details
 */
router.patch('/service-status', DataPipelineController.updateServiceStatus);

module.exports = router;
