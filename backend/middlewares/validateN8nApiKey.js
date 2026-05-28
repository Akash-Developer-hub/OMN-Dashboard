'use strict';

const config = require('../src/config');

/**
 * Middleware that validates the n8n API key from the Authorization header.
 * Expects: Authorization: Bearer <n8n_api_key>
 */
function validateN8nApiKey(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const expected = config.n8n?.apiKey;

    if (expected && token !== expected) {
        return res.status(401).json({ success: false, message: 'Invalid or missing n8n API key.' });
    }

    next();
}

module.exports = validateN8nApiKey;
