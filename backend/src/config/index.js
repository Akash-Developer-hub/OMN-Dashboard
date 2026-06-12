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
        runIdLogsWebhookUrl: process.env.N8N_RUN_ID_LOGS_WEBHOOK_URL || 'https://sandbox.vmmaps.com/n8n/webhook/omn/runId-logs',
        downloadStatusCompletedWebhookUrl: process.env.N8N_DOWNLOAD_STATUS_COMPLETED_WEBHOOK_URL || '',
        mailAutoWebhookUrl: process.env.N8N_MAIL_AUTO_WEBHOOK_URL || 'https://sandbox.vmmaps.com/n8n/webhook/omn/mail-auto',
        routingAddMaxspeedWebhookUrl: process.env.N8N_ROUTING_ADDMAXSPEED_WEBHOOK_URL || 'https://sandbox.vmmaps.com/n8n/webhook/omn/addmaxspeed',
        maxspeedWebhookUrl: process.env.N8N_MAXSPEED_WEBHOOK_URL || 'https://sandbox.vmmaps.com/n8n/webhook/maxspeed',
        multipartWebhookUrl: process.env.N8N_MULTIPART_WEBHOOK_URL || 'https://sandbox.vmmaps.com/n8n/webhook/omn/multipart',
    },
};

module.exports = config;
