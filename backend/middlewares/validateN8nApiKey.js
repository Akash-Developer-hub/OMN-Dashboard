'use strict';

const config = require('../src/config');

/**
 * Middleware that validates the n8n API key from either of these headers:
 * - X-N8N-API-KEY: <n8n_api_key>
 * - Authorization: Bearer <n8n_api_key>
 */
function validateN8nApiKey(req, res, next) {
    const headerToken = req.headers['x-n8n-api-key'] || req.headers['X-N8N-API-KEY'] || '';
    const authHeader = req.headers['authorization'] || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const token = headerToken || bearerToken;
    const expected = config.n8n?.apiKey;

    if (expected && token !== expected) {
        return res.status(401).json({ success: false, message: 'Invalid or missing n8n API key.' });
    }

    next();
}

module.exports = validateN8nApiKey;
