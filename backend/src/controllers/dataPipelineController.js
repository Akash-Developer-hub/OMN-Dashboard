/* eslint-disable security/detect-object-injection */
/* eslint-disable no-inner-declarations */
'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const DataPipelineRun = require('../models/DataPipelineRun');
const DataPipelineTransfers = require('../models/DataPipelineTransfers');
const logger = require('../../logs_/logger');

class DataPipelineController {
    static extractRunIdFromValue = (value, seen = new Set()) => {
        if (!value || typeof value !== 'object') {
            return null;
        }

        if (seen.has(value)) {
            return null;
        }
        seen.add(value);

        if (typeof value.runId === 'string' && value.runId.trim()) {
            return value.runId.trim();
        }

        if (Array.isArray(value)) {
            for (const entry of value) {
                const extracted = DataPipelineController.extractRunIdFromValue(entry, seen);
                if (extracted) {
                    return extracted;
                }
            }
            return null;
        }

        for (const nestedValue of Object.values(value)) {
            const extracted = DataPipelineController.extractRunIdFromValue(nestedValue, seen);
            if (extracted) {
                return extracted;
            }
        }

        return null;
    };

    static normalizeResultPayload = (item) => {
        if (!item || typeof item !== 'object') {
            return null;
        }

        const normalized = { ...item };

        if (Array.isArray(normalized.result)) {
            normalized.result = normalized.result.map(entry => (entry && typeof entry === 'object' ? { ...entry } : entry));
        }

        return normalized;
    };

    /**
     * POST /api/v1/admin-dashboard/data-pipeline
     * Accepts pre-organized pipeline payload with services already grouped by runId.
     * 
     * Expected format:
     * [
     *   {
     *     "runId": "run_xyz",
     *     "createdAt": "2026-05-06T10:54:44.634Z",
     *     "services": {
     *       "search": { service data },
     *       "routing": { service data }
     *     },
     *     "servicesList": ["search", "routing"]
     *   }
     * ]
     */
    static createRun = async (req, res) => {
        try {
            const payload = req.body || {};

            // Handle both array and single object payloads
            const items = Array.isArray(payload) ? payload : [payload];

            if (items.length === 0) {
                return ApiResponse.error(res, 400, 'Payload is required.');
            }

            // Validate all items have runId
            for (let i = 0; i < items.length; i++) {
                if (!items[i].runId) {
                    return ApiResponse.error(res, 400, `Item ${i} must have a runId.`);
                }
            }

            logger.info(`DataPipeline createRun: Processing ${items.length} pipeline document(s)`, {
                runIds: items.map(item => item.runId)
            });

            const results = [];

            // Process each pipeline document - single upsert per runId
            for (const pipelineDoc of items) {
                const {
                    runId,
                    createdAt: incomingCreatedAt,
                    services = {},
                    servicesList = [],
                    ...additionalTopLevelFields
                } = pipelineDoc;
                const now = new Date().toISOString();

                // Validate services object
                if (typeof services !== 'object' || services === null || Array.isArray(services)) {
                    return ApiResponse.error(res, 400, `services must be an object for runId ${runId}.`);
                }

                // Use provided servicesList or derive from services keys
                const finalServicesList = Array.isArray(servicesList) && servicesList.length > 0
                    ? servicesList
                    : Object.keys(services);

                if (finalServicesList.length === 0) {
                    return ApiResponse.error(res, 400, `No services found for runId ${runId}.`);
                }

                logger.info(`DataPipeline createRun: Upserting runId ${runId}`, {
                    services: finalServicesList,
                    serviceCount: finalServicesList.length
                });

                // Prepare createdAt - only for insert
                let createdAt = incomingCreatedAt || new Date().toISOString();
                if (createdAt instanceof Date) {
                    createdAt = createdAt.toISOString();
                } else if (typeof createdAt === 'string') {
                    // Validate ISO string format
                    if (!createdAt.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                        createdAt = new Date().toISOString();
                    }
                }

                // Build atomic MongoDB update operations
                const mongoUpdateOps = {
                    $set: {
                        runId,
                        updatedAt: now,
                    }
                };

                // Collect all field names that exist in any service (these should not be duplicated at top level)
                const serviceFieldNames = new Set();
                for (const serviceObj of Object.values(services)) {
                    if (serviceObj && typeof serviceObj === 'object') {
                        Object.keys(serviceObj).forEach(key => serviceFieldNames.add(key));
                    }
                }

                // Persist additional top-level fields (e.g. isnotify) provided in payload.
                // Skip any fields that already exist in services - they belong exclusively within the services object.
                for (const [field, value] of Object.entries(additionalTopLevelFields)) {
                    if (value !== undefined && !serviceFieldNames.has(field)) {
                        mongoUpdateOps.$set[field] = value;
                    }
                }

                // Set individual service fields using dot notation (atomic per field)
                const servicesListSet = [];
                for (const serviceName of finalServicesList) {
                    const serviceObj = services[serviceName] || {};

                    for (const [field, value] of Object.entries(serviceObj)) {
                        mongoUpdateOps.$set[`services.${serviceName}.${field}`] = value;
                    }

                    servicesListSet.push(serviceName);
                }

                if (servicesListSet.length > 0) {
                    mongoUpdateOps.$addToSet = {
                        servicesList: { $each: servicesListSet },
                    };
                }

                // Build $setOnInsert separately so we can handle it on retry
                const setOnInsert = { createdAt: createdAt };

                // Upsert with retry for concurrent E11000 errors
                let result;
                let retries = 2;
                let lastError;

                while (retries >= 0) {
                    try {
                        const updateOps = { $set: mongoUpdateOps.$set };
                        if (mongoUpdateOps.$addToSet) {
                            updateOps.$addToSet = mongoUpdateOps.$addToSet;
                        }

                        // Only use $setOnInsert on first attempt (when trying to create)
                        if (retries === 2) {
                            updateOps.$setOnInsert = setOnInsert;
                            const shouldUpsert = true;

                            result = await DataPipelineRun.collection.findOneAndUpdate(
                                { runId },
                                updateOps,
                                {
                                    upsert: shouldUpsert,
                                    returnDocument: 'after',
                                }
                            );
                            break; // Success, exit retry loop
                        } else {
                            // On retry, don't upsert - document was already created by concurrent request
                            const shouldUpsert = false;

                            result = await DataPipelineRun.collection.findOneAndUpdate(
                                { runId },
                                updateOps,
                                {
                                    upsert: shouldUpsert,
                                    returnDocument: 'after',
                                }
                            );
                            break; // Success, exit retry loop
                        }
                    } catch (err) {
                        // Handle duplicate key errors from concurrent inserts
                        if ((err.code === 11000 || err.message?.includes('E11000')) && retries > 0) {
                            retries--;
                            lastError = err;
                            // Wait briefly and retry as update (without upsert)
                            await new Promise(resolve => setTimeout(resolve, 25));
                            logger.debug(`DataPipeline createRun: Retrying as update for runId ${runId}`);
                            continue;
                        }
                        throw err;
                    }
                }

                if (!result && lastError) {
                    throw lastError;
                }

                // Handle both response formats from findOneAndUpdate
                const savedDocRaw = result && result.value ? result.value : result;
                const savedDoc = savedDocRaw ? DataPipelineRun.toResponse(savedDocRaw) : null;

                results.push(savedDoc);
            }

            // Return appropriate response
            const message = results.length === 1
                ? 'Pipeline run processed.'
                : `${results.length} pipeline run(s) processed.`;

            const responseData = results.length === 1 ? results[0] : results;
            return ApiResponse.success(res, 200, message, responseData);
        } catch (err) {
            logger.error('DataPipeline createRun error:', err && err.message ? err.message : String(err));
            return ApiResponse.error(res, 500, err && err.message ? err.message : String(err));
        }
    };

