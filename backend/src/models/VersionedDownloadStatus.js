'use strict';

const { getDb } = require('../../config/database');
const logger = require('../../logs_/logger');

const COLLECTION_PREFIX = 'download_status_';
const STATUS_DOC_ID = 'download_status';
const WORKFLOW_KEYS = ['searchTiles', 'routing'];
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

    static toWorkflowResponse(versionDoc, workflow) {
        const workflowDoc = versionDoc && typeof versionDoc[workflow] === 'object' && !Array.isArray(versionDoc[workflow])
            ? versionDoc[workflow]
            : null;

        if (!workflowDoc) return null;

        return {
            ...workflowDoc,
            workflow,
            version: versionDoc.version || null,
            id: versionDoc._id?.toString?.() || null,
        };
    }

    static toTimestamp(value) {
        if (!value) return 0;

        const date = new Date(value);
        const time = date.getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    static pickLatestWorkflowEntry(doc) {
        return WORKFLOW_KEYS
            .map((workflow) => {
                const entry = doc && typeof doc[workflow] === 'object' && !Array.isArray(doc[workflow])
                    ? doc[workflow]
                    : null;

                if (!entry) return null;

                return {
                    workflow,
                    entry,
                    updatedAt: this.toTimestamp(entry.updatedAt),
                    createdAt: this.toTimestamp(entry.createdAt),
                };
            })
            .filter(Boolean)
            .sort((left, right) => {
                const createdDelta = right.createdAt - left.createdAt;
                if (createdDelta !== 0) return createdDelta;
                return right.updatedAt - left.updatedAt;
            })[0] || null;
    }

    static buildLatestCandidate(collectionName, doc) {
        const latestWorkflow = this.pickLatestWorkflowEntry(doc);
        const createdAt = Math.max(
            this.toTimestamp(doc?.createdAt),
            latestWorkflow?.createdAt || 0
        );
        const updatedAt = Math.max(
            this.toTimestamp(doc?.updatedAt),
            latestWorkflow?.updatedAt || 0
        );

        return {
            collectionName,
            document: this.toResponse(doc),
            latestWorkflow: latestWorkflow
                ? {
                    workflow: latestWorkflow.workflow,
                    status: latestWorkflow.entry?.status || null,
                    runId: latestWorkflow.entry?.runId || null,
                    updatedAt: latestWorkflow.entry?.updatedAt || null,
                    entry: latestWorkflow.entry,
                }
                : null,
            updatedAt,
            createdAt,
        };
    }

    static async findVersionDocument(version) {
        await this.ensureIndexes(version).catch(() => {});

        const doc = await this.collectionForVersion(version).findOne({ _id: STATUS_DOC_ID });
        return this.toResponse(doc);
    }

    static async findLegacyByWorkflow(version, workflow) {
        await this.ensureIndexes(version).catch(() => {});

        const doc = await this.collectionForVersion(version).findOne({ workflow });
        return this.toResponse(doc);
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

    static async findByWorkflow(version, workflow) {
        const versionDoc = await this.findVersionDocument(version);
        const nestedWorkflowDoc = this.toWorkflowResponse(versionDoc, workflow);
        if (nestedWorkflowDoc) return nestedWorkflowDoc;

        return this.findLegacyByWorkflow(version, workflow);
    }

    static async upsertByWorkflow(version, workflow, data) {
        await this.ensureIndexes(version).catch(() => {});

        const now = new Date().toISOString();
        const collection = this.collectionForVersion(version);
        const existingVersionDoc = await collection.findOne({ _id: STATUS_DOC_ID });
        const existingWorkflowDoc = existingVersionDoc && typeof existingVersionDoc[workflow] === 'object' && !Array.isArray(existingVersionDoc[workflow])
            ? existingVersionDoc[workflow]
            : null;
        const workflowData = {
            ...data,
            workflow,
            version,
            createdAt: existingWorkflowDoc?.createdAt || now,
            updatedAt: now,
        };
        const result = await collection.findOneAndUpdate(
            { _id: STATUS_DOC_ID },
            {
                $set: {
                    [workflow]: workflowData,
                    version,
                    updatedAt: now,
                },
                $setOnInsert: {
                    createdAt: now,
                },
            },
            { upsert: true, returnDocument: 'after' }
        );

        const doc = result && result.value ? result.value : result;
        logger.info('Versioned download status upsert raw result.', {
            workflow,
            version,
            hasValueWrapper: Boolean(result && result.value),
            rawResultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
            resolvedDocKeys: doc && typeof doc === 'object' ? Object.keys(doc) : [],
        });

        return {
            document: this.toResponse(doc),
            workflowStatus: this.toWorkflowResponse(doc, workflow),
        };
    }

    static async findAll(version) {
        await this.ensureIndexes(version).catch(() => {});

        const versionDoc = await this.findVersionDocument(version);
        const nestedStatuses = WORKFLOW_KEYS
            .map((workflow) => this.toWorkflowResponse(versionDoc, workflow))
            .filter(Boolean);

        const workflowsInVersionDoc = new Set(nestedStatuses.map((entry) => entry.workflow));

        const legacyDocs = await this.collectionForVersion(version)
            .find({ workflow: { $in: WORKFLOW_KEYS.filter((workflow) => !workflowsInVersionDoc.has(workflow)) } })
            .sort({ updatedAt: -1 })
            .toArray();

        return [
            ...nestedStatuses,
            ...legacyDocs.map(this.toResponse.bind(this)),
        ];
    }

    static async findLatestDocument() {
        const db = getDb();
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        const statusCollections = collections
            .map((entry) => entry.name)
            .filter((name) => /^download_status_/i.test(name));

        if (statusCollections.length === 0) return null;

        const candidates = [];

        for (const collectionName of statusCollections) {
            const doc = await db.collection(collectionName).findOne({}, { sort: { createdAt: -1, updatedAt: -1 } });
            if (!doc) continue;

            candidates.push(this.buildLatestCandidate(collectionName, doc));
        }

        if (candidates.length === 0) return null;

        candidates.sort((left, right) => {
            const createdDelta = right.createdAt - left.createdAt;
            if (createdDelta !== 0) return createdDelta;
            return right.updatedAt - left.updatedAt;
        });

        const latest = candidates[0];
        return {
            collectionName: latest.collectionName,
            latestWorkflow: latest.latestWorkflow,
            document: latest.document,
        };
    }
}

module.exports = VersionedDownloadStatus;