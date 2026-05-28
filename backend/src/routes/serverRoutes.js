'use strict';

const express = require('express');
const router = express.Router();
const validate = require('../../middlewares/validate');
const ServerController = require('../controllers/serverController');
const {
    createServerSchema,
    updateServerSchema,
    setServerStatusSchema,
    getServersSchema,
} = require('../validations/serverValidation');

/**
 * GET /api/v1/dashboard/servers
 * Get all servers with optional filtering
 */
router.get(
    '/',
    validate({ query: getServersSchema }),
    ServerController.getServers
);

/**
 * GET /api/v1/dashboard/servers/:id
 * Get a single server by ID
 */
router.get('/:id', ServerController.getServerById);

/**
 * POST /api/v1/dashboard/servers
 * Create a new server
 */
router.post(
    '/',
    validate({ body: createServerSchema }),
    ServerController.createServer
);

/**
 * PUT /api/v1/dashboard/servers/:id
 * Update a server
 */
router.put(
    '/:id',
    validate({ body: updateServerSchema }),
    ServerController.updateServer
);

/**
 * PATCH /api/v1/dashboard/servers/:id/status
 * Activate or deactivate a server
 */
router.patch(
    '/:id/status',
    validate({ body: setServerStatusSchema }),
    ServerController.setServerStatus
);

/**
 * DELETE /api/v1/dashboard/servers/:id
 * Hard delete a server
 */
router.delete('/:id', ServerController.deleteServer);

module.exports = router;