    /**
     * PATCH /api/v1/admin-dashboard/data-pipeline/update-results
     * Stores pipeline generation results in data_pipeline_runs using runId upserts.
     * The incoming payload is expected to contain a result array, but the field
     * structure is otherwise treated dynamically.
     */
    static updateResults = async (req, res) => {
        try {
            const payload = req.body || {};
            const items = Array.isArray(payload) ? payload : [payload];

            if (items.length === 0) {
                return ApiResponse.error(res, 400, 'Payload is required.');
            }

            const results = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];

                if (!item || typeof item !== 'object') {
                    return ApiResponse.error(res, 400, `Item ${i} must be an object.`);
                }

                if (!Array.isArray(item.result) || item.result.length === 0) {
                    return ApiResponse.error(res, 400, `Item ${i} must include a non-empty result array.`);
                }

                const runId = DataPipelineController.extractRunIdFromValue(item) || DataPipelineController.extractRunIdFromValue(item.result);
                if (!runId) {
                    return ApiResponse.error(res, 400, `Unable to determine runId for item ${i}.`);
                }

                const now = new Date().toISOString();
                const existingDoc = await DataPipelineRun.findByRunId(runId);
                const normalizedItem = DataPipelineController.normalizeResultPayload(item);
                const { createdAt: incomingCreatedAt, ...resultFields } = normalizedItem;

                const updateDoc = {
                    ...resultFields,
                    runId,
                    updatedAt: now,
                };

                const createdAt = existingDoc && existingDoc.createdAt
                    ? existingDoc.createdAt
                    : (incomingCreatedAt || item.createdAt || now);

                const savedRaw = await DataPipelineRun.collection.findOneAndUpdate(
                    { runId },
                    {
                        $set: updateDoc,
                        $setOnInsert: {
                            createdAt,
                        },
                    },
                    {
                        upsert: true,
                        returnDocument: 'after',
                    }
                );

                const savedDocRaw = savedRaw && savedRaw.value ? savedRaw.value : savedRaw;
                results.push(savedDocRaw ? DataPipelineRun.toResponse(savedDocRaw) : null);
            }

            const message = results.length === 1
                ? 'Pipeline results stored.'
                : `${results.length} pipeline result payload(s) stored.`;

