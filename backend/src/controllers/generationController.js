'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const GenerationRequest = require('../models/GenerationRequest');
const Server = require('../models/Server');
const Contributor = require('../models/contributions');
const { ObjectId } = require('mongodb');
const logger = require('../../logs_/logger');

// Valid status transitions
const TRANSITIONS = {
    generating:           ['generation_completed', 'failed'],
    generation_completed: ['staging'],
    staging:              ['production', 'failed'],
    production:           [],
    failed:               [],
};

class GenerationController {

    /**
     * GET /api/v1/admin-dashboard/generations/servers
     * Fetch active (non-production) servers for generation/staging dropdowns.
     */
    static getAvailableServers = async (req, res) => {
        try {
            await Server.ensureIndexes().catch(() => {});
            const { excludeProduction, onlyProduction } = req.query;
            const query = { isActive: true };
            if (excludeProduction === 'true') query.environment = { $ne: 'production' };
            if (onlyProduction === 'true') query.environment = 'production';
            const servers = await Server.findAll(query);
            return ApiResponse.success(res, 200, 'Available servers fetched.', servers);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * POST /api/v1/admin-dashboard/generations
     * Create a new generation request (name auto-generated).
     */
    static createGeneration = async (req, res) => {
        try {
            await GenerationRequest.ensureIndexes().catch(() => {});

            const { services } = req.body;

            // Collect all referenced server IDs and validate they exist
            const serverIds = new Set();
            for (const svc of services) {
                serverIds.add(svc.targetServerId);
                if (svc.copyFrom?.sourceServerId) serverIds.add(svc.copyFrom.sourceServerId);
                if (svc.contributionConfig?.gtfsServerId) serverIds.add(svc.contributionConfig.gtfsServerId);
            }

            for (const sid of serverIds) {
                if (!Server.isValidId(sid)) {
                    return ApiResponse.error(res, 400, `Invalid server ID: ${sid}`);
                }
                const server = await Server.findById(sid);
                if (!server) {
                    return ApiResponse.error(res, 400, `Server not found: ${sid}`);
                }
            }

            const request = await GenerationRequest.create({ services });
            return ApiResponse.success(res, 201, 'Generation request created.', request);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * GET /api/v1/admin-dashboard/generations
     * List generation requests with optional status filter.
     */
    static getGenerations = async (req, res) => {
        try {
            const { status, page, limit } = req.query;
            const query = {};
            if (status) query.status = status;

            const result = await GenerationRequest.findAll(query, {
                page: Number(page) || 1,
                limit: Number(limit) || 20,
            });

            return ApiResponse.success(res, 200, 'Generation requests fetched.', result.data, {
                total: result.total,
                page: result.page,
                limit: result.limit,
            });
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * GET /api/v1/admin-dashboard/generations/:id
     * Get a single generation request by ID.
     */
    static getGenerationById = async (req, res) => {
        try {
            const { id } = req.params;
            if (!GenerationRequest.isValidId(id)) {
                return ApiResponse.error(res, 400, 'Invalid generation ID.');
            }
            const doc = await GenerationRequest.findById(id);
            if (!doc) {
                return ApiResponse.error(res, 404, 'Generation request not found.');
            }
            return ApiResponse.success(res, 200, 'Generation request fetched.', doc);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * PATCH /api/v1/admin-dashboard/generations/:id/transition
     * Transition a generation to the next status.
     * Body: { status, serverId?, note? }
     * - staging/production require a serverId (non-production server for staging)
     */
    static transition = async (req, res) => {
        try {
            const { id } = req.params;
            if (!GenerationRequest.isValidId(id)) {
                return ApiResponse.error(res, 400, 'Invalid generation ID.');
            }

            const doc = await GenerationRequest.findById(id);
            if (!doc) {
                return ApiResponse.error(res, 404, 'Generation request not found.');
            }

            const { status: newStatus, serverId, note } = req.body;

            // Check transition is allowed
            const allowed = TRANSITIONS[doc.status] || [];
            if (!allowed.includes(newStatus)) {
                return ApiResponse.error(
                    res, 400,
                    `Cannot transition from '${doc.status}' to '${newStatus}'. Allowed: [${allowed.join(', ') || 'none'}]`
                );
            }

            // Validate server when moving to staging
            if (newStatus === 'staging') {
                if (!serverId || !Server.isValidId(serverId)) {
                    return ApiResponse.error(res, 400, 'A valid serverId is required to move to staging.');
                }
                const server = await Server.findById(serverId);
                if (!server) {
                    return ApiResponse.error(res, 400, 'Server not found.');
                }
                if (server.environment === 'production') {
                    return ApiResponse.error(res, 400, 'Cannot stage directly to a production server.');
                }
            }

            // Validate server when moving to production (must be a production server)
            if (newStatus === 'production') {
                if (!serverId || !Server.isValidId(serverId)) {
                    return ApiResponse.error(res, 400, 'A valid serverId is required to promote to production.');
                }
                const server = await Server.findById(serverId);
                if (!server) {
                    return ApiResponse.error(res, 400, 'Server not found.');
                }
                if (server.environment !== 'production') {
                    return ApiResponse.error(res, 400, 'Target server must be a production server.');
                }
            }

            const updated = await GenerationRequest.transition(id, newStatus, {
                ...(serverId && { serverId }),
                ...(note && { note }),
            });

            return ApiResponse.success(res, 200, `Generation transitioned to '${newStatus}'.`, updated);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * POST /api/v1/admin-dashboard/generations/contribution
     * Start a contribution update generation:
     * 1. Trigger the n8n webhook with the config payload
     * 2. Create a generation_request doc with status "generating"
     * 3. Store contribution IDs so they can be marked live on completion
     */
    static startContributionGeneration = async (req, res) => {
        try {
            const {
                targetServerId,
                pythonScriptPath,
                ITCSearchDatabasePath,
                mode,
                api: apiEndpoint,
                contributionIds,
            } = req.body;

            if (!targetServerId || !Server.isValidId(targetServerId)) {
                return ApiResponse.error(res, 400, 'A valid targetServerId is required.');
            }
            const server = await Server.findById(targetServerId);
            if (!server) {
                return ApiResponse.error(res, 400, 'Server not found.');
            }
            if (!pythonScriptPath || !ITCSearchDatabasePath || !mode || !apiEndpoint) {
                return ApiResponse.error(res, 400, 'All contribution config fields are required (pythonScriptPath, ITCSearchDatabasePath, mode, api).');
            }
            if (!Array.isArray(contributionIds) || contributionIds.length === 0) {
                return ApiResponse.error(res, 400, 'contributionIds array is required and must not be empty.');
            }

            // Trigger n8n webhook
            const n8nPayload = {
                pythonScriptPath,
                ITCSearchDatabasePath,
                mode,
                api: apiEndpoint,
            };

            const N8N_WEBHOOK = 'https://tilegenauto.app.n8n.cloud/webhook/start-contributions';
            try {
                const axios = require('axios');
                await axios.post(N8N_WEBHOOK, n8nPayload, { timeout: 30000 });
            } catch (webhookErr) {
                logger.error('n8n contribution webhook failed:', webhookErr.message);
                return ApiResponse.error(res, 502, `Failed to trigger contribution generation webhook: ${webhookErr.message}`);
            }

            // Mark contributions as live
            const collection = Contributor.getcollection();
            const objectIds = contributionIds
                .filter(cid => ObjectId.isValid(cid))
                .map(cid => new ObjectId(cid));

            if (objectIds.length > 0) {
                const liveTimestamp = Date.now();
                await collection.updateMany(
                    { _id: { $in: objectIds } },
                    { $set: { isLive: true, liveAt: liveTimestamp, liveUpdateAt: liveTimestamp } }
                );
            }

            // Create generation request doc
            await GenerationRequest.ensureIndexes().catch(() => {});
            const request = await GenerationRequest.createContribution({
                targetServerId,
                contributionConfig: n8nPayload,
                contributionIds,
            });

            // Transition to generation_completed since webhook + isLive update succeeded
            await GenerationRequest.transition(request.id, 'generation_completed', {
                note: 'Contribution update completed and contributions marked as live',
            });

            return ApiResponse.success(res, 201, 'Contribution generation completed and contributions marked as live.', {
                ...request,
                status: 'generation_completed',
            });
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * POST /api/v1/admin-dashboard/generations/:id/complete-contribution
     * Called when a contribution generation completes.
     * Transitions to generation_completed and marks contributions as live.
     */
    static completeContributionGeneration = async (req, res) => {
        try {
            const { id } = req.params;
            if (!GenerationRequest.isValidId(id)) {
                return ApiResponse.error(res, 400, 'Invalid generation ID.');
            }

            const doc = await GenerationRequest.findById(id);
            if (!doc) {
                return ApiResponse.error(res, 404, 'Generation request not found.');
            }

            if (doc.type !== 'contribution') {
                return ApiResponse.error(res, 400, 'This endpoint is only for contribution type generations.');
            }

            // Transition to generation_completed
            const updated = await GenerationRequest.transition(id, 'generation_completed', {
                note: 'Contribution generation completed',
            });

            // Mark contributions as live
            if (doc.contributionIds && doc.contributionIds.length > 0) {
                const collection = Contributor.getcollection();
                const objectIds = doc.contributionIds
                    .filter(cid => ObjectId.isValid(cid))
                    .map(cid => new ObjectId(cid));

                if (objectIds.length > 0) {
                    const liveTimestamp = Date.now();
                    await collection.updateMany(
                        { _id: { $in: objectIds } },
                        { $set: { isLive: true, liveAt: liveTimestamp, liveUpdateAt: liveTimestamp } }
                    );
                }
            }

            return ApiResponse.success(res, 200, 'Contribution generation completed and contributions marked as live.', updated);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };
}

module.exports = GenerationController;
