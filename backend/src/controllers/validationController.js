'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const ValidationReport = require('../../models/ValidationReport');
const logger = require('../../logs_/logger');

class ValidationController {

    /**
     * POST /api/v1/admin-dashboard/validation/save-validation-report
     *
     * Body:
     *   version   {string}           - Primary key (required)
     *   mode      {'osm'|'sqlite'}   - Which report to save (required)
     *   report    {object}           - The validation report payload (required)
     *   meta      {object}           - Optional metadata (fileName, fileSize, jobId, status, …)
     */
    static async saveValidationReport(req, res) {
        try {
            const { version, mode, report, meta = {} } = req.body;

            if (!version || typeof version !== 'string' || !version.trim()) {
                return ApiResponse.error(res, 400, 'version is required and must be a non-empty string.');
            }

            const normalizedMode = String(mode || '').toLowerCase();
            if (normalizedMode !== 'osm' && normalizedMode !== 'sqlite') {
                return ApiResponse.error(res, 400, 'mode must be "osm" or "sqlite".');
            }

            if (!report || typeof report !== 'object') {
                return ApiResponse.error(res, 400, 'report must be a non-null object.');
            }

            const result = await ValidationReport.upsertReport(version.trim(), normalizedMode, report, meta);
            const saved = await ValidationReport.findByVersion(version.trim());

            logger.info(`[ValidationReport] Saved ${normalizedMode} report for version "${version.trim()}"`);

            return ApiResponse.success(res, 200, 'Validation report saved successfully.', {
                version: version.trim(),
                mode: normalizedMode,
                matched: result.matchedCount,
                upserted: result.upsertedCount,
                document: saved,
            });
        } catch (err) {
            logger.error('[ValidationReport] saveValidationReport error:', err);
            return ApiResponse.error(res, 500, 'Failed to save validation report.');
        }
    }

    /**
     * GET /api/v1/admin-dashboard/validation/report/:version
     *
     * Retrieve the full validation report document for a given version.
     */
    static async getValidationReport(req, res) {
        try {
            const { version } = req.params;
            if (!version) {
                return ApiResponse.error(res, 400, 'version param is required.');
            }

            const doc = await ValidationReport.findByVersion(version);
            if (!doc) {
                return ApiResponse.error(res, 404, `No validation report found for version "${version}".`);
            }

            return ApiResponse.success(res, 200, 'Validation report retrieved.', doc);
        } catch (err) {
            logger.error('[ValidationReport] getValidationReport error:', err);
            return ApiResponse.error(res, 500, 'Failed to retrieve validation report.');
        }
    }

    /**
     * GET /api/v1/admin-dashboard/validation/reports
     *
     * List all stored validation report versions.
     */
    static async listValidationReports(req, res) {
        try {
            const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
            const docs = await ValidationReport.list(limit);
            return ApiResponse.success(res, 200, 'Validation reports listed.', { reports: docs, count: docs.length });
        } catch (err) {
            logger.error('[ValidationReport] listValidationReports error:', err);
            return ApiResponse.error(res, 500, 'Failed to list validation reports.');
        }
    }
}

module.exports = ValidationController;
