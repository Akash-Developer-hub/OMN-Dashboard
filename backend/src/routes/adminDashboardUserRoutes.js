'use strict';

const express = require('express');
const router = express.Router();
const AdminDashboardUserController = require('../controllers/adminDashboardUserController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');

// All user management routes require authentication and admin/superadmin role
router.use(authenticate, authorize('admin', 'superadmin'));

/**
 * GET /admin-dashboard/users
 * List all admin users (paginated)
 * Query: ?page=1&limit=20
 */
router.get('/', AdminDashboardUserController.listUsers);

/**
 * POST /admin-dashboard/users
 * Create a new admin user
 * Body: { name, email, password, role }
 */
router.post('/', AdminDashboardUserController.createUser);

/**
 * GET /admin-dashboard/users/:id
 * Get a single admin user by ID
 */
router.get('/:id', AdminDashboardUserController.getUser);

/**
 * PUT /admin-dashboard/users/:id
 * Update an admin user
 * Body: { name?, role?, isActive?, password? }
 */
router.put('/:id', AdminDashboardUserController.updateUser);

/**
 * DELETE /admin-dashboard/users/:id
 * Delete an admin user
 */
router.delete('/:id', AdminDashboardUserController.deleteUser);

module.exports = router;
