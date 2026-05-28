'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'data_pipeline_runs';

let indexesEnsured = false;

class DataPipelineRun {
    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static toObjectId(id) {
        return id instanceof ObjectId ? id : new ObjectId(id);
    }

    static isValidId(id) {
        return ObjectId.isValid(id);
    }

    static toResponse(doc) {
        if (!doc) return null;
        return { ...doc, id: doc._id.toString() };
    }

    static async ensureIndexes() {
        if (indexesEnsured) return;
        try {
            // Add unique index on runId to prevent duplicate documents
            await this.collection.createIndex({ runId: 1 }, { name: 'idx_pipeline_runid', unique: true });
            await this.collection.createIndex({ createdAt: -1 }, { name: 'idx_pipeline_created' });
        } catch (e) {
            // ignore
        }
        indexesEnsured = true;
    }

    static async create(data) {
        await this.ensureIndexes().catch(() => {});
        const doc = {
            ...data,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: Date.now(),
        };
        const result = await this.collection.insertOne(doc);
        return this.toResponse({ ...doc, _id: result.insertedId });
    }

    static async upsertByRunId(runId, data, unsetKeys = []) {
        if (!runId) throw new Error('runId is required for upsert');
        await this.ensureIndexes().catch(() => {});
        const nowIso = data.createdAt || new Date().toISOString();
        // Avoid setting `runId` in both $set and $setOnInsert (MongoDB conflict).
        // Only set `runId` and `createdAt` on insert; update `updatedAt` and other fields on every upsert.
        // eslint-disable-next-line no-unused-vars
        const { runId: _runId, createdAt: _createdAt, ...rest } = data || {};
        const setData = {
            ...rest,
            updatedAt: Date.now(),
        };

        const updateOps = { $set: setData, $setOnInsert: { runId, createdAt: nowIso } };
        if (Array.isArray(unsetKeys) && unsetKeys.length > 0) {
            // eslint-disable-next-line no-param-reassign, security/detect-object-injection
            updateOps.$unset = unsetKeys.reduce((acc, k) => { acc[k] = ''; return acc; }, {});
        }

        const result = await this.collection.findOneAndUpdate(
            { runId },
            updateOps,
            { upsert: true, returnDocument: 'after' }
        );

        // result.value contains the updated/inserted document
        return this.toResponse(result.value);
    }

    static async findByRunId(runId) {
        if (!runId) return null;
        const doc = await this.collection.findOne({ runId });
        return this.toResponse(doc);
    }

    static async findAll({ limit = 50 } = {}) {
        await this.ensureIndexes().catch(() => {});
        const docs = await this.collection.find({}).sort({ createdAt: -1 }).limit(Number(limit)).toArray();
        return docs.map(this.toResponse.bind(this));
    }
}

module.exports = DataPipelineRun;
