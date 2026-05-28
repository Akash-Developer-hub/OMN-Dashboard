'use strict';

const TokenService = require('../services/tokenService');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Verifies the Bearer token from Authorization header.
 * Attaches decoded payload to req.user.
 */
module.exports = function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return ApiResponse.error(res, 401, 'Authentication token required.');
    }

    const token = authHeader.slice(7);
    try {
        req.user = TokenService.verifyAccessToken(token);
        next();
    } catch (err) {
        return ApiResponse.error(res, 401, 'Invalid or expired token.');
    }
};
