'use strict';

const winston = require('winston');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const transports = [
    new winston.transports.Console({
        format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
    }),
];

// File transports only if we can write to disk
try {
    const fs = require('fs');
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    transports.push(
        new winston.transports.File({ filename: path.join(LOG_DIR, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(LOG_DIR, 'combined.log') })
    );
} catch { /* skip file logging if not writable */ }

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
    transports,
});

// Convenience methods used by controllers
logger.security = (message, meta = {}) => logger.warn(`[SECURITY] ${message}`, meta);
logger.audit = (action, meta = {}) => logger.info(`[AUDIT] ${action}`, meta);

module.exports = logger;
