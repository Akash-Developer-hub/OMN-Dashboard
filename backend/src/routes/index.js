'use strict';

const express = require('express');
const router = express.Router();

// ── Admin Dashboard sub-routes ────────────────────────────
const categoryConfigRoutes = require('./categoryConfigRoutes');
const homeScreenConfigRoutes = require('./homeScreenConfigRoutes');
const serverRoutes = require('./serverRoutes');
const generationRoutes = require('./generationRoutes');
const dataPipelineRoutes = require('./dataPipelineRoutes');
const pipelineConfigRoutes = require('./pipelineConfigRoutes');
const downloadStatusRoutes = require('./downloadStatusRoutes');
const adminDashboardAuthRoutes = require('./adminDashboardAuthRoutes');
const adminDashboardUserRoutes = require('./adminDashboardUserRoutes');
const contributionRoutes = require('./contributionRoutes');
const contributionGenerationRoutes = require('./contributionGenerationRoutes');
const roleRoutes = require('./roleRoutes');
const validationRoutes = require('./validationRoutes');
const serviceHealthRoutes = require('./serviceHealthRoutes');
const multipartRoutes = require('./multipartRoutes');

router.use('/auth', adminDashboardAuthRoutes);
router.use('/users', adminDashboardUserRoutes);
router.use('/roles', roleRoutes);
router.use('/service-accounts', require('./serviceAccountRoutes'));
router.use('/contributors', contributionRoutes);
router.use('/contribution-generation', contributionGenerationRoutes);
router.use('/category-config', categoryConfigRoutes);
router.use('/home-screen-config', homeScreenConfigRoutes);
router.use('/servers', serverRoutes);
router.use('/generations', generationRoutes);
router.use('/data-pipeline', dataPipelineRoutes);
router.use('/pipeline-config', pipelineConfigRoutes);
router.use('/download-status', downloadStatusRoutes);
router.use('/validation', validationRoutes);
router.use('/service-health', serviceHealthRoutes);
router.use('/multipart', multipartRoutes);

module.exports = router;

