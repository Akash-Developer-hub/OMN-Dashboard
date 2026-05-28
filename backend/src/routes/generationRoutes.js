'use strict';

const express = require('express');
const router = express.Router();
const validate = require('../../middlewares/validate');
const GenerationController = require('../controllers/generationController');
const {
    createGenerationSchema,
    getGenerationsSchema,
    transitionSchema,
} = require('../validations/generationValidation');

/**
 * GET /api/v1/admin-dashboard/generations/servers
 * ?excludeProduction=true  → omit production servers (used for staging dropdown)
 */
router.get('/servers', GenerationController.getAvailableServers);

/**
 * GET /api/v1/admin-dashboard/generations
 */
router.get(
    '/',
    validate({ query: getGenerationsSchema }),
    GenerationController.getGenerations
);

/**
 * GET /api/v1/admin-dashboard/generations/:id
 */
router.get('/:id', GenerationController.getGenerationById);

/**
 * POST /api/v1/admin-dashboard/generations
 * Body: { services[] }  — name is auto-generated
 */
router.post(
    '/',
    validate({ body: createGenerationSchema }),
    GenerationController.createGeneration
);

/**
 * POST /api/v1/admin-dashboard/generations/contribution
 * Start a contribution update generation.
 * Body: { targetServerId, pythonScriptPath, ITCSearchDatabasePath, mode, api, contributionIds }
 */
router.post('/contribution', GenerationController.startContributionGeneration);

/**
 * POST /api/v1/admin-dashboard/generations/:id/complete-contribution
 * Complete a contribution generation and mark contributions as live.
 */
router.post('/:id/complete-contribution', GenerationController.completeContributionGeneration);

/**
 * PATCH /api/v1/admin-dashboard/generations/:id/transition
 * Body: { status, serverId?, note? }
 */
router.patch(
    '/:id/transition',
    validate({ body: transitionSchema }),
    GenerationController.transition
);

module.exports = router;
