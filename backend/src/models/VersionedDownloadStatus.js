'use strict';

const { getDb } = require('../../config/database');
const logger = require('../../logs_/logger');

const COLLECTION_NAME = 'download_status';
const STATUS_DOC_ID_PREFIX = 'download_status_';
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
    static documentIdForVersion(version) {
        return `${STATUS_DOC_ID_PREFIX}${sanitizeVersion(version)}`;
    }

    static documentIdForDownload(version, createdAt) {
        const timestamp = String(createdAt || new Date().toISOString())
            .replace(/[^0-9a-z]/gi, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();

        return `${STATUS_DOC_ID_PREFIX}${sanitizeVersion(version)}_${timestamp}`;
    }

    static collectionNameForVersion() {
        return COLLECTION_NAME;
    }

    static collectionForVersion() {
        return getDb().collection(COLLECTION_NAME);
    }

    static toResponse(doc) {
        if (!doc) return null;
        const documentId = doc._id?.toString?.() || null;
        return {
            ...doc,
            documentId,
            id: this.documentIdForVersion(doc.version),
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
            documentId: versionDoc._id?.toString?.() || null,
            id: this.documentIdForVersion(versionDoc.version),
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

        const doc = await this.collectionForVersion(version).findOne({ _id: this.documentIdForVersion(version) });
        return this.toResponse(doc);
    }

    static async findLatestVersionDocument(version) {
        await this.ensureIndexes(version).catch(() => {});

        const doc = await this.collectionForVersion(version)
            .find({ version })
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(1)
            .next();

        return this.toResponse(doc);
    }

    static async findByRunId(version, workflow, runId) {
        if (!runId) return null;

        await this.ensureIndexes(version).catch(() => {});

        const doc = await this.collectionForVersion(version)
            .find({
                version,
                [`${workflow}.runId`]: runId,
            })
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(1)
            .next();

        return this.toResponse(doc);
    }

    static async findLegacyByWorkflow(version, workflow) {
        await this.ensureIndexes(version).catch(() => {});

        const doc = await this.collectionForVersion(version).findOne({ version, workflow });
        return this.toResponse(doc);
    }

    static async ensureIndexes(version) {
        const collectionName = this.collectionNameForVersion(version);
        if (ensuredCollections.has(collectionName)) return;

        const collection = this.collectionForVersion(version);

        try {
            await collection.createIndex({ version: 1 }, { name: 'idx_download_status_version' });
            await collection.createIndex({ version: 1, workflow: 1 }, { name: 'idx_download_status_version_workflow' });
            await collection.createIndex({ version: 1, runId: 1 }, { name: 'idx_download_status_version_runid', sparse: true });
            await collection.createIndex({ version: 1, 'searchTiles.runId': 1 }, { name: 'idx_download_status_searchtiles_runid', sparse: true });
            await collection.createIndex({ version: 1, 'routing.runId': 1 }, { name: 'idx_download_status_routing_runid', sparse: true });
            await collection.createIndex({ updatedAt: -1 }, { name: 'idx_download_status_updated' });
        } catch {
            // Index creation should not block status writes.
        }

        ensuredCollections.add(collectionName);
    }

    static async findByWorkflow(version, workflow, runId) {
        const runDoc = await this.findByRunId(version, workflow, runId);
        const runWorkflowDoc = this.toWorkflowResponse(runDoc, workflow);
        if (runWorkflowDoc) return runWorkflowDoc;
        if (runId) return null;

        const versionDoc = await this.findLatestVersionDocument(version);
        const nestedWorkflowDoc = this.toWorkflowResponse(versionDoc, workflow);
        if (nestedWorkflowDoc) return nestedWorkflowDoc;

        return this.findLegacyByWorkflow(version, workflow);
    }

    static async upsertByWorkflow(version, workflow, data) {
        await this.ensureIndexes(version).catch(() => {});

        const now = new Date().toISOString();
        const collection = this.collectionForVersion(version);
        const existingRunDoc = await this.findByRunId(version, workflow, data?.runId);
        const documentId = existingRunDoc?._id || this.documentIdForDownload(version, now);
        const existingVersionDoc = await collection.findOne({ _id: documentId });
        const existingWorkflowDoc = existingVersionDoc && typeof existingVersionDoc[workflow] === 'object' && !Array.isArray(existingVersionDoc[workflow])
            ? existingVersionDoc[workflow]
            : null;
        const createdAt = existingVersionDoc?.createdAt || now;
        const workflowData = {
            ...data,
            workflow,
            version,
            createdAt: existingWorkflowDoc?.createdAt || createdAt,
            updatedAt: now,
        };
        const result = await collection.findOneAndUpdate(
            { _id: documentId },
            {
                $set: {
                    [workflow]: workflowData,
                    version,
                    updatedAt: now,
                },
                $setOnInsert: {
                    createdAt,
                },
            },
            { upsert: true, returnDocument: 'after' }
        );

        const doc = result && result.value ? result.value : result;
        logger.info('Versioned download status upsert raw result.', {
            workflow,
            version,
            collectionName: this.collectionNameForVersion(version),
            documentId,
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

        const versionDocs = await this.collectionForVersion(version)
            .find({ version })
            .sort({ updatedAt: -1, createdAt: -1 })
            .toArray();
        const nestedStatuses = versionDocs.flatMap((versionDoc) =>
            WORKFLOW_KEYS
                .map((workflow) => this.toWorkflowResponse(versionDoc, workflow))
                .filter(Boolean)
        );

        const workflowsInVersionDoc = new Set(nestedStatuses.map((entry) => entry.workflow));

        const legacyDocs = await this.collectionForVersion(version)
            .find({ version, workflow: { $in: WORKFLOW_KEYS.filter((workflow) => !workflowsInVersionDoc.has(workflow)) } })
            .sort({ updatedAt: -1 })
            .toArray();

        return [
            ...nestedStatuses,
            ...legacyDocs.map(this.toResponse.bind(this)),
        ];
    }

    static async findLatestDocument() {
        const collectionName = this.collectionNameForVersion();
        const docs = await getDb().collection(collectionName)
            .find({})
            .sort({ updatedAt: -1, createdAt: -1 })
            .toArray();
        const candidates = docs.map((doc) => this.buildLatestCandidate(collectionName, doc));

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
