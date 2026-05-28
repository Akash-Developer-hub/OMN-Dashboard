const { ObjectId } = require('mongodb');
const Role = require('../models/Role');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../logs_/logger');

class RoleController {
    /**
     * POST /admin-dashboard/roles
     */
    static createRole = asyncHandler(async (req, res) => {
        const { name, permissions, color, isActive = true } = req.body;

        if (!name) {
            return ApiResponse.error(res, 400, 'Role name is required.');
        }

        if (!permissions || !Array.isArray(permissions)) {
            return ApiResponse.error(res, 400, 'Permissions array is required.');
        }

        const existingRole = await Role.findOne({ name: name.toLowerCase() });
        if (existingRole) {
            return ApiResponse.error(res, 400, 'Role with this name already exists.');
        }

        const role = await Role.create({
            name: name.toLowerCase(),
            permissions,
            color,
            isActive,
            createdBy: req.user.id
        });

        logger.audit('ROLE_CREATED', { roleId: role.id, name, permissions, color, actorId: req.user.id });
        return ApiResponse.success(res, 201, 'Role created successfully.', { role: role.toJSON() });
    });

    /**
     * GET /admin-dashboard/roles
     */
    static getAllRoles = asyncHandler(async (req, res) => {
        const result = await Role.findAll();
        const AdminDashboardUser = require('../models/AdminDashboardUser');

        // Add user count to each role
        const rolesWithCounts = await Promise.all(result.roles.map(async (role) => {
            const userCount = await AdminDashboardUser.count({ role: role.name });
            return { ...role.toJSON(), userCount };
        }));

        return ApiResponse.success(res, 200, 'Roles fetched successfully.', { 
            roles: rolesWithCounts,
            total: result.total 
        });
    });

    /**
     * PUT /admin-dashboard/roles/:id
     */
    static updateRole = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { name, permissions, color, isActive } = req.body;

        if (!ObjectId.isValid(id)) {
            return ApiResponse.error(res, 400, 'Invalid role ID.');
        }

        const role = await Role.findOne({ _id: new ObjectId(id) });
        if (!role) {
            return ApiResponse.error(res, 404, 'Role not found.');
        }

        const updateData = {};
        if (name) updateData.name = name.toLowerCase();
        if (permissions) updateData.permissions = permissions;
        if (color) updateData.color = color;
        if (isActive !== undefined) updateData.isActive = isActive;

        await Role.updateById(id, updateData);
        logger.audit('ROLE_UPDATED', { roleId: id, updateData, actorId: req.user.id });
        return ApiResponse.success(res, 200, 'Role updated successfully.');
    });

    /**
     * DELETE /admin-dashboard/roles/:id
     */
    static deleteRole = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return ApiResponse.error(res, 400, 'Invalid role ID.');
        }

        const role = await Role.findOne({ _id: new ObjectId(id) });
        if (!role) {
            return ApiResponse.error(res, 404, 'Role not found.');
        }

        if (role.name === 'superadmin') {
            return ApiResponse.error(res, 403, 'Cannot delete superadmin role.');
        }

        await Role.deleteById(id);
        logger.audit('ROLE_DELETED', { roleId: id, roleName: role.name, actorId: req.user.id });
        return ApiResponse.success(res, 200, 'Role deleted successfully.');
    });
}

module.exports = RoleController;
