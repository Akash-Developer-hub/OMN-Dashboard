'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const ContributionGeneration = require('../models/ContributionGeneration');
const Contributor = require('../models/contributions');
const { ObjectId } = require('mongodb');
const logger = require('../../logs_/logger');
const axios = require('axios');

class ContributionGenerationController {

    /**
     * GET /api/v1/admin-dashboard/contribution-generation/config
     */
    static getConfig = async (req, res) => {
        try {
            const config = await ContributionGeneration.getGlobalConfig();
            return ApiResponse.success(res, 200, 'Config fetched', config);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * POST /api/v1/admin-dashboard/contribution-generation/config
     */
    static updateConfig = async (req, res) => {
        try {
            const newConfig = await ContributionGeneration.updateGlobalConfig(req.body);
            return ApiResponse.success(res, 200, 'Config updated', newConfig);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * GET /api/v1/admin-dashboard/contribution-generation
     */
    static getHistory = async (req, res) => {
        try {
            const { page, limit, status } = req.query;

            const query = {};
            if (status === 'running' || status === 'live') {
                query.status = status;
            }

            const result = await ContributionGeneration.findHistory(query, {
                page: Number(page) || 1,
                limit: Number(limit) || 20,
            });
            return ApiResponse.success(res, 200, 'Contribution generation history fetched.', result.data, {
                total: result.total,
                page: result.page,
                limit: result.limit,
            });
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * POST /api/v1/admin-dashboard/contribution-generation/create-doc
     * Creates a generation history record without triggering automation.
     */
    static createGenDoc = async (req, res) => {
        try {
            const contributionIds = Array.isArray(req.body?.contributionIds)
                ? req.body.contributionIds
                : [];

            const config = await ContributionGeneration.getGlobalConfig();
            const newGen = await ContributionGeneration.createBatch({
                count: contributionIds.length,
                contributionIds,
                config
            });

            return ApiResponse.success(res, 201, 'Generation document created.', newGen);
        } catch (err) {
            logger.error('Error in createGenDoc:', err);
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * POST /api/v1/admin-dashboard/contribution-generation/mark-live
     * Marks a generation as live by gen_id.
     */
    static markGenerationLive = async (req, res) => {
        try {
            const genId = req.body?.genId || req.body?.gen_id;

            if (!genId || typeof genId !== 'string') {
                return ApiResponse.error(res, 400, 'genId (or gen_id) is required.');
            }

            const result = await ContributionGeneration.markGenerationLiveByGenId(genId.trim());

            if (!result.updated) {
                return ApiResponse.error(res, 404, `Generation not found for gen_id: ${genId}`);
            }

            if (!result.transitioned) {
                return ApiResponse.success(
                    res,
                    200,
                    'Generation is already live or not in running state.',
                    result.updated
                );
            }

            return ApiResponse.success(res, 200, 'Generation marked live.', result.updated);
        } catch (err) {
            logger.error('Error in markGenerationLive:', err);
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * POST /api/v1/admin-dashboard/contribution-generation
     * Starts a new batch generation process
     */
    static startGeneration = async (req, res) => {
        try {
            const { contributionIds } = req.body;

            if (!Array.isArray(contributionIds) || contributionIds.length === 0) {
                return ApiResponse.error(res, 400, 'At least one contribution ID is required.');
            }

            // 1. Fetch current settings
            const config = await ContributionGeneration.getGlobalConfig();

            // 2. Trigger the external n8n automation
            let n8nConfirmed = false;
            try {
                const n8nUrl = process.env.N8N_WEBHOOK_URL || "https://sandbox.vmmaps.com/n8n/webhook/start-contributions";
                logger.info(`Triggering n8n webhook (GET with Body) at: ${n8nUrl}`);

                const { _id, type, updatedAt, ...cleanConfig } = config;
                const payload = {
                    ...cleanConfig,
                    id: contributionIds
                };

                // axios.get typically doesn't support a body. 
                // To send a body with GET (as shown in user's screenshot), we use the generic axios() call.
                const n8nRes = await axios({
                    method: 'post',
                    url: n8nUrl,
                    data: payload, // Sending JSON in the body of a GET request
                    timeout: 45000
                });
                
                logger.info('n8n Response Data:', n8nRes.data);

                if (n8nRes.data && n8nRes.data.neapiProcess === "Completed") {
                    n8nConfirmed = true;
                    logger.info('n8n confirmed: neapiProcess=Completed');
                } else {
                    const status = n8nRes.data?.neapiProcess || 'Process pending';
                    return ApiResponse.error(res, 502, `Automation process incomplete (Status: ${status}).`);
                }
            } catch (webhookErr) {
                logger.error('n8n webhook trigger failed:', webhookErr.message);
                const n8nError = webhookErr.response?.data || webhookErr.message;
                return ApiResponse.error(res, 502, 'Automation server error: ' + (typeof n8nError === 'string' ? n8nError : JSON.stringify(n8nError)));
            }

            // 3. Finalize locally ONLY if n8n confirmed "Completed"
            if (n8nConfirmed) {
                try {
                    const updateUrl = process.env.UPDATE_ISLIVE_URL || "http://localhost:3000/api/v1/admin-dashboard/contributors/update-contribution-islive";
                    const localRes = await axios.post(updateUrl, {
                        id: contributionIds
                    });

                    if (localRes.status === 200 || localRes.status === 201) {
                        const collection = Contributor.getcollection();
                        const objectIds = contributionIds
                            .filter(id => ObjectId.isValid(id))
                            .map(id => new ObjectId(id));

                        if (objectIds.length > 0) {
                            const liveTimestamp = Date.now();
                            await collection.updateMany(
                                { _id: { $in: objectIds } },
                                { $set: { isLive: true, liveAt: liveTimestamp, liveUpdateAt: liveTimestamp } }
                            );
                        }

                        await ContributionGeneration.finalizePreviousGenerations();
                        const newGen = await ContributionGeneration.createBatch({
                            count: contributionIds.length,
                            contributionIds: contributionIds,
                            config: config
                        });

                        return ApiResponse.success(res, 201, 'Batch generation and live sync confirmed.', newGen);
                    }
                } catch (localErr) {
                    return ApiResponse.error(res, 500, 'Failed to finalize live status locally: ' + localErr.message);
                }
            }

        } catch (err) {
            logger.error('Error in startGeneration:', err);
            return ApiResponse.error(res, 500, err.message);
        }
    };
}

module.exports = ContributionGenerationController;
