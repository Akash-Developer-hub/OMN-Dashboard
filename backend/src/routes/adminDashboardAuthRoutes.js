'use strict';

const express = require('express');
const router = express.Router();
const AdminDashboardAuthController = require('../controllers/adminDashboardAuthController');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');

/**
 * POST /admin-dashboard/auth/login
 * Body: { email, password }
 * - Only allows the email configured in ADMIN_DASHBOARD_EMAIL env var
 * - Login only — no registration
 */
router.post('/login', AdminDashboardAuthController.login);

/**
 * POST /admin-dashboard/auth/register-or-login
 * Body: { email, password, role?, name? }
 * - First time with email → registers and returns tokens
 * - Email already exists → validates password and returns tokens
 * - Same email cannot be registered twice
 */
router.post('/register-or-login', AdminDashboardAuthController.registerOrLogin);

/**
 * POST /admin-dashboard/auth/refresh
 * Body: { refreshToken } or httpOnly refreshToken cookie
 */
router.post('/refresh', AdminDashboardAuthController.refreshToken);

/**
 * POST /admin-dashboard/auth/logout
 * Requires valid access token
 */
router.post('/logout', authenticate, AdminDashboardAuthController.logout);

/**
 * GET /admin-dashboard/auth/me
 * Returns current logged-in admin/vendor profile
 */
router.get('/me', authenticate, authorize('admin', 'vendor'), AdminDashboardAuthController.me);

module.exports = router;
