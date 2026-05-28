'use strict';

const express = require('express');
const router = express.Router();
const ContributionGenerationController = require('../controllers/contributionGenerationController');

/**
 * GET /api/v1/admin-dashboard/contribution-generation
 */
router.get('/', ContributionGenerationController.getHistory);
router.get('/config', ContributionGenerationController.getConfig);
router.post('/config', ContributionGenerationController.updateConfig);
router.post('/create-doc', ContributionGenerationController.createGenDoc);
router.post('/mark-live', ContributionGenerationController.markGenerationLive);
router.post('/', ContributionGenerationController.startGeneration);

module.exports = router;
