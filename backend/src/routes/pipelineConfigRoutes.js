'use strict';

const express = require('express');
const router = express.Router();
const PipelineConfigController = require('../controllers/pipelineConfigController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validateN8nApiKey = require('../../middlewares/validateN8nApiKey');



/**
 * @route POST /pipeline-config/notify-list
 * @desc Get a list of users to notify for pipeline events
 * @access n8n service (x-n8n-api-key header) — bypasses JWT auth
 */
router.get('/notify-list/:version', validateN8nApiKey, PipelineConfigController.getNotifyList);

// Apply authentication & authorization to all routes below
router.use(authenticate, authorize('admin', 'superadmin', 'vendor'));

/**
 * @route POST /pipeline-config/add
 * @desc Add a new pipeline configuration
 */
router.post('/add', PipelineConfigController.createConfig);

/**
 * @route POST /pipeline-config/remove
 * @desc Remove a pipeline configuration
 */
router.post('/remove', PipelineConfigController.removeAdmin);

/**
 * @route PATCH /pipeline-config/server-path
 * @desc Update (or add) the path configuration for a specific server in a pipeline config.
 * Body: { mode, version, targetServerId, inputPath, outputPath, scriptPath, backupPath }
 */
router.patch('/UpdateServer-path', PipelineConfigController.updateServerPath);

/**
 * @route GET /pipeline-config/current-version
 * @desc Get the latest pipeline configuration version
 */
router.get('/current-version', PipelineConfigController.getCurrentVersion);

/**
 * @route POST /pipeline-config/server-path
 * @desc Get serverPathConfig for a particular version
 * @body { version: string }
 */
router.post('/server-path', PipelineConfigController.getServerPathConfig);

router.get('/details', PipelineConfigController.getAdminUsers);

module.exports = router;
