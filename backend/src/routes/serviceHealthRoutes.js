'use strict';

const express = require('express');
const ServiceHealthController = require('../controllers/serviceHealthController');

const router = express.Router();

/**
 * GET /api/v1/admin-dashboard/service-health
 * Fetch live PM2 service health status.
 */
router.get('/', ServiceHealthController.getServiceHealth);

router.post('/check', ServiceHealthController.checkService);
router.post('/check-all', ServiceHealthController.checkAllServices);
router.post('/restart', ServiceHealthController.restartService);
router.post('/stop', ServiceHealthController.stopService);
router.post('/configure', ServiceHealthController.saveConfiguration);
router.get('/configurations', ServiceHealthController.getConfigurationList);
router.get('/pm2-names', ServiceHealthController.getPm2ServiceNames);
router.get('/response-time-trends', ServiceHealthController.getResponseTimeTrends);
router.post('/editServiceName', ServiceHealthController.editServiceName);
router.post('/deleteService', ServiceHealthController.deleteService);
router.post('/test-alert', ServiceHealthController.testAlert);
module.exports = router;