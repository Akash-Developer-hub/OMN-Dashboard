'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'servers';

const VALID_ENVIRONMENTS = ['development', 'staging', 'production'];

let indexesEnsured = false;

class Server {
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

        await this.collection.createIndex(
            { environment: 1 },
            { name: 'idx_server_environment' }
        );
        await this.collection.createIndex(
            { isActive: 1 },
            { name: 'idx_server_active' }
        );
        await this.collection.createIndex(
            { name: 1 },
            { name: 'idx_server_name' }
        );
        await this.collection.createIndex(
            { createdAt: -1 },
            { name: 'idx_server_created' }
        );

        indexesEnsured = true;
    }

    static async create(data) {
        const now = Date.now();
        const doc = {
            name: data.name,
            environment: data.environment,
            username: data.username || null,
            port: data.port || null,
            ipAddress: data.ipAddress,
            location: data.location || null,
            description: data.description || null,
            isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
            createdAt: now,
            updatedAt: now,
        };

        const result = await this.collection.insertOne(doc);
        return this.toResponse({ ...doc, _id: result.insertedId });
    }

    static async findAll(query = {}) {
        await this.ensureIndexes().catch(() => {});
        const docs = await this.collection
            .find(query)
            .sort({ environment: 1, createdAt: -1 })
            .toArray();
        return docs.map(this.toResponse);
    }

    static async findById(id) {
        if (!this.isValidId(id)) return null;
        const doc = await this.collection.findOne({ _id: this.toObjectId(id) });
        return this.toResponse(doc);
    }

    static async update(id, data) {
        if (!this.isValidId(id)) return null;

        const updateFields = { updatedAt: Date.now() };

        if (data.name !== undefined) updateFields.name = data.name;
        if (data.environment !== undefined) updateFields.environment = data.environment;
        if (data.username !== undefined) updateFields.username = data.username;
        if (data.port !== undefined) updateFields.port = data.port;
        if (data.ipAddress !== undefined) updateFields.ipAddress = data.ipAddress;
        if (data.location !== undefined) updateFields.location = data.location;
        if (data.description !== undefined) updateFields.description = data.description;
        if (data.isActive !== undefined) updateFields.isActive = Boolean(data.isActive);

        const result = await this.collection.findOneAndUpdate(
            { _id: this.toObjectId(id) },
            { $set: updateFields },
            { returnDocument: 'after' }
        );

        return this.toResponse(result);
    }

    static async delete(id) {
        if (!this.isValidId(id)) return false;
        const result = await this.collection.deleteOne({ _id: this.toObjectId(id) });
        return result.deletedCount === 1;
    }

    static async setActive(id, isActive) {
        if (!this.isValidId(id)) return null;
        const result = await this.collection.findOneAndUpdate(
            { _id: this.toObjectId(id) },
            { $set: { isActive: Boolean(isActive), updatedAt: Date.now() } },
            { returnDocument: 'after' }
        );
        return this.toResponse(result);
    }
}

Server.VALID_ENVIRONMENTS = VALID_ENVIRONMENTS;

module.exports = Server;