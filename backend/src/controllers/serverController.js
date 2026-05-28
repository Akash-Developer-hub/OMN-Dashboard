'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const Server = require('../models/Server');

class ServerController {

    static getServers = async (req, res) => {
        try {
            await Server.ensureIndexes().catch(() => {});

            const { environment, isActive, search } = req.query;

            const query = {};

            if (environment) query.environment = environment;

            if (isActive !== undefined) {
                query.isActive = isActive === 'true' || isActive === true;
            }

            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { ipAddress: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                ];
            }

            const servers = await Server.findAll(query);

            return ApiResponse.success(res, 200, 'Servers fetched successfully.', servers);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static getServerById = async (req, res) => {
        try {
            const { id } = req.params;

            if (!Server.isValidId(id)) {
                return ApiResponse.error(res, 400, 'Invalid server ID.');
            }

            const server = await Server.findById(id);

            if (!server) {
                return ApiResponse.error(res, 404, 'Server not found.');
            }

            return ApiResponse.success(res, 200, 'Server fetched successfully.', server);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static createServer = async (req, res) => {
        try {
            await Server.ensureIndexes().catch(() => {});

            const server = await Server.create(req.body);

            return ApiResponse.success(res, 201, 'Server created successfully.', server);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static updateServer = async (req, res) => {
        try {
            const { id } = req.params;

            if (!Server.isValidId(id)) {
                return ApiResponse.error(res, 400, 'Invalid server ID.');
            }

            const server = await Server.update(id, req.body);

            if (!server) {
                return ApiResponse.error(res, 404, 'Server not found.');
            }

            return ApiResponse.success(res, 200, 'Server updated successfully.', server);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static setServerStatus = async (req, res) => {
        try {
            const { id } = req.params;

            if (!Server.isValidId(id)) {
                return ApiResponse.error(res, 400, 'Invalid server ID.');
            }

            const { isActive } = req.body;
            const server = await Server.setActive(id, isActive);

            if (!server) {
                return ApiResponse.error(res, 404, 'Server not found.');
            }

            const msg = isActive ? 'Server activated successfully.' : 'Server deactivated successfully.';
            return ApiResponse.success(res, 200, msg, server);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };

    static deleteServer = async (req, res) => {
        try {
            const { id } = req.params;

            if (!Server.isValidId(id)) {
                return ApiResponse.error(res, 400, 'Invalid server ID.');
            }

            const deleted = await Server.delete(id);

            if (!deleted) {
                return ApiResponse.error(res, 404, 'Server not found.');
            }

            return ApiResponse.success(res, 200, 'Server deleted successfully.', null);
        } catch (err) {
            return ApiResponse.error(res, 500, err.message);
        }
    };
}

module.exports = ServerController;
