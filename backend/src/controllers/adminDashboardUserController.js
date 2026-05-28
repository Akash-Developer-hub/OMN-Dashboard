'use strict';

const AdminDashboardUser = require('../models/AdminDashboardUser');
const Role = require('../models/Role');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../logs_/logger');

const superadminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();

class AdminDashboardUserController {

    /**
     * GET /admin-dashboard/users
     * List all admin users with pagination.
     */
    static listUsers = asyncHandler(async (req, res) => {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const { users, total } = await AdminDashboardUser.findAll({ page, limit });

        return ApiResponse.success(res, 200, 'Users fetched.', {
            users: users.map(u => u.toJSON()),
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    });

    /**
     * POST /admin-dashboard/users
     * Create a new admin user.
     * Body: { name, email, password, role }
     */
    static createUser = asyncHandler(async (req, res) => {
        if (req.user.role !== 'superadmin') {
            return ApiResponse.error(res, 403, 'Only users with the superadmin role can create users.');
        }

        const { name, email, password, role } = req.body;

        if (!email || !password || !role) {
            return ApiResponse.error(res, 400, 'email, password, and role are required.');
        }

        const roleExists = await Role.findOne({ name: role.toLowerCase() });
        if (!roleExists) {
            return ApiResponse.error(res, 400, `Role '${role}' does not exist. Please create the role first.`);
        }

        const existing = await AdminDashboardUser.findOne({ email: email.toLowerCase() });
        if (existing) {
            return ApiResponse.error(res, 409, 'A user with this email already exists.');
        }

        const user = await AdminDashboardUser.create({
            name: name || email.split('@')[0],
            email,
            password,
            role
        });

        logger.audit('ADMIN_USER_CREATED', { actorId: req.user.id, newUserId: user.id, email: user.email, role: user.role });

        return ApiResponse.success(res, 201, 'User created successfully.', { user: user.toJSON() });
    });

    /**
     * GET /admin-dashboard/users/:id
     * Get a single admin user by ID.
     */
    static getUser = asyncHandler(async (req, res) => {
        const user = await AdminDashboardUser.findById(req.params.id);
        if (!user) {
            return ApiResponse.error(res, 404, 'User not found.');
        }
        return ApiResponse.success(res, 200, 'User fetched.', { user: user.toJSON() });
    });

    /**
     * PUT /admin-dashboard/users/:id
     * Update a user's name, role, isActive, or password.
     * Body: { name?, role?, isActive?, password? }
     */
    static updateUser = asyncHandler(async (req, res) => {
        const isSuperAdmin = req.user.role === 'superadmin';

        // Only superadmin can change role or isActive (block/unblock)
        const { role, isActive } = req.body;
        if ((role !== undefined || isActive !== undefined) && !isSuperAdmin) {
            return ApiResponse.error(res, 403, 'Only the superadmin account can change user role or active status.');
        }

        if (role) {
            const roleExists = await Role.findOne({ name: role.toLowerCase() });
            if (!roleExists) {
                return ApiResponse.error(res, 400, `Role '${role}' does not exist.`);
            }
        }

        const user = await AdminDashboardUser.updateById(req.params.id, req.body);
        if (!user) {
            return ApiResponse.error(res, 404, 'User not found or no valid fields to update.');
        }

        logger.audit('ADMIN_USER_UPDATED', { actorId: req.user.id, targetUserId: user.id });

        return ApiResponse.success(res, 200, 'User updated successfully.', { user: user.toJSON() });
    });

    /**
     * DELETE /admin-dashboard/users/:id
     * Delete an admin user by ID.
     */
    static deleteUser = asyncHandler(async (req, res) => {
        if (req.user.role !== 'superadmin') {
            return ApiResponse.error(res, 403, 'Only users with the superadmin role can delete users.');
        }

        // Prevent deleting the superadmin account itself
        const targetUser = await AdminDashboardUser.findById(req.params.id);
        if (!targetUser) {
            return ApiResponse.error(res, 404, 'User not found.');
        }

        if (targetUser.email?.toLowerCase() === superadminEmail) {
            return ApiResponse.error(res, 403, 'The superadmin account cannot be deleted.');
        }

        await AdminDashboardUser.deleteById(req.params.id);

        logger.audit('ADMIN_USER_DELETED', { actorId: req.user.id, deletedUserId: req.params.id, email: targetUser.email });

        return ApiResponse.success(res, 200, 'User deleted successfully.');
    });
}

module.exports = AdminDashboardUserController;
