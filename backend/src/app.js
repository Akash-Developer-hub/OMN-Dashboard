'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const config = require('./config');

// Admin Dashboard routes
const adminDashboardRoutes = require('./routes');

const app = express();

// Normalize duplicate slashes
app.use((req, _res, next) => {
    if (typeof req.url === 'string' && req.url.includes('//')) {
        req.url = req.url.replace(/\/{2,}/g, '/');
    }
    next();
});

if (config.isProduction) app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({ origin: config.cors.origin.length ? config.cors.origin : '*', credentials: true }));

// Parsing & sanitization
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser(config.cookie.secret));
app.use(mongoSanitize());
app.use(hpp({ whitelist: ['page', 'limit', 'sort', 'fields', 'type', 'role', 'status'] }));
app.use(compression());
app.use(morgan(config.isProduction ? 'combined' : 'dev'));

try { const xss = require('xss-clean'); app.use(xss()); } catch { /* optional */ }

// Routes
app.get(`/api/${config.apiVersion}/health`, (_req, res) => {
    res.json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});
app.use(`/api/${config.apiVersion}/admin-dashboard`, adminDashboardRoutes);
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads')));

// 404 & error handler
const ApiResponse = require('../utils/ApiResponse');
app.all('*', (req, res) => ApiResponse.error(res, 404, `Route ${req.method} ${req.originalUrl} not found.`));
app.use((err, req, res, _next) => ApiResponse.error(res, err.statusCode || 500, err.message || 'Internal Server Error'));

module.exports = app;
