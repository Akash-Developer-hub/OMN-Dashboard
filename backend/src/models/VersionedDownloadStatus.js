'use strict';

const { getDb } = require('../../config/database');

const COLLECTION_PREFIX = 'download_status_';
const ensuredCollections = new Set();

function sanitizeVersion(version) {
    return String(version || 'v1.0')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'v1_0';
}

class VersionedDownloadStatus {
    static collectionNameForVersion(version) {
        return `${COLLECTION_PREFIX}${sanitizeVersion(version)}`;
    }

    static collectionForVersion(version) {
        return getDb().collection(this.collectionNameForVersion(version));
    }

    static toResponse(doc) {
        if (!doc) return null;
        return {
            ...doc,
            id: doc._id?.toString?.() || null,
        };
    }

    static async ensureIndexes(version) {
        const collectionName = this.collectionNameForVersion(version);
        if (ensuredCollections.has(collectionName)) return;

        const collection = this.collectionForVersion(version);

        try {
            await collection.createIndex({ workflow: 1 }, { name: 'idx_download_status_workflow', unique: true });
            await collection.createIndex({ runId: 1 }, { name: 'idx_download_status_runid', sparse: true });
            await collection.createIndex({ updatedAt: -1 }, { name: 'idx_download_status_updated' });
        } catch {
            // Index creation should not block status writes.
        }

        ensuredCollections.add(collectionName);
    }

    static async upsertByWorkflow(version, workflow, data) {
        await this.ensureIndexes(version).catch(() => {});

        const now = new Date().toISOString();
        const collection = this.collectionForVersion(version);
        const result = await collection.findOneAndUpdate(
            { workflow },
            {
                $set: {
                    ...data,
                    workflow,
                    version,
                    updatedAt: now,
                },
                $setOnInsert: {
                    createdAt: now,
                },
            },
            { upsert: true, returnDocument: 'after' }
        );

        return this.toResponse(result.value);
    }

    static async findAll(version) {
        await this.ensureIndexes(version).catch(() => {});

        const docs = await this.collectionForVersion(version)
            .find({})
            .sort({ updatedAt: -1 })
            .toArray();

        return docs.map(this.toResponse.bind(this));
    }
}

module.exports = VersionedDownloadStatus;