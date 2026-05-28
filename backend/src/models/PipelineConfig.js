'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'pipeline_configs';

let indexesEnsured = false;

class PipelineConfig {
    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static isValidId(id) {
        return ObjectId.isValid(id);
    }

    static toResponse(doc) {
        if (!doc) return null;
        return {
            ...doc,
            id: doc._id.toString(),
        };
    }

    static async ensureIndexes() {
        if (indexesEnsured) return;

        try {
            await this.collection.createIndex({ createdAt: -1 }, { name: 'idx_pipeline_config_created' });
            await this.collection.createIndex({ 'admin.id': 1 }, { name: 'idx_pipeline_config_admin_id' });
            await this.collection.createIndex({ mode: 1 }, { name: 'idx_pipeline_config_mode' });
            await this.collection.createIndex(
                { mode: 1, version: 1 },
                {
                    name: 'idx_pipeline_config_mode_version',
                    unique: true,
                    partialFilterExpression: { version: { $exists: true } },
                }
            );
            await this.collection.createIndex({ runId: 1 }, { name: 'idx_pipeline_config_run_id', sparse: true });
            await this.collection.createIndex({ 'serverPaths.targetServerId': 1 }, { name: 'idx_pipeline_config_target_server', sparse: true });
            await this.collection.createIndex({ 'serverPaths.copyFrom.sourceServerId': 1 }, { name: 'idx_pipeline_config_source_server', sparse: true });
        } catch {
            // Index creation failure should not block requests.
        }

        indexesEnsured = true;
    }

    static async create(data) {
        await this.ensureIndexes().catch(() => {});

        const now = new Date();
        const doc = {
            ...data,
            createdAt: now,
            updatedAt: now,
        };

        const result = await this.collection.insertOne(doc);
        return this.toResponse({ ...doc, _id: result.insertedId });
    }

    static async findById(id) {
        if (!this.isValidId(id)) return null;

        const doc = await this.collection.findOne({ _id: new ObjectId(id) });
        return this.toResponse(doc);
    }

    static async findAll({ limit = 50, offset = 0, adminId, mode, version, runId, serverId } = {}) {
        await this.ensureIndexes().catch(() => {});

        const filter = {};
        if (adminId) filter['admin.id'] = adminId;
        if (mode) filter.mode = mode;
        if (version) filter.version = version;
        if (runId) filter.runId = runId;

        const limitNum = Math.min(Math.max(Number(limit) || 50, 1), 100);
        const offsetNum = Math.max(Number(offset) || 0, 0);

        const [docs, total] = await Promise.all([
            this.collection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(offsetNum)
                .limit(limitNum)
                .toArray(),
            this.collection.countDocuments(filter),
        ]);

        return {
            configs: docs.map(this.toResponse.bind(this)),
            pagination: {
                total,
                limit: limitNum,
                offset: offsetNum,
                hasMore: offsetNum + limitNum < total,
            },
        };
    }
}

module.exports = PipelineConfig;
