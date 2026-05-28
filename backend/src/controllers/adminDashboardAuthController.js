'use strict';

const AdminDashboardUser = require('../models/AdminDashboardUser');
const TokenService = require('../../services/tokenService');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../logs_/logger');

class AdminDashboardAuthController {

    /**
     * POST /admin-dashboard/auth/login
     * - Only allows login for the email set in ADMIN_DASHBOARD_EMAIL env var
     * - No registration — account must already exist in the database
     */
    static login = asyncHandler(async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return ApiResponse.error(res, 400, 'Email and password are required.');
        }

        const user = await AdminDashboardUser.findOne({ email: email.toLowerCase() });
        console.log(`[AUTH DEBUG] Login attempt for email: ${email}`);
        
        if (!user) {
            console.log(`[AUTH DEBUG] User not found: ${email}`);
            return ApiResponse.error(res, 401, 'Invalid credentials.');
        }

        if (!user.isActive) {
            console.log(`[AUTH DEBUG] User account is deactivated: ${email}`);
            return ApiResponse.error(res, 403, 'Account is deactivated.');
        }

        if (user.isLocked()) {
            console.log(`[AUTH DEBUG] User account is locked: ${email}`);
            logger.security('Login on locked account', { userId: user.id, ip: req.ip });
            return ApiResponse.error(res, 423, 'Account is temporarily locked. Try again later.');
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            console.log(`[AUTH DEBUG] Password mismatch for: ${email}`);
            await user.incrementLoginAttempts();
            logger.security('Failed admin dashboard login', { userId: user.id, ip: req.ip });
            return ApiResponse.error(res, 401, 'Invalid credentials.');
        }

        console.log(`[AUTH DEBUG] Password valid for: ${email}. Generating tokens...`);
        await user.resetLoginAttempts();

        const accessToken = TokenService.generateAccessToken(user);
        const { token: refreshToken } = await TokenService.generateRefreshToken(user, req);
        TokenService.setRefreshTokenCookie(res, refreshToken);

        // Fetch role permissions
        const Role = require('../models/Role');
        const roleData = await Role.findOne({ name: user.role.toLowerCase() });
        console.log(`[AUTH DEBUG] Role found: ${user.role}, Permissions count: ${roleData ? roleData.permissions.length : 0}`);
        
        const userWithPerms = user.toJSON();
        userWithPerms.permissions = roleData ? roleData.permissions : [];

        logger.audit('ADMIN_DASHBOARD_LOGIN', { userId: user.id, role: user.role, ip: req.ip });
        console.log(`[AUTH DEBUG] Login successful for: ${email}`);

        return ApiResponse.success(res, 200, `${user.role} login successful.`, {
            user: userWithPerms,
            accessToken,
            refreshToken
        });
    });

    /**
     * POST /admin-dashboard/auth/register-or-login
     * - If email not found → registers the user and returns tokens
     * - If email found → validates password and returns tokens
     * - Duplicate registration is blocked (same email = login only)
     */
    static registerOrLogin = asyncHandler(async (req, res) => {
        const { name, email, password, role } = req.body;

        if (!email || !password) {
            return ApiResponse.error(res, 400, 'Email and password are required.');
        }

        // Find existing user or register new one
        const { user, isNew } = await AdminDashboardUser.findOrCreate({
            name: name || email.split('@')[0],
            email,
            password,
            role: role || 'admin'
        });

        // If existing user → validate password
        if (!isNew) {
            if (!user.isActive) {
                return ApiResponse.error(res, 403, 'Account is deactivated.');
            }

            if (user.isLocked()) {
                logger.security('Login on locked account', { userId: user.id, ip: req.ip });
                return ApiResponse.error(res, 423, 'Account is temporarily locked. Try again later.');
            }

            const isValid = await user.comparePassword(password);
            if (!isValid) {
                await user.incrementLoginAttempts();
                logger.security('Failed admin dashboard login', { userId: user.id, ip: req.ip });
                return ApiResponse.error(res, 401, 'Invalid credentials.');
            }

            await user.resetLoginAttempts();
        }

        // Generate tokens
        const accessToken = TokenService.generateAccessToken(user);
        const { token: refreshToken } = await TokenService.generateRefreshToken(user, req);
        TokenService.setRefreshTokenCookie(res, refreshToken);

        // Fetch role permissions
        const Role = require('../models/Role');
        const roleData = await Role.findOne({ name: user.role.toLowerCase() });
        const userWithPerms = user.toJSON();
        userWithPerms.permissions = roleData ? roleData.permissions : [];

        const action = isNew ? 'registered' : 'login';
        logger.audit(`ADMIN_DASHBOARD_${action.toUpperCase()}`, { userId: user.id, role: user.role, ip: req.ip });

        return ApiResponse.success(res, isNew ? 201 : 200,
            isNew
                ? `${user.role} registered successfully.`
                : `${user.role} login successful.`,
            { user: userWithPerms, accessToken, refreshToken }
        );
    });

    /**
     * POST /admin-dashboard/auth/logout
     */
    static logout = asyncHandler(async (req, res) => {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (req.token) {
            await TokenService.blacklistToken(req.token, req.user.id, 'logout');
        }
        await TokenService.revokeAllUserTokens(req.user.id);
        TokenService.clearRefreshTokenCookie(res);

        logger.audit('ADMIN_DASHBOARD_LOGOUT', { userId: req.user.id });

        return ApiResponse.success(res, 200, 'Logged out successfully.');
    });

    /**
     * POST /admin-dashboard/auth/refresh
     */
    static refreshToken = asyncHandler(async (req, res) => {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!refreshToken) {
            return ApiResponse.error(res, 401, 'Refresh token is required.');
        }

        const tokens = await TokenService.rotateRefreshToken(refreshToken, req);
        TokenService.setRefreshTokenCookie(res, tokens.refreshToken);

        return ApiResponse.success(res, 200, 'Tokens refreshed successfully.', {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    });

    /**
     * GET /admin-dashboard/auth/me
     */
    static me = asyncHandler(async (req, res) => {
        const Role = require('../models/Role');
        const roleData = await Role.findOne({ name: req.user.role.toLowerCase() });
        const userWithPerms = req.user.toJSON();
        userWithPerms.permissions = roleData ? roleData.permissions : [];
        
        return ApiResponse.success(res, 200, 'Profile fetched.', { user: userWithPerms });
    });
}

module.exports = AdminDashboardAuthController;