            const responseData = results.length === 1 ? results[0] : results;
            return ApiResponse.success(res, 200, message, responseData);
        } catch (err) {
            logger.error('DataPipeline updateResults error:', err && err.message ? err.message : String(err));
            return ApiResponse.error(res, 500, err && err.message ? err.message : String(err));
        }
    };

    /**
     * PATCH /api/v1/admin-dashboard/data-pipeline/update
     * Update service status/logs for a runId.
     * Accepts both single object and array of objects.
     * Dynamically filters service-specific fields to prevent duplication at top level.
     *
     * Body example (single):
     * {
     *   "runId": "run_a0ma31",
     *   "service": "routing",
     *   "command": "...",
     *   "fileInputPath": "...",
     *   "routingStatus": "success",
     *   "routingLog": "..."
     * }
     *
     * Body example (array):
     * [
     *   { "runId": "run_a0ma31", "service": "routing", ... },
     *   { "runId": "run_a0ma31", "service": "search", ... }
     * ]
     */
    static updateServiceRun = async (req, res) => {
        try {
            const payload = req.body || {};
            const items = Array.isArray(payload) ? payload : [payload];

            if (items.length === 0) {
                return ApiResponse.error(res, 400, 'Payload is required.');
            }

            const results = [];

            for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
                const payloadItem = items[itemIdx];

                if (!payloadItem || typeof payloadItem !== 'object') {
                    return ApiResponse.error(res, 400, `Item ${itemIdx} must be an object.`);
                }

                const { runId, sId, service, restartStatus } = payloadItem;

                if (!runId) {
                    return ApiResponse.error(res, 400, `Item ${itemIdx}: runId is required.`);
                }

                // Support payloads with nested result[].services (e.g. update-results style)
                if (!service && restartStatus === undefined && Array.isArray(payloadItem.result) && payloadItem.result.length > 0 && payloadItem.result.some(r => r && r.services && typeof r.services === 'object')) {
                    // For each service inside result entries, apply an update
                    const serviceEntries = {};
                    for (const resEntry of payloadItem.result) {
                        if (!resEntry || typeof resEntry !== 'object' || !resEntry.services) continue;
                        for (const [svcName, svcData] of Object.entries(resEntry.services)) {
                            serviceEntries[svcName] = serviceEntries[svcName] || {};
                            // merge svcData into serviceEntries[svcName]
                            if (svcData && typeof svcData === 'object') {
                                Object.assign(serviceEntries[svcName], svcData);
                            }
                        }
                    }

                    // Apply updates per service
                    for (const [svcName, svcData] of Object.entries(serviceEntries)) {
                        const existingDocForSvc = await DataPipelineRun.findByRunId(runId);
                        const isNewForSvc = !existingDocForSvc;
                        const updateObjSvc = { updatedAt: new Date().toISOString() };

                        // map known status/log/time fields
                        if (svcData.status !== undefined) updateObjSvc[`services.${svcName}.status`] = svcData.status;
                        if (svcData.log !== undefined) updateObjSvc[`services.${svcName}.log`] = svcData.log;
                        if (svcData.startTime !== undefined) updateObjSvc[`services.${svcName}.startTime`] = svcData.startTime;
                        if (svcData.endTime !== undefined) updateObjSvc[`services.${svcName}.endTime`] = svcData.endTime;

                        // copy other service-specific keys into the nested service object
                        for (const [k, v] of Object.entries(svcData)) {
                            if (['status', 'log', 'startTime', 'endTime'].includes(k)) continue;
                            if (v === undefined) continue;
                            updateObjSvc[`services.${svcName}.${k}`] = v;
                        }

                        const mongoUpdateOpsSvc = { $set: updateObjSvc };
                        if (isNewForSvc) {
                            mongoUpdateOpsSvc.$setOnInsert = {
                                runId,
                                createdAt: payloadItem.createdAt || new Date().toISOString(),
                                services: { [svcName]: { service: svcName, ...(sId !== undefined ? { sId } : {}) } },
                                servicesList: [svcName],
                            };
                        }
                        mongoUpdateOpsSvc.$addToSet = { servicesList: svcName };

                        await DataPipelineRun.collection.findOneAndUpdate(
                            { runId },
                            mongoUpdateOpsSvc,
                            { upsert: true, returnDocument: 'after' }
                        );
                    }

                    // Push the final doc state once
                    const finalDoc = await DataPipelineRun.findByRunId(runId);
                    results.push(finalDoc);
                    continue; // move to next payload item
                }

                // Support payloads where services is a top-level nested object (e.g. full run document)
                if (!service && restartStatus === undefined && payloadItem.services && typeof payloadItem.services === 'object' && !Array.isArray(payloadItem.services) && Object.keys(payloadItem.services).length > 0) {
                    const updateObjTop = { updatedAt: new Date().toISOString() };
                    // servicesList is excluded here — managed exclusively via $addToSet to avoid conflicts
                    const topLevelReserved = new Set(['runId', 'createdAt', 'updatedAt', '_id', 'id', 'services', 'servicesList']);

                    // Set top-level scalar fields
                    for (const [k, v] of Object.entries(payloadItem)) {
                        if (topLevelReserved.has(k) || v === undefined) continue;
                        updateObjTop[k] = v;
                    }

                    // Set nested service fields using dot notation
                    for (const [svcName, svcData] of Object.entries(payloadItem.services)) {
                        if (!svcData || typeof svcData !== 'object') continue;
                        for (const [k, v] of Object.entries(svcData)) {
                            if (v === undefined) continue;
                            updateObjTop[`services.${svcName}.${k}`] = v;
                        }
                        updateObjTop[`services.${svcName}.service`] = svcName;
                    }

                    const serviceNames = Object.keys(payloadItem.services);
                    const existingDocTop = await DataPipelineRun.findByRunId(runId);
                    const isNewTop = !existingDocTop;

                    // $addToSet is the sole owner of servicesList — do NOT put it in $set or $setOnInsert
                    const mongoOpsTop = { $set: updateObjTop, $addToSet: { servicesList: { $each: serviceNames } } };
                    if (isNewTop) {
                        mongoOpsTop.$setOnInsert = {
                            runId,
                            createdAt: payloadItem.createdAt || new Date().toISOString(),
                        };
                    }

                    await DataPipelineRun.collection.findOneAndUpdate(
                        { runId },
                        mongoOpsTop,
                        { upsert: true, returnDocument: 'after' }
                    );

                    const finalDocTop = await DataPipelineRun.findByRunId(runId);
                    results.push(finalDocTop);
                    continue;
                }

                const existingDoc = await DataPipelineRun.findByRunId(runId);
                const isNew = !existingDoc;
                const existingRootKeys = new Set(existingDoc ? Object.keys(existingDoc) : []);
                const existingServiceDoc = service && existingDoc && existingDoc.services && typeof existingDoc.services === 'object'
                    ? existingDoc.services[service]
                    : null;

                const updateObj = {
                    updatedAt: new Date().toISOString(),
                };

                const reservedFields = new Set([
                    'runId',
                    'service',
                    'sId',
                    'restartStatus',
                    'createdAt',
                    'updatedAt',
                    '_id',
                    'id',
                    'statuses',
                ]);

                for (const [key, value] of Object.entries(payloadItem)) {
                    if (value === undefined || reservedFields.has(key)) {
                        continue;
                    }

                    if (service && key === `${service}Status`) {
                        updateObj[`services.${service}.status`] = value;
                        continue;
                    }

                    if (service && key === `${service}Log`) {
                        updateObj[`services.${service}.log`] = value;
                        continue;
                    }

                    if (service && (key === `${service}startTime` || key === `${service}StartTime`)) {
                        updateObj[`services.${service}.startTime`] = value;
                        continue;
                    }

                    if (service && (key === `${service}endTime` || key === `${service}EndTime`)) {
                        updateObj[`services.${service}.endTime`] = value;
                        continue;
                    }

                    if (key === 'status' && service) {
                        updateObj[`services.${service}.status`] = value;
                        continue;
                    }

                    if (key === 'log' && service) {
                        updateObj[`services.${service}.log`] = value;
                        continue;
                    }

                    if (key === 'startTime' && service) {
                        updateObj[`services.${service}.startTime`] = value;
                        continue;
                    }

                    if (key === 'endTime' && service) {
                        updateObj[`services.${service}.endTime`] = value;
                        continue;
                    }

                    if (existingRootKeys.has(key) || !service) {
                        updateObj[key] = value;
                        continue;
                    }

                    const serviceFieldExists = existingServiceDoc && typeof existingServiceDoc === 'object'
                        ? Object.prototype.hasOwnProperty.call(existingServiceDoc, key)
                        : false;

                    if (serviceFieldExists) {
                        updateObj[`services.${service}.${key}`] = value;
                        continue;
                    }

                    updateObj[`services.${service}.${key}`] = value;
                }

                if (restartStatus !== undefined) {
                    updateObj.restartStatus = restartStatus;
                }

                const mongoUpdateOps = { $set: updateObj };

                if (isNew) {
                    mongoUpdateOps.$setOnInsert = {
                        runId,
                        createdAt: payloadItem.createdAt || new Date().toISOString(),
                        services: service ? {
                            [service]: {
                                service,
                                ...(sId !== undefined ? { sId } : {}),
                            },
                        } : {},
                        servicesList: service ? [service] : [],
                    };
                }

                if (service) {
                    mongoUpdateOps.$addToSet = { servicesList: service };
                    mongoUpdateOps.$set[`services.${service}.service`] = service;
                    if (sId !== undefined) {
                        mongoUpdateOps.$set[`services.${service}.sId`] = sId;
                    }
                }

                const savedRaw = await DataPipelineRun.collection.findOneAndUpdate(
                    { runId },
                    mongoUpdateOps,
                    { upsert: true, returnDocument: 'after' }
                );

                const savedDocRaw = savedRaw && savedRaw.value ? savedRaw.value : savedRaw;
                const saved = DataPipelineRun.toResponse(savedDocRaw);

                const apiResponse = JSON.parse(JSON.stringify(saved));
                if (apiResponse.services && typeof apiResponse.services === 'object') {
                    for (const [k, v] of Object.entries(apiResponse.services)) {
                        if (v && Object.prototype.hasOwnProperty.call(v, 'log')) delete v.log;
                        if (!Object.prototype.hasOwnProperty.call(v, 'status')) v.status = null;
                        apiResponse.services[k] = v;
                    }
                }

                results.push(apiResponse);
            }

            const message = results.length === 1
                ? 'Pipeline run updated.'
                : `${results.length} pipeline run(s) updated.`;
            const responseData = results.length === 1 ? results[0] : results;
            return ApiResponse.success(res, 200, message, responseData);
        } catch (err) {
            logger.error('DataPipeline updateServiceRun error:', err && err.message ? err.message : String(err));
            return ApiResponse.error(res, 500, err && err.message ? err.message : String(err));
        }
    };

    /**
     * PATCH /api/v1/admin-dashboard/data-pipeline/transfer-files
     * Stores a complete transfer document per runId.
     *
     * Expected format:
     * [
     *   {
     *     "runId": "run_ovo1zc",
     *     "createdAt": "...",
     *     "updatedAt": "...",
     *     "pipelineRunId": "...",
     *     "service": ["routing", "search"],
     *     "transfers": { ... },
     *     "routingServerMove": "started",
     *     "searchServerMove": "started"
     *   }
     * ]
     */
    static transferFiles = async (req, res) => {
        try {
            const payload = req.body || {};
            const items = Array.isArray(payload) ? payload : [payload];

            if (items.length === 0) {
                return ApiResponse.error(res, 400, 'Payload is required.');
            }

            const mergeUnique = (existingValue, incomingValue) => {
                const existingList = Array.isArray(existingValue)
                    ? existingValue
                    : existingValue !== undefined && existingValue !== null
                        ? [existingValue]
                        : [];
                const incomingList = Array.isArray(incomingValue)
                    ? incomingValue
                    : incomingValue !== undefined && incomingValue !== null
                        ? [incomingValue]
                        : [];

                return [...new Set([...existingList, ...incomingList])];
            };

            const normalizeTransfers = (transfers) => {
                const groupedTransfers = {};

                if (Array.isArray(transfers)) {
                    for (const transfer of transfers) {
                        if (!transfer || !transfer.service) {
                            continue;
                        }

                        if (!groupedTransfers[transfer.service]) {
                            groupedTransfers[transfer.service] = [];
                        }

                        const transferEntry = { ...transfer };
                        delete transferEntry.runId;
                        groupedTransfers[transfer.service].push(transferEntry);
                    }

                    return groupedTransfers;
                }

                if (transfers && typeof transfers === 'object') {
                    for (const [serviceName, entries] of Object.entries(transfers)) {
                        if (Array.isArray(entries)) {
                            groupedTransfers[serviceName] = entries.map(entry => {
                                const transferEntry = { ...entry };
                                delete transferEntry.runId;
                                return transferEntry;
                            });
                            continue;
                        }

                        if (entries && typeof entries === 'object') {
                            const entryKeys = Object.keys(entries);
                            const hasIndexedKeys = entryKeys.length > 0 && entryKeys.every(key => /^\d+$/.test(key));

                            if (hasIndexedKeys) {
                                groupedTransfers[serviceName] = entryKeys
                                    .sort((a, b) => Number(a) - Number(b))
                                    .map(key => entries[key])
                                    .filter(entry => entry && typeof entry === 'object')
                                    .map(entry => {
                                        const transferEntry = { ...entry };
                                        delete transferEntry.runId;
                                        return transferEntry;
                                    });
                                continue;
                            }

                            const transferEntry = { ...entries };
                            delete transferEntry.runId;
                            groupedTransfers[serviceName] = [transferEntry];
                            continue;
                        }

                        groupedTransfers[serviceName] = [entries];
                    }
                }

                return groupedTransfers;
            };

            const results = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];

                if (!item.runId) {
                    return ApiResponse.error(res, 400, `Item ${i} must have a runId.`);
                }

                if (!Array.isArray(item.transfers) && (!item.transfers || typeof item.transfers !== 'object')) {
                    return ApiResponse.error(res, 400, `Item ${i} must include a transfers array or object.`);
                }

                const runId = item.runId;
                const now = new Date().toISOString();
                const existingDoc = await DataPipelineTransfers.collection.findOne({ runId });
                const serviceTransfers = normalizeTransfers(item.transfers);

                const existingTransfers = existingDoc && existingDoc.transfers && typeof existingDoc.transfers === 'object' && !Array.isArray(existingDoc.transfers)
                    ? existingDoc.transfers
                    : {};

                const mergedTransfers = (() => {
                    const result = {};
                    const serviceNames = new Set([...Object.keys(existingTransfers), ...Object.keys(serviceTransfers)]);

                    const isSameTransfer = (a, b) => {
                        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
                        if (a.traId && b.traId && a.traId === b.traId) return true;
                        if (a.fileName && b.fileName && a.basePath && b.basePath && a.fileName === b.fileName && a.basePath === b.basePath) return true;
                        if (a.source && b.source && a.source === b.source && a.destination && b.destination && a.destination === b.destination) return true;
                        return false;
                    };

                    for (const svc of serviceNames) {
                        const ex = existingTransfers[svc] || [];
                        const inc = serviceTransfers[svc] || [];

                        const exArr = Array.isArray(ex) ? ex.map(e => ({ ...(e || {}) })) : [(ex || {})];
                        const inArr = Array.isArray(inc) ? inc.map(e => ({ ...(e || {}) })) : [(inc || {})];

                        const mergedArr = exArr.filter(e => e && Object.keys(e).length > 0);

                        for (const incomingEntry of inArr) {
                            if (!incomingEntry || Object.keys(incomingEntry).length === 0) continue;

                            const idx = mergedArr.findIndex(existingEntry => isSameTransfer(existingEntry, incomingEntry));
                            if (idx >= 0) {
                                mergedArr[idx] = { ...mergedArr[idx], ...incomingEntry };
                            } else {
                                mergedArr.push(incomingEntry);
                            }
                        }

                        result[svc] = mergedArr;
                    }

                    return result;
                })();

                const incomingServicesList = Array.isArray(item.servicesList) && item.servicesList.length > 0
                    ? item.servicesList
                    : Object.keys(serviceTransfers);

                const existingServiceValue = existingDoc ? existingDoc.service : undefined;
                const incomingServiceValue = Array.isArray(item.service)
                    ? item.service
                    : item.service !== undefined
                        ? [item.service]
                        : Object.keys(serviceTransfers);

                const mergedServiceValue = mergeUnique(existingServiceValue, incomingServiceValue);

                // Build $set using dot notation so MongoDB only patches the specified paths.
                // Existing fields not present in this payload are left untouched by MongoDB,
                // which eliminates the read-then-overwrite data-loss risk.
                const setOps = {
                    runId,
                    updatedAt: now,
                    service: mergedServiceValue.length === 1 ? mergedServiceValue[0] : mergedServiceValue,
                };

                // Set each service's transfers individually — other services' transfers
                // stored in MongoDB are untouched even if absent from this payload.
                for (const [svc, transferArr] of Object.entries(mergedTransfers)) {
                    setOps[`transfers.${svc}`] = transferArr;
                }

                // Pass through all remaining payload fields dynamically — no hardcoded names.
                // Plain object values are shallow-merged with the existing stored value so
                // previously stored keys within those objects are not lost.
                const alreadyHandled = new Set([
                    'runId', 'createdAt', 'updatedAt', 'transfers', 'servicesList', 'service',
                ]);

                for (const [key, value] of Object.entries(item)) {
                    if (alreadyHandled.has(key) || value === undefined) continue;

                    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                        const existingVal = existingDoc && existingDoc[key] && typeof existingDoc[key] === 'object' && !Array.isArray(existingDoc[key])
                            ? existingDoc[key]
                            : {};
                        setOps[key] = { ...existingVal, ...value };
                    } else {
                        setOps[key] = value;
                    }
                }

                logger.info(`DataPipeline transferFiles: Upserting runId ${runId}`, {
                    servicesList: incomingServicesList,
                    transferGroups: Object.keys(mergedTransfers).length,
                });

                const savedDoc = await DataPipelineTransfers.collection.findOneAndUpdate(
                    { runId },
                    {
                        $set: setOps,
                        $addToSet: { servicesList: { $each: incomingServicesList } },
                        $setOnInsert: {
                            createdAt: (existingDoc && existingDoc.createdAt) || item.createdAt || now,
                        },
                    },
                    {
                        upsert: true,
                        returnDocument: 'after',
                    }
                );

                const savedDocRaw = savedDoc && savedDoc.value ? savedDoc.value : savedDoc;
                results.push(savedDocRaw ? DataPipelineTransfers.toResponse(savedDocRaw) : null);
            }

            const message = results.length === 1
                ? 'File transfer information stored.'
                : `${results.length} pipeline run(s) updated with file transfer information.`;

            const responseData = results.length === 1 ? results[0] : results;
            return ApiResponse.success(res, 200, message, responseData);
        } catch (err) {
            logger.error('DataPipeline transferFiles error:', err && err.message ? err.message : String(err));
            return ApiResponse.error(res, 500, err && err.message ? err.message : String(err));
        }
    };

    /**
     * PATCH /api/v1/admin-dashboard/data-pipeline/service-status
     * Update service status(es) without file transfer details.
     * Updates existing document based on runId and service(s).
     *
     * Body example (single service):
     * {
     *   "runId": "run_t0u3au",
     *   "service": "routing",
     *   "status": "restarted_service",
     *   "restartedAt": "2026-04-30T..."
     * }
     *
     * Body example (multiple services):
     * {
     *   "runId": "run_t0u3au",
     *   "statuses": [
     *     { "service": "routing", "status": "restarted_service", "restartedAt": "2026-04-30T..." },
     *     { "service": "search", "status": "restarted_service", "restartedAt": "2026-04-30T..." }
     *   ]
     * }
     */
    static updateServiceStatus = async (req, res) => {
        try {
            const payload = req.body || {};

            // Handle array format: [{runId: "...", restartStatus: "..."}]
            if (Array.isArray(payload)) {
                const results = [];
                for (const item of payload) {
                    const { runId, restartStatus } = item;

                    if (!runId) {
                        return ApiResponse.error(res, 400, 'Each item must have a runId.');
                    }

                    // Handle root-level restartStatus
                    if (restartStatus !== undefined) {
                        // Try DataPipelineRun first, then DataPipelineTransfers
                        let doc = await DataPipelineRun.findByRunId(runId);
                        const useTransfersCollection = !doc;

                        if (!doc) {
                            doc = await DataPipelineTransfers.findByRunId(runId);
                        }

                        if (!doc) {
                            return ApiResponse.error(res, 404, `Pipeline run with runId "${runId}" not found in either collection.`);
                        }

                        const updateObj = {
                            updatedAt: new Date().toISOString(),
                            restartStatus: restartStatus,
                        };

                        // Update the collection where the document was found
                        const targetCollection = useTransfersCollection ? DataPipelineTransfers : DataPipelineRun;
                        const savedRaw = await targetCollection.collection.findOneAndUpdate(
                            { runId },
                            { $set: updateObj },
                            { returnDocument: 'after' }
                        );

                        const responseData = savedRaw.value || savedRaw;
                        if (!responseData) {
                            logger.error(`DataPipeline updateServiceStatus: Unable to update runId ${runId} - no response data`);
                            return ApiResponse.error(res, 500, `Failed to update pipeline run ${runId}.`);
                        }

                        // Also update the other collection if it exists
                        const otherCollection = useTransfersCollection ? DataPipelineRun : DataPipelineTransfers;
                        let otherDoc = await otherCollection.findByRunId(runId);
                        if (otherDoc) {
                            await otherCollection.collection.findOneAndUpdate(
                                { runId },
                                { $set: updateObj },
                                { returnDocument: 'after' }
                            );
                        }

                        // If using transfers collection and run collection doesn't exist, create it
                        if (useTransfersCollection && !otherDoc) {
                            try {
                                otherDoc = {
                                    runId,
                                    service: [],
                                    transfers: {},
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString(),
                                };
                                await DataPipelineRun.collection.findOneAndUpdate(
                                    { runId },
                                    { $set: { ...otherDoc, ...updateObj } },
                                    { upsert: true, returnDocument: 'after' }
                                );
                            } catch (err) {
                                logger.warn(`DataPipeline updateServiceStatus: Could not create/update DataPipelineRun for runId ${runId}`, { error: err.message });
                            }
                        }

                        results.push(DataPipelineRun.toResponse(responseData));
                    }
                }

                const message = results.length === 1
                    ? 'Restart status updated.'
                    : `${results.length} pipeline run(s) updated with restart status.`;
                const responseData = results.length === 1 ? results[0] : results;
                return ApiResponse.success(res, 200, message, responseData);
            }

            // Single object format
            const { runId, service, status, statuses, restartStatus } = payload;

            if (!runId) return ApiResponse.error(res, 400, 'runId is required.');

            // Handle root-level restartStatus
            if (restartStatus !== undefined && !service && !status && !statuses) {
                // Try DataPipelineRun first, then DataPipelineTransfers
                let doc = await DataPipelineRun.findByRunId(runId);
                const useTransfersCollection = !doc;

                if (!doc) {
                    doc = await DataPipelineTransfers.findByRunId(runId);
                }

                if (!doc) {
                    return ApiResponse.error(res, 404, `Pipeline run with runId "${runId}" not found in either collection.`);
                }

                const updateObj = {
                    updatedAt: new Date().toISOString(),
                    restartStatus: restartStatus,
                };

                // Update the collection where the document was found
                const targetCollection = useTransfersCollection ? DataPipelineTransfers : DataPipelineRun;
                const savedRaw = await targetCollection.collection.findOneAndUpdate(
                    { runId },
                    { $set: updateObj },
                    { returnDocument: 'after' }
                );

                const responseData = savedRaw.value || savedRaw;
                if (!responseData) {
                    logger.error(`DataPipeline updateServiceStatus: Unable to update runId ${runId} - no response data`);
                    return ApiResponse.error(res, 500, `Failed to update pipeline run ${runId}.`);
                }

                // Also update the other collection if it exists
                const otherCollection = useTransfersCollection ? DataPipelineRun : DataPipelineTransfers;
                let otherDoc = await otherCollection.findByRunId(runId);
                if (otherDoc) {
                    await otherCollection.collection.findOneAndUpdate(
                        { runId },
                        { $set: updateObj },
                        { returnDocument: 'after' }
                    );
                }

                // If using transfers collection and run collection doesn't exist, create it
                if (useTransfersCollection && !otherDoc) {
                    try {
                        otherDoc = {
                            runId,
                            service: [],
                            transfers: {},
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        };
                        await DataPipelineRun.collection.findOneAndUpdate(
                            { runId },
                            { $set: { ...otherDoc, ...updateObj } },
                            { upsert: true, returnDocument: 'after' }
                        );
                    } catch (err) {
                        logger.warn(`DataPipeline updateServiceStatus: Could not create/update DataPipelineRun for runId ${runId}`, { error: err.message });
                    }
                }

                // Also update data_pipeline_transfers with the restartStatus
                try {
                    let transferDoc = await DataPipelineTransfers.findByRunId(runId);
                    if (!transferDoc) {
                        transferDoc = {
                            runId,
                            service: [],
                            transfers: {},
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        };
                    }

                    if (restartStatus !== undefined) {
                        transferDoc.restartStatus = restartStatus;
                    }
                    transferDoc.updatedAt = new Date().toISOString();

                    // Save to data_pipeline_transfers
                    await DataPipelineTransfers.upsertByRunId(runId, transferDoc);
                } catch (transferErr) {
                    logger.warn('DataPipeline updateServiceStatus: Failed to update data_pipeline_transfers (single object)', { runId, error: transferErr.message });
                    // Don't fail the API call if transfer update fails - continue with response
                }

                const saved = DataPipelineRun.toResponse(responseData);
                return ApiResponse.success(res, 200, 'Restart status updated.', saved);
            }

            // const VALID_SERVICES = ['search', 'routing', 'tile'];

            // Find existing document - try both collections
            let doc = await DataPipelineRun.findByRunId(runId);
            const useTransfersCollection = !doc;

            if (!doc) {
                doc = await DataPipelineTransfers.findByRunId(runId);
            }

            if (!doc) {
                return ApiResponse.error(res, 404, `Pipeline run with runId "${runId}" not found in either collection.`);
            }

            // Ensure services object exists
            if (!doc.services) doc.services = {};
            if (!doc.servicesList) doc.servicesList = [];

            // Normalize to array of status updates
            const statusUpdates = [];
            if (service && status) {
                // Single service update
                statusUpdates.push({ service, status, ...payload });
            } else if (Array.isArray(statuses)) {
                // Multiple services update
                statusUpdates.push(...statuses);
            } else {
                return ApiResponse.error(res, 400, 'Either (service + status) or statuses array is required.');
            }

            const updateObj = {
                updatedAt: new Date().toISOString(),
            };

            // Process each status update
            for (const statusUpdate of statusUpdates) {
                const svc = statusUpdate.service;

                if (!svc) {
                    return ApiResponse.error(res, 400, 'Each status update must have a service field.');
                }

                // Ensure service exists in services object
                if (!doc.services[svc]) {
                    doc.services[svc] = { service: svc };
                }

                const svcObj = doc.services[svc];

                // Update status and any other provided fields
                if (statusUpdate.status !== undefined) {
                    svcObj.status = statusUpdate.status;
                }

                // Add any other metadata fields (restartedAt, completedAt, etc.)
                const allowedFields = ['restartedAt', 'completedAt', 'failedAt', 'duration'];
                for (const field of allowedFields) {
                    if (statusUpdate[field] !== undefined) {
                        svcObj[field] = statusUpdate[field];
                    }
                }

                // Ensure service is in servicesList
                if (!doc.servicesList.includes(svc)) {
                    doc.servicesList.push(svc);
                }
            }

            // Update services and servicesList
            updateObj.services = doc.services;
            updateObj.servicesList = doc.servicesList;

            // Build MongoDB update object with dot notation
            const flatUpdate = {};
            const setNestedInUpdate = (obj, prefix = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    if (typeof value === 'object' && value !== null && !Array.isArray(value) && key !== '_id') {
                        setNestedInUpdate(value, fullKey);
                    } else {
                        flatUpdate[fullKey] = value;
                    }
                }
            };
            setNestedInUpdate(updateObj);

            // Update document in the collection where it was found
            const targetCollection = useTransfersCollection ? DataPipelineTransfers : DataPipelineRun;
            const savedRaw = await targetCollection.collection.findOneAndUpdate(
                { runId },
                { $set: flatUpdate },
                { returnDocument: 'after' }
            );

            if (!savedRaw.value) {
                return ApiResponse.error(res, 404, 'Failed to update pipeline run.');
            }

            const saved = useTransfersCollection
                ? DataPipelineTransfers.toResponse(savedRaw.value)
                : DataPipelineRun.toResponse(savedRaw.value);

            // Also update the other collection if it exists
            try {
                if (useTransfersCollection) {
                    // Already updated transfers, now update run if it exists
                    const runDoc = await DataPipelineRun.findByRunId(runId);
                    if (runDoc) {
                        await DataPipelineRun.collection.findOneAndUpdate(
                            { runId },
                            { $set: flatUpdate },
                            { returnDocument: 'after' }
                        );
                    } else {
                        // Create run doc from transfers data
                        await DataPipelineRun.collection.findOneAndUpdate(
                            { runId },
                            {
                                $set: {
                                    ...flatUpdate,
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                }
                            },
                            { upsert: true, returnDocument: 'after' }
                        );
                    }
                } else {
                    // Already updated run, now also update transfers if it exists
                    const transferDoc = await DataPipelineTransfers.findByRunId(runId);
                    if (transferDoc) {
                        await DataPipelineTransfers.collection.findOneAndUpdate(
                            { runId },
                            { $set: flatUpdate },
                            { returnDocument: 'after' }
                        );
                    } else {
                        // Create transfers doc from run data
                        await DataPipelineTransfers.collection.findOneAndUpdate(
                            { runId },
                            {
                                $set: {
                                    ...flatUpdate,
                                    transfers: {},
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                }
                            },
                            { upsert: true, returnDocument: 'after' }
                        );
                    }
                }
            } catch (otherCollErr) {
                logger.warn(`DataPipeline updateServiceStatus: Failed to update other collection for runId ${runId}`, { error: otherCollErr.message });
                // Don't fail the API call if other collection update fails
            }

            return ApiResponse.success(res, 200, 'Service status updated.', saved);
        } catch (err) {
            logger.error('DataPipeline updateServiceStatus error:', err && err.message ? err.message : String(err));
            return ApiResponse.error(res, 500, err && err.message ? err.message : String(err));
        }
    };

    /**
     * GET /api/v1/admin-dashboard/data-pipeline/getdataPipeline
     * Optional query: ?runId=run_xxx or ?limit=20
     */
    static getRuns = async (req, res) => {
        try {
            const { runId, limit } = req.query;
            // const VALID_SERVICES = ['search', 'routing', 'tile'];

            function normalize(doc) {
                if (!doc) return null;
                const out = {};
                if (doc._id) out._id = doc._id;
                out.runId = doc.runId ?? null;
                out.createdAt = doc.createdAt ?? null;

                const srcServices = doc.services ?? {};
                out.servicesList = Array.isArray(doc.servicesList)
                    ? doc.servicesList
                    : Object.keys(srcServices);

                out.services = {};

                // For each service present in servicesList, populate values from top-level keys,
                // then fallback to values inside services[svc], otherwise null.
                for (const svc of out.servicesList) {
                    const statusKey = `${svc}Status`;
                    const statusVal = doc[statusKey] !== undefined
                        ? doc[statusKey]
                        : (srcServices[svc] && srcServices[svc].status !== undefined ? srcServices[svc].status : null);

                    // Build a service object based on the stored service entry but remove any `log` field.
                    const svcObj = srcServices[svc] ? { ...srcServices[svc] } : { service: svc };
                    if (Object.prototype.hasOwnProperty.call(svcObj, 'log')) delete svcObj.log;
                    svcObj.status = statusVal;

                    out.services[svc] = svcObj;

                    // keep individual per-service top-level status keys for compatibility
                    out[statusKey] = statusVal;
                }

                if (doc.updatedAt !== undefined) out.updatedAt = doc.updatedAt;
                if (doc.id) out.id = doc.id;
                return out;
            }

            if (runId) {
                const doc = await DataPipelineRun.findByRunId(runId);
                if (!doc) return ApiResponse.error(res, 404, 'Pipeline run not found.');
                return ApiResponse.success(res, 200, 'Pipeline run fetched.', normalize(doc));
            }

            const docs = await DataPipelineRun.findAll({ limit: Number(limit) || 50 });
            const normalized = docs.map(normalize);
            return ApiResponse.success(res, 200, 'Pipeline runs fetched.', normalized);
        } catch (err) {
            logger.error('DataPipeline getRuns error:', err.message);
            return ApiResponse.error(res, 500, err.message);
        }
    };

    /**
     * GET /api/v1/admin-dashboard/data-pipeline/fetch-pipeline
     * Query: ?runId=run_xxx (specific) or ?limit=20&offset=0 (all with pagination)
     * Returns: services, servicesList, sshSuccess, sshStatus
     */
    static fetchPipeline = async (req, res) => {
        try {
            const { runId, version, limit = 20, offset = 0 } = req.query;

            if (runId) {
                // Fetch specific runId
                const doc = await DataPipelineRun.findByRunId(runId);
                if (!doc) {
                    return ApiResponse.error(res, 404, `Pipeline run with runId "${runId}" not found.`);
                }

                // Version check: if version query is provided, validate it matches
                if (version !== undefined && doc.version !== version) {
                    return ApiResponse.error(
                        res,
                        409,
                        `Version mismatch: requested "${version}", but run "${runId}" has version "${doc.version}".`
                    );
                }

                const response = {
                    _id: doc._id,
                    runId: doc.runId,
                    version: doc.version,
                    createdAt: doc.createdAt,
                    updatedAt: doc.updatedAt,
                    services: doc.services || {},
                    servicesList: doc.servicesList || [],
                    sshSuccess: doc.sshSuccess,
                    sshStatus: doc.sshStatus,
                };
                return ApiResponse.success(res, 200, 'Pipeline run fetched.', response);
            }

            // Fetch all with pagination + optional version filter
            const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
            const offsetNum = Math.max(Number(offset) || 0, 0);

            const collection = DataPipelineRun.collection;

            // Build filter: add version to query if provided
            const filter = version !== undefined ? { version } : {};

            const docs = await collection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(offsetNum)
                .limit(limitNum)
                .toArray();

            const total = await collection.countDocuments(filter);

            const response = docs.map(doc => ({
                _id: doc._id,
                runId: doc.runId,
                version: doc.version,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                services: doc.services || {},
                servicesList: doc.servicesList || [],
                sshSuccess: doc.sshSuccess,
                sshStatus: doc.sshStatus,
            }));

            return ApiResponse.success(res, 200, 'Pipeline runs fetched.', {
                data: response,
                pagination: {
                    total,
                    limit: limitNum,
                    offset: offsetNum,
                    hasMore: offsetNum + limitNum < total,
                },
            });
        } catch (err) {
            logger.error('DataPipeline fetchPipeline error:', err && err.message ? err.message : String(err));
            return ApiResponse.error(res, 500, err && err.message ? err.message : String(err));
        }
    };

    /**
     * GET /api/v1/admin-dashboard/data-pipeline/fetch-transfers
     * Query: ?runId=run_xxx (required), ?limit=20&offset=0
     * Returns: Data from data_pipeline_transfers + related data from data_pipeline_runs
     * Most recent documents first (sorted by descending)
     */
    static fetchTransfers = async (req, res) => {
        try {
            const { runId, limit = 20, offset = 0 } = req.query;

            if (!runId) {
                return ApiResponse.error(res, 400, 'runId is required.');
            }

            const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100); // Max 100
            const offsetNum = Math.max(Number(offset) || 0, 0);

            // Fetch pipeline run data
            const pipelineRun = await DataPipelineRun.findByRunId(runId);
            if (!pipelineRun) {
                return ApiResponse.error(res, 404, `Pipeline run with runId "${runId}" not found.`);
            }

            // Fetch transfer documents sorted by updatedAt descending
            const collection = DataPipelineTransfers.collection;
            const transfers = await collection
                .find({ runId })
                .sort({ updatedAt: -1 })
                .skip(offsetNum)
                .limit(limitNum)
                .toArray();

            const total = await collection.countDocuments({ runId });

            // Enrich transfer documents with pipeline run data
            const response = transfers.map(transferDoc => ({
                // Return all fields from the transfer document
                ...transferDoc,
                // Ensure standard fields exist
                _id: transferDoc._id,
                runId: transferDoc.runId,
                createdAt: transferDoc.createdAt,
                updatedAt: transferDoc.updatedAt,
                // Include enriched data from pipeline run
                servicesList: pipelineRun.servicesList || [],
                sshSuccess: pipelineRun.sshSuccess,
                sshStatus: pipelineRun.sshStatus,
            }));

            return ApiResponse.success(res, 200, 'Transfer data fetched.', {
                data: response,
                pagination: {
                    total,
                    limit: limitNum,
                    offset: offsetNum,
                    hasMore: offsetNum + limitNum < total,
                },
            });
        } catch (err) {
            logger.error('DataPipeline fetchTransfers error:', err && err.message ? err.message : String(err));
            return ApiResponse.error(res, 500, err && err.message ? err.message : String(err));
        }
    };
}

module.exports = DataPipelineController;
