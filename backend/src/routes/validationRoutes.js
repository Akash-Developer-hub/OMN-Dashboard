'use strict';

const express = require('express');
const router = express.Router();
const ValidationController = require('../controllers/validationController');

/**
/**
 * POST /api/v1/admin-dashboard/validation/save-validation-report
 * Save (upsert) an OSM or SQLite validation report keyed by version.
 * Both report types are stored in a single MongoDB document per version.
 */
router.post('/save-validation-report', ValidationController.saveValidationReport);

/**
 * GET /api/v1/admin-dashboard/validation/reports
 * List all stored validation report versions.
 */
router.get('/reports', ValidationController.listValidationReports);

/**
 * GET /api/v1/admin-dashboard/validation/report/:version
 * Retrieve the full validation report document for a specific version.
 */
router.get('/report/:version', ValidationController.getValidationReport);

module.exports = router;
