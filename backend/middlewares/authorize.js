'use strict';

const ApiResponse = require('../utils/ApiResponse');

/**
 * Checks that req.user has one of the allowed roles.
 * Usage: authorize('admin', 'superadmin')
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return ApiResponse.error(res, 401, 'Not authenticated.');
        }
        const role = (req.user.role || '').toLowerCase();
        const allowed = allowedRoles.map(r => r.toLowerCase());
        if (!allowed.includes(role)) {
            return ApiResponse.error(res, 403, 'Insufficient permissions.');
        }
        next();
    };
}

module.exports = authorize;
