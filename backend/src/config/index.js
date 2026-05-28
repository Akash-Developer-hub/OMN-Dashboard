'use strict';

const config = {
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    port: parseInt(process.env.PORT, 10) || 3000,
    apiVersion: process.env.API_VERSION || 'v1',
    appName: process.env.APP_NAME || 'OMN',

    db: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/omn',
    },

    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET || 'change-this-secret',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret',
        accessExpiry: process.env.JWT_ACCESS_EXPIRY || '1d',
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    },

    cors: {
        origin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
            .split(',')
            .map(o => o.trim())
            .filter(Boolean),
    },

    cookie: {
        secret: process.env.COOKIE_SECRET || 'change-this-cookie-secret',
    },

    azure: {
        storageSasUrl: process.env.AZURE_STORAGE_SAS_URL || '',
        containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || '',
    },

    n8n: {
        apiKey: process.env.N8N_API_KEY || '',
    },
};

module.exports = config;
