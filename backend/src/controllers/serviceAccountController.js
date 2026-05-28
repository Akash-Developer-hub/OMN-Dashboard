'use strict';

const ServiceAccount = require('../models/ServiceAccount');
const TokenService = require('../../services/tokenService');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../logs_/logger');

class ServiceAccountController {
    /**
     * POST /admin-dashboard/service-accounts
     * Create a new role-based service account and generate an access token.
     */
    static createServiceAccount = asyncHandler(async (req, res) => {
        const { name, role, expiresIn } = req.body;

        if (!name || !role) {
            return ApiResponse.error(res, 400, 'Service account name and role are required.');
        }

        // Verify role exists
        const Role = require('../models/Role');
        const roleData = await Role.findOne({ name: role.toLowerCase() });
        if (!roleData) {
            return ApiResponse.error(res, 400, `Role '${role}' does not exist.`);
        }

        // Create service account record in DB
        const serviceAccount = await ServiceAccount.create({
            name,
            role: role.toLowerCase(),
            createdBy: req.user.id,
            isActive: true
        });

        // Generate long-lived token
        const token = TokenService.generateServiceAccountToken(serviceAccount, expiresIn || '365d');

        // Store token preview in DB
        await ServiceAccount.updateById(serviceAccount.id, { tokenPreview: token.slice(0, 15) + '...' });

        logger.audit('SERVICE_ACCOUNT_CREATED', { 
            serviceAccountId: serviceAccount.id, 
            name, 
            role: serviceAccount.role, 
            createdBy: req.user.id 
        });

        return ApiResponse.success(res, 201, 'Service account created successfully.', {
            serviceAccount: serviceAccount.toJSON(),
            token // Raw token returned only once
        });
    });

    /**
     * GET /admin-dashboard/service-accounts
     * List all service accounts.
     */
    static getAllServiceAccounts = asyncHandler(async (req, res) => {
        const result = await ServiceAccount.findAll({});
        return ApiResponse.success(res, 200, 'Service accounts fetched.', result);
    });

    /**
     * PUT /admin-dashboard/service-accounts/:id
     * Update service account (e.g. isActive, role).
     */
    static updateServiceAccount = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, role, isActive } = req.body;

        const existing = await ServiceAccount.findById(id);
        if (!existing) {
            return ApiResponse.error(res, 404, 'Service account not found.');
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (role) updateData.role = role.toLowerCase();
        if (isActive !== undefined) updateData.isActive = isActive;

        await ServiceAccount.updateById(id, updateData);
        const updated = await ServiceAccount.findById(id);

        logger.audit('SERVICE_ACCOUNT_UPDATED', { serviceAccountId: id, updatedBy: req.user.id });

        return ApiResponse.success(res, 200, 'Service account updated successfully.', { serviceAccount: updated.toJSON() });
    });

    /**
     * DELETE /admin-dashboard/service-accounts/:id
     * Delete service account.
     */
    static deleteServiceAccount = asyncHandler(async (req, res) => {
        const { id } = req.params;

        const existing = await ServiceAccount.findById(id);
        if (!existing) {
            return ApiResponse.error(res, 404, 'Service account not found.');
        }

        await ServiceAccount.deleteById(id);

        logger.audit('SERVICE_ACCOUNT_DELETED', { serviceAccountId: id, deletedBy: req.user.id });

        return ApiResponse.success(res, 200, 'Service account deleted successfully.');
    });
}

module.exports = ServiceAccountController;
