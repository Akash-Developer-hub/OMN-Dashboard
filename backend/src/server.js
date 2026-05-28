'use strict';

require('dotenv').config();

const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('../logs_/logger');
const { connectDb } = require('../config/database');
const { createDefaultRoles, createSuperadmin } = require('./startup/initSuperadmin');

async function startServer() {
    await connectDb();

    try {
        await createDefaultRoles();
        await createSuperadmin();
    } catch (err) {
        logger.warn('Superadmin init skipped: ' + err.message);
    }

    const server = http.createServer(app);

    server.listen(config.port, () => {
        logger.info(`[${config.appName}] Server running on port ${config.port} (${config.env})`);
        logger.info(`API: http://localhost:${config.port}/api/${config.apiVersion}/admin-dashboard`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') logger.error(`Port ${config.port} is already in use.`);
        else logger.error('Server error: ' + err.message);
        process.exit(1);
    });

    const shutdown = async (signal) => {
        logger.info(`${signal} received — shutting down.`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
