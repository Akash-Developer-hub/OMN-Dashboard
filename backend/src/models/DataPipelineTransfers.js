'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'data_pipeline_transfers';

let indexesEnsured = false;

class DataPipelineTransfers {
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
            await this.collection.createIndex({ runId: 1 }, { name: 'idx_transfer_runid' });
            await this.collection.createIndex({ pipelineRunId: 1 }, { name: 'idx_transfer_pipelinerunid' });
            await this.collection.createIndex({ createdAt: -1 }, { name: 'idx_transfer_created' });
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
            updatedAt: new Date().toISOString(),
        };
        const result = await this.collection.insertOne(doc);
        return this.toResponse({ ...doc, _id: result.insertedId });
    }

    static async upsertByRunId(runId, data) {
        if (!runId) throw new Error('runId is required for upsert');
        await this.ensureIndexes().catch(() => {});
        
        const now = new Date().toISOString();
        // Exclude createdAt from $set to avoid conflict with $setOnInsert
        const { createdAt: _createdAt, ...dataWithoutCreatedAt } = data;
        const setData = {
            ...dataWithoutCreatedAt,
            runId,
            updatedAt: now,
        };

        const result = await this.collection.findOneAndUpdate(
            { runId },
            {
                $set: setData,
                $setOnInsert: {
                    createdAt: now,
                },
            },
            {
                upsert: true,
                returnDocument: 'after',
            }
        );

        const doc = result && result.value ? result.value : result;
        return this.toResponse(doc);
    }

    static async findByRunId(runId) {
        await this.ensureIndexes().catch(() => {});
        const doc = await this.collection.findOne({ runId });
        return this.toResponse(doc);
    }

    static async findByPipelineRunId(pipelineRunId) {
        await this.ensureIndexes().catch(() => {});
        const doc = await this.collection.findOne({ 
            pipelineRunId: this.toObjectId(pipelineRunId) 
        });
        return this.toResponse(doc);
    }

    static async updateByRunId(runId, updateData) {
        if (!runId) throw new Error('runId is required for update');
        await this.ensureIndexes().catch(() => {});
        
        const result = await this.collection.findOneAndUpdate(
            { runId },
            {
                $set: {
                    ...updateData,
                    updatedAt: new Date().toISOString(),
                },
            },
            {
                returnDocument: 'after',
            }
        );

        const doc = result && result.value ? result.value : result;
        return this.toResponse(doc);
    }
}

module.exports = DataPipelineTransfers;
