'use strict';

const express = require('express');
const router = express.Router();
const DownloadStatusController = require('../controllers/downloadStatusController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validateN8nApiKey = require('../../middlewares/validateN8nApiKey');

router.post('/n8n', validateN8nApiKey, DownloadStatusController.upsertStatusFromN8n);
router.get('/latest/n8n', validateN8nApiKey, DownloadStatusController.getLatestDocumentForN8n);

router.use(authenticate, authorize('admin', 'superadmin', 'vendor'));

router.get('/latest', DownloadStatusController.getLatestDocument);
router.get('/', DownloadStatusController.getStatuses);
router.put('/', DownloadStatusController.upsertStatus);

module.exports = router;