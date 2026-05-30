'use strict';

require('dotenv').config();

const { connectDb, closeDb } = require('../config/database');

const WORKFLOW_KEYS = ['searchTiles', 'routing'];

function toTimestamp(value) {
    if (!value) return 0;

    const date = new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
}

function pickLatestWorkflowEntry(doc) {
    return WORKFLOW_KEYS
        .map((workflow) => {
            const entry = doc && typeof doc[workflow] === 'object' && !Array.isArray(doc[workflow])
                ? doc[workflow]
                : null;

            if (!entry) return null;

            return {
                workflow,
                entry,
                updatedAt: toTimestamp(entry.updatedAt),
                createdAt: toTimestamp(entry.createdAt),
            };
        })
        .filter(Boolean)
        .sort((left, right) => {
            const createdDelta = right.createdAt - left.createdAt;
            if (createdDelta !== 0) return createdDelta;
            return right.updatedAt - left.updatedAt;
        })[0] || null;
}

function buildCandidate(collectionName, doc) {
    const latestWorkflow = pickLatestWorkflowEntry(doc);
    const createdAt = Math.max(
        toTimestamp(doc?.createdAt),
        latestWorkflow?.createdAt || 0
    );
    const updatedAt = Math.max(
        toTimestamp(doc?.updatedAt),
        latestWorkflow?.updatedAt || 0
    );

    return {
        collectionName,
        doc,
        latestWorkflow,
        updatedAt,
        createdAt,
    };
}

async function main() {
    const db = await connectDb();
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const statusCollections = collections
        .map((entry) => entry.name)
        .filter((name) => /^download_status_/i.test(name));

    if (statusCollections.length === 0) {
        console.log('No collections matching download_status_* were found.');
        return;
    }

    const candidates = [];

    for (const collectionName of statusCollections) {
        const doc = await db.collection(collectionName).findOne({}, { sort: { createdAt: -1, updatedAt: -1 } });
        if (!doc) continue;
        candidates.push(buildCandidate(collectionName, doc));
    }

    if (candidates.length === 0) {
        console.log('No documents found in download_status_* collections.');
        return;
    }

    candidates.sort((left, right) => {
        const createdDelta = right.createdAt - left.createdAt;
        if (createdDelta !== 0) return createdDelta;
        return right.updatedAt - left.updatedAt;
    });

    const latest = candidates[0];
    const latestWorkflow = latest.latestWorkflow;

    console.log('Collection:', latest.collectionName);
    console.log('Document ID:', latest.doc?._id || null);
    console.log('Version:', latest.doc?.version || null);
    console.log('Document createdAt:', latest.doc?.createdAt || null);
    console.log('Document updatedAt:', latest.doc?.updatedAt || null);

    if (latestWorkflow) {
        console.log('Latest workflow key:', latestWorkflow.workflow);
        console.log('Latest workflow status:', latestWorkflow.entry?.status || null);
        console.log('Latest workflow runId:', latestWorkflow.entry?.runId || null);
        console.log('Latest workflow updatedAt:', latestWorkflow.entry?.updatedAt || null);
    } else {
        console.log('Latest workflow key:', latest.doc?.workflow || null);
        console.log('Latest workflow status:', latest.doc?.status || null);
        console.log('Latest workflow runId:', latest.doc?.runId || null);
        console.log('Latest workflow updatedAt:', latest.doc?.updatedAt || null);
    }

    console.log('Document JSON:');
    console.log(JSON.stringify(latest.doc, null, 2));
}

main()
    .catch((error) => {
        console.error('Check failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDb().catch(() => {});
    });