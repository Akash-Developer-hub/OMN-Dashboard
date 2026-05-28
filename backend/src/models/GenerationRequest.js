'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'generation_requests';

const VALID_SERVICES = ['search', 'routing', 'tile'];
const VALID_STATUSES = ['generating', 'generation_completed', 'staging', 'production', 'failed'];
const VALID_FILE_TYPES = ['sqlite', 'osm'];

let indexesEnsured = false;

// Auto-generate sequential name: GEN-001, GEN-002, …
async function generateName(collection) {
    const last = await collection
        .find({ name: { $regex: /^GEN-\d+$/ } })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

    if (!last.length) return 'GEN-001';
    const num = parseInt(last[0].name.replace('GEN-', ''), 10);
    return `GEN-${String(num + 1).padStart(3, '0')}`;
}

class GenerationRequest {
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
        await this.collection.createIndex({ status: 1 }, { name: 'idx_gen_status' });
        await this.collection.createIndex({ createdAt: -1 }, { name: 'idx_gen_created' });
        await this.collection.createIndex({ name: 1 }, { name: 'idx_gen_name', unique: true });
        indexesEnsured = true;
    }

    static async create(data) {
        const now = Date.now();
        const name = await generateName(this.collection);
        const initialEntry = { status: 'generating', timestamp: now };
        const doc = {
            name,
            services: data.services,
            status: 'generating',
            timeline: [initialEntry],
            stagingServerId: null,
            createdAt: now,
            updatedAt: now,
        };
        const result = await this.collection.insertOne(doc);
        return this.toResponse({ ...doc, _id: result.insertedId });
    }

    static async createContribution(data) {
        const now = Date.now();
        const name = await generateName(this.collection);
        const initialEntry = { status: 'generating', timestamp: now, note: 'Contribution update started' };
        const doc = {
            name,
            type: 'contribution',
            services: [{ service: 'search', targetServerId: data.targetServerId }],
            contributionConfig: data.contributionConfig,
            contributionIds: data.contributionIds,
            status: 'generating',
            timeline: [initialEntry],
            stagingServerId: null,
            createdAt: now,
            updatedAt: now,
        };
        const result = await this.collection.insertOne(doc);
        return this.toResponse({ ...doc, _id: result.insertedId });
    }

    static async findAll(query = {}, { page = 1, limit = 20 } = {}) {
        await this.ensureIndexes().catch(() => {});
        const skip = (page - 1) * limit;
        const [docs, total] = await Promise.all([
            this.collection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            this.collection.countDocuments(query),
        ]);
        return { data: docs.map(this.toResponse.bind(this)), total, page, limit };
    }

    static async findById(id) {
        if (!this.isValidId(id)) return null;
        const doc = await this.collection.findOne({ _id: this.toObjectId(id) });
        return this.toResponse(doc);
    }

    /**
     * Transition to a new status and append a timeline entry.
     * @param {string} id
     * @param {string} newStatus
     * @param {{ note?: string, actorId?: string, serverId?: string }} [meta]
     */
    static async transition(id, newStatus, meta = {}) {
        if (!this.isValidId(id)) return null;
        const now = Date.now();
        const entry = { status: newStatus, timestamp: now, ...meta };

        const setFields = { status: newStatus, updatedAt: now };
        if (meta.serverId) setFields.stagingServerId = meta.serverId;

        const result = await this.collection.findOneAndUpdate(
            { _id: this.toObjectId(id) },
            {
                $set: setFields,
                $push: { timeline: entry },
            },
            { returnDocument: 'after' }
        );
        return this.toResponse(result);
    }
}

GenerationRequest.VALID_SERVICES = VALID_SERVICES;
GenerationRequest.VALID_STATUSES = VALID_STATUSES;
GenerationRequest.VALID_FILE_TYPES = VALID_FILE_TYPES;

module.exports = GenerationRequest;
