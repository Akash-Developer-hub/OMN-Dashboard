'use strict';

const express = require('express');
const router = express.Router();
const MultipartController = require('../controllers/multipartController');

/**
 * POST /api/v1/admin-dashboard/multipart/start
 * Body: { targetServer, sId, inputPath, multithreadscriptpath, multithreadoutputpath, logPath, parentRunId }
 */
router.post('/start', MultipartController.startMultipart);

/**
 * GET /api/v1/admin-dashboard/multipart/status/:sId
 */
router.get('/status/:sId', MultipartController.getStatus);

/**
 * POST /api/v1/admin-dashboard/multipart/monitor-logs
 */
router.post('/monitor-logs', MultipartController.monitorMultipartLogs);

module.exports = router;
