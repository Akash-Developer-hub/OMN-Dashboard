'use strict';

const { getDb } = require('../config/database');

const COLLECTION = 'validation_reports';

class ValidationReport {
    static get collection() { return getDb().collection(COLLECTION); }

    static async upsertReport(version, mode, report, meta = {}) {
        const field = mode === 'ar' ? 'reportAr' : `report_${mode}`;
        return this.collection.updateOne(
            { version },
            {
                $set: {
                    version,
                    [field]: report,
                    [`meta_${mode}`]: meta,
                    updatedAt: new Date(),
                },
                $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
        );
    }

    static async findByVersion(version) {
        return this.collection.findOne({ version });
    }
}

module.exports = ValidationReport;
