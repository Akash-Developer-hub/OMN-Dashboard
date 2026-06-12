'use strict';

const express = require('express');
const router = express.Router();
const PipelineConfigController = require('../controllers/pipelineConfigController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validateN8nApiKey = require('../../middlewares/validateN8nApiKey');



/**
 * @route GET /pipeline-config/notify-list-admin
 * @desc Get a list of administrators to notify for pipeline events
 * @access n8n service (x-n8n-api-key header) — bypasses JWT auth
 */
router.get('/notify-list-admin', validateN8nApiKey, PipelineConfigController.getNotifyList);

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
 * @route PATCH /pipeline-config/UpdateDownload-path
 * @desc Update download path configuration for a specific server in a pipeline config.
 */
router.patch('/UpdateDownload-path', PipelineConfigController.updateDownloadPath);

/**
 * @route POST /pipeline-config/download-path
 * @desc Add download path configuration for a specific server in a pipeline config.
 * @body { version, targetServerId, outputPath, logPath, scriptPath }
 */
router.post('/download-path', PipelineConfigController.PostDownloadPath);

/**
 * @route PATCH /pipeline-config/UpdateMovePack-path
 * @desc Update move & pack path configuration for a specific server in a pipeline config.
 */
router.patch('/UpdateMovePack-path', PipelineConfigController.updateMovePackPath);

/**
 * @route POST /pipeline-config/move-pack-path
 * @desc Add move & pack path configuration for a specific server in a pipeline config.
 * @body { version, targetServerId, moveSourcePath, moveTargetPath, packInputFolder, packOutputPath, commonScriptPath, logPath }
 */
router.post('/move-pack-path', PipelineConfigController.PostMovePackPath);

/**
 * @route GET /pipeline-config/versions
 * @desc Get all distinct pipeline configuration versions
 */
router.get('/versions', PipelineConfigController.getVersions);


/**
 * @route GET /pipeline-config/server-path
 * @desc Get serverPathConfig shared across pipeline versions
 * @body { serverId?: string }
 */
router.get('/server-path', PipelineConfigController.getServerPathConfig);

/**
 * @route POST /pipeline-config/download-path-config
 * @desc Get downloadPathConfig for a particular version
 * @body { version: string }
 */
router.post('/download-path-config', PipelineConfigController.getDownloadPathConfig);

/**
 * @route POST /pipeline-config/move-pack-path-config
 * @desc Get movePackPathConfig for a particular version
 * @body { version: string }
 */
router.get('/move-pack-path-config', PipelineConfigController.getMovePackPathConfig);

router.get('/details', PipelineConfigController.getAdminUsers);

module.exports = router;
