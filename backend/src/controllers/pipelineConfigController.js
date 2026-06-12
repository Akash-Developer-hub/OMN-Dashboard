'use strict';

const PipelineConfig = require('../models/PipelineConfig');
const Server = require('../models/Server');
const AdminDashboardUser = require('../models/AdminDashboardUser');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../logs_/logger');

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_VERSION = 'v1.0'; // Used as fallback when no version is supplied in the payload

// ─── Helper: Admin Snapshot ──────────────────────────────────────────────────

function buildAdminSnapshot(user, method = null) {
    user = user || {};
    return {
        id: user.id || user._id?.toString(),
        name: user.name || null,
        email: user.email || null,
        method: method || null,
    };
}

// ─── Helper: Resolve Admin ───────────────────────────────────────────────────

async function getAdminForConfig(payload, authenticatedUser) {
    const adminData = payload.admin || {};
    const adminIdFromPayload = cleanString(payload.adminId || payload.userId || adminData.id);
    const method = adminData.method || payload.method || null;

    // 1. Try payload ID in DB
    if (adminIdFromPayload) {
        const adminUser = await AdminDashboardUser.findById(adminIdFromPayload);
        if (adminUser && adminUser.isActive) {
            return buildAdminSnapshot(adminUser, method);
        }
    }

    // 2. Try manual details from payload (Prioritized over authenticated user)
    const name = cleanString(adminData.name || payload.name);
    const email = cleanString(adminData.email || payload.email);

    if (name || email) {
        return {
            id: adminIdFromPayload || `manual-${Date.now()}`,
            name: name || 'Manual Admin',
            email: email || null,
            method: method || null,
        };
    }

    // 3. Fallback to authenticated user
    if (authenticatedUser) {
        const authUserId = cleanString(authenticatedUser.id || authenticatedUser._id?.toString());
        if (authUserId) {
            const adminUser = await AdminDashboardUser.findById(authUserId);
            if (adminUser && adminUser.isActive) {
                return buildAdminSnapshot(adminUser, method);
            }
        }
        return buildAdminSnapshot(authenticatedUser, method);
    }

    const err = new Error('A valid admin name is required (user not found and no manual name provided).');
    err.statusCode = 400;
    throw err;
}

// ─── Helper: Admin List ──────────────────────────────────────────────────────

function buildAdminList(admin, existingAdminList = {}) {
    if (!admin?.id) return existingAdminList || {};

    const adminKey = cleanString(admin.name) || admin.email || admin.id;
    return {
        ...(existingAdminList || {}),
        [adminKey]: admin,
    };
}

function hasAdminInList(adminList, admin) {
    if (!admin?.id || !adminList || typeof adminList !== 'object') return false;

    return Object.values(adminList).some((listedAdmin) => listedAdmin?.id === admin.id);
}

// ─── Helper: Config Replacement Builder ─────────────────────────────────────

function buildConfigReplacement(existingConfig, { admin, adminList, serverPaths, version }) {
    const replacement = { ...existingConfig };
    delete replacement.id;
    delete replacement._id;
    delete replacement.adminList;
    delete replacement.serverPaths;
    delete replacement.sections;

    return {
        ...replacement,
        version,
        adminList,
        serverPaths,
        updatedAt: new Date(),
    };
}

// ─── Helper: String Utils ────────────────────────────────────────────────────

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function buildServerKey(server) {
    return (
        cleanString(server?.name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '') || server.id
    );
}

// ─── Helper: Server Lookup ───────────────────────────────────────────────────

async function getServerOrFail(serverId, label) {
    if (!serverId || !Server.isValidId(serverId)) {
        const err = new Error(`A valid ${label} is required.`);
        err.statusCode = 400;
        throw err;
    }

    const server = await Server.findById(serverId);
    if (!server) {
        const err = new Error(`${label} not found.`);
        err.statusCode = 400;
        throw err;
    }

    return server;
}

// ─── Helper: Path Normalization ──────────────────────────────────────────────

async function normalizePathConfig(raw, index = 0) {
    raw = raw || {};
    const service = cleanString(raw.service || raw.name || `service-${index + 1}`);

    const targetServer = await getServerOrFail(
        raw.targetServerId || raw.serverId,
        `${service} targetServerId`
    );

    const inputPath = cleanString(
        raw.inputPath || raw.sourcePath || raw.filePath || raw.fileInputPath || raw.targetInputPath || raw.logPath
    );
    const outputPath = cleanString(
        raw.outputPath ||
        raw.output ||
        raw.targetOutputPath ||
        raw.destinationOutputPath ||
        raw.outputFilePath ||
        raw.outputDirectoryPath
    );
    const scriptPath = cleanString(raw.scriptPath || raw.scriptDisplayPath || raw.scriptDirectoryPath);
    const backupPath = cleanString(raw.backupPath || raw.backupDirectoryPath);
    const logPath = cleanString(raw.logPath || raw.logDirectoryPath);

    return {
        serverKey: buildServerKey(targetServer),
        targetServerId: targetServer.id,
        inputPath,
        outputPath: outputPath || null,
        scriptPath,
        backupPath: backupPath || null,
        logPath
    };
}

function extractPathConfigs(payload) {
    if (Array.isArray(payload.serverPaths)) return payload.serverPaths;
    if (Array.isArray(payload.paths)) return payload.paths;
    if (Array.isArray(payload.services)) return payload.services;

    const serviceKeys = ['search', 'routing', 'tile'];
    const services = serviceKeys
        .filter((key) => payload[key] && typeof payload[key] === 'object')
        .map((key) => ({ service: key, ...payload[key] }));

    if (services.length > 0) return services;

    if (payload.targetServerId || payload.serverId) return [payload];
    return [];
}

// ─── Helper: Path Identity & Storage ────────────────────────────────────────

function matchesServerId(pathConfig, serverId) {
    return pathConfig.targetServerId === serverId;
}

function pathIdentity(pathConfig) {
    return [pathConfig.targetServerId, pathConfig.inputPath].join('|');
}

function toStoredPathConfig(pathConfig) {
    return {
        targetServerId: pathConfig.targetServerId,
        inputPath: pathConfig.inputPath,
        outputPath: pathConfig.outputPath,
        scriptPath: pathConfig.scriptPath,
        backupPath: pathConfig.backupPath,
        logPath: pathConfig.logPath,
    };
}

// ─── Helper: ServerPaths Normalization / Flatten / Group / Merge ─────────────

function normalizeServerPathsForResponse(serverPaths) {
    if (!serverPaths || typeof serverPaths !== 'object') return {};
    if (!Array.isArray(serverPaths)) return serverPaths;

    return serverPaths.reduce((grouped, pathConfig) => {
        const key = pathConfig.serverKey || pathConfig.targetServerId || 'server';
        grouped[key] = grouped[key] || [];
        grouped[key].push(toStoredPathConfig(pathConfig));
        return grouped;
    }, {});
}

function flattenServerPaths(serverPaths) {
    if (Array.isArray(serverPaths)) return serverPaths;
    if (!serverPaths || typeof serverPaths !== 'object') return [];
    return Object.values(serverPaths).flatMap((paths) => (Array.isArray(paths) ? paths : [paths]));
}

function groupServerPaths(serverPaths) {
    return serverPaths.reduce((grouped, pathConfig) => {
        grouped[pathConfig.serverKey] = grouped[pathConfig.serverKey] || [];
        grouped[pathConfig.serverKey].push(toStoredPathConfig(pathConfig));
        return grouped;
    }, {});
}

function mergeServerPaths(existingServerPaths, incomingServerPaths) {
    const merged = normalizeServerPathsForResponse(existingServerPaths);
    const flatExisting = flattenServerPaths(merged);
    const identityMap = new Map(flatExisting.map((p) => [pathIdentity(p), p]));

    let addedCount = 0;
    let updatedCount = 0;

    for (const pathConfig of incomingServerPaths) {
        const identity = pathIdentity(pathConfig);
        const stored = toStoredPathConfig(pathConfig);

        if (identityMap.has(identity)) {
            const existing = identityMap.get(identity);
            Object.assign(existing, stored);
            updatedCount += 1;
        } else {
            merged[pathConfig.serverKey] = merged[pathConfig.serverKey] || [];
            merged[pathConfig.serverKey].push(stored);
            identityMap.set(identity, stored);
            addedCount += 1;
        }
    }

    return { merged, addedCount, updatedCount };
}

function hasAnyServerPaths(config) {
    return Object.keys(config.serverPaths || {}).length > 0;
}

// ─── Helper: Config Query ────────────────────────────────────────────────────

/**
 * Finds the most recent pipeline config document matching the given version only.
 * Falls back to DEFAULT_VERSION ('v1.0') when version is not supplied.
 */
async function findConfigByVersion(version = DEFAULT_VERSION) {
    const doc = await PipelineConfig.collection.findOne(
        { version },
        { sort: { createdAt: -1 } }
    );
    return PipelineConfig.toResponse(doc);
}

async function findLatestConfig({ excludeVersion } = {}) {
    const query = excludeVersion ? { version: { $ne: excludeVersion } } : {};
    const doc = await PipelineConfig.collection.findOne(
        query,
        { sort: { createdAt: -1 } }
    );
    return PipelineConfig.toResponse(doc);
}

// ─── Helper: Response Enrichment ─────────────────────────────────────────────

async function enrichWithServerPathSummary(config, { serverId } = {}) {
    const serverPaths = normalizeServerPathsForResponse(config.serverPaths);
    const adminList = buildAdminList(config.admin, config.adminList);

    const relatedServerPaths = serverId
        ? Object.entries(serverPaths).reduce((filtered, [serverKey, paths]) => {
            const matchingPaths = paths.filter((pathConfig) =>
                matchesServerId(pathConfig, serverId)
            );
            if (matchingPaths.length) filtered[serverKey] = matchingPaths;
            return filtered;
        }, {})
        : serverPaths;

    const restConfig = { ...config };
    delete restConfig.serverPaths;
    delete restConfig.adminList;
    delete restConfig.sections;

    return {
        ...restConfig,
        adminList,
        serverPaths: relatedServerPaths,
    };
}

// ─── Controller ──────────────────────────────────────────────────────────────

class PipelineConfigController {
    /**
     * POST /api/v1/admin-dashboard/pipeline-config
     *
     * Create or update a pipeline config entry.
     *
     * Flow:
     *  1. Resolve admin from payload or authenticated user.
     *  2. Normalize incoming serverPath configs from the payload.
     *
     *     CASE A — Version already exists:
     *       a. Flatten existing serverPaths for the found config document.
     *       b. For each incoming path, check whether its targetServerId is
     *          already present in that document's serverPaths.
     *       c. If the targetServerId IS already configured  →  reject with 400.
     *          ("Server is already configured for version X.")
     *       d. If the targetServerId is NOT configured yet  →  merge the new
     *          path into the existing document and save.
     *
     *     CASE B — Version does NOT exist yet:
     *       a. Create a brand-new PipelineConfig document with the supplied
     *          serverPaths and adminList.
     */
    static createConfig = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);

        // ── Step 1: Resolve admin ─────────────────────────────────────────
        let admin;
        try {
            admin = await getAdminForConfig(payload, req.user);
        } catch (err) {
            return ApiResponse.error(res, err.statusCode || 400, err.message);
        }

        // ── Step 2: Normalize incoming serverPath configs ─────────────────
        const rawPathConfigs = extractPathConfigs(payload);
        const serverPaths = [];
        for (let i = 0; i < rawPathConfigs.length; i += 1) {
            try {
                serverPaths.push(await normalizePathConfig(rawPathConfigs[i], i));
            } catch (err) {
                return ApiResponse.error(res, err.statusCode || 400, err.message);
            }
        }

        const isExplicitAdminAddition = !!(
            payload.admin ||
            payload.adminId ||
            payload.name ||
            payload.email
        );

        // ── Step 3: Check whether this version already exists in the DB ───
        //
        //   VERSION EXISTS   → check targetServerId; block if duplicate, else merge
        //   VERSION NOT FOUND → create a brand-new document
        //
        const existingConfig = await findConfigByVersion(version);

        if (existingConfig) {
            // ── CASE A: Version already exists — DO NOT create a new doc ──

            // Check each incoming targetServerId against what is already stored.
            // If it is already there → reject; the server is already configured.
            const flatExisting = flattenServerPaths(
                normalizeServerPathsForResponse(existingConfig.serverPaths)
            );

            for (const newPath of serverPaths) {
                const alreadyConfigured = flatExisting.some(
                    (p) => p.targetServerId === newPath.targetServerId
                );
                if (alreadyConfigured) {
                    return ApiResponse.error(
                        res,
                        400,
                        `Server is already configured for version ${version}.`
                    );
                }
            }

            // targetServerId not yet in this version — merge the new path in.
            const { merged, addedCount, updatedCount } = mergeServerPaths(
                existingConfig.serverPaths,
                serverPaths
            );

            let adminList = existingConfig.adminList || {};
            if (payload.adminList && typeof payload.adminList === 'object') {
                adminList = payload.adminList;
            } else if (isExplicitAdminAddition) {
                adminList = buildAdminList(admin, adminList);
            }

            const adminAlreadyAdded =
                payload.adminList || !isExplicitAdminAddition
                    ? false
                    : hasAdminInList(existingConfig.adminList, admin);

            const isBulkUpdate = !!payload.adminList;

            if (!isBulkUpdate && addedCount === 0 && updatedCount === 0 && adminAlreadyAdded) {
                return ApiResponse.error(res, 400, `Version ${version} already exists.`);
            }

            const replacement = buildConfigReplacement(existingConfig, {
                admin,
                adminList,
                serverPaths: merged,
                version,
            });

            const updatedDoc = await PipelineConfig.collection.findOneAndReplace(
                { _id: existingConfig._id },
                replacement,
                { returnDocument: 'after' }
            );
            const updatedConfig = PipelineConfig.toResponse(updatedDoc);

            logger.audit('PIPELINE_CONFIG_UPDATED', {
                configId: updatedConfig.id,
                adminId: admin.id,
                version,
                addedCount,
                updatedCount,
            });

            return ApiResponse.success(res, 200, 'Pipeline config updated.', {
                config: await enrichWithServerPathSummary(updatedConfig),
            });
        }

        // ── CASE B: Version not found — create a new document ─────────────
        const previousConfig = await findLatestConfig({ excludeVersion: version });
        const baseServerPaths = previousConfig
            ? normalizeServerPathsForResponse(previousConfig.serverPaths)
            : {};
        const { merged: forkedServerPaths } = mergeServerPaths(baseServerPaths, serverPaths);
        let adminList = previousConfig?.adminList || {};
        if (payload.adminList && typeof payload.adminList === 'object') {
            adminList = payload.adminList;
        } else if (isExplicitAdminAddition) {
            adminList = buildAdminList(admin, adminList);
        }

        const forkedConfigFields = previousConfig
            ? (() => {
                const copy = { ...previousConfig };
                delete copy.id;
                delete copy._id;
                delete copy.version;
                delete copy.status;
                delete copy.admin;
                delete copy.adminList;
                delete copy.serverPaths;
                delete copy.sections;
                delete copy.createdAt;
                delete copy.updatedAt;
                return copy;
            })()
            : {};

        const config = await PipelineConfig.create({
            ...forkedConfigFields,
            version,
            status: payload.status || 'added',
            adminList,
            serverPaths: forkedServerPaths,
        });

        logger.audit('PIPELINE_CONFIG_CREATED', {
            configId: config.id,
            adminId: admin.id,
            version,
            runId: config.runId,
            copiedFromConfigId: previousConfig?.id || null,
        });

        return ApiResponse.success(res, 201, 'Pipeline config added.', {
            config: await enrichWithServerPathSummary(config),
        });
    });

    /**
     * POST /api/v1/admin-dashboard/pipeline-config/remove
     * Removes an admin from the notification list of the latest pipeline config.
     */
    static removeAdmin = asyncHandler(async (req, res) => {
        const { adminId } = req.body;
        const version = cleanString(req.body.version);

        if (!adminId) {
            return ApiResponse.error(res, 400, 'adminId is required.');
        }

        const existingConfig = await findConfigByVersion(version);
        if (!existingConfig) {
            return ApiResponse.error(res, 404, 'No pipeline config found for this version.');
        }

        const adminList = { ...existingConfig.adminList };
        let found = false;

        for (const key in adminList) {
            if (adminList[key].id === adminId) {
                delete adminList[key];
                found = true;
                break;
            }
        }

        if (!found) {
            return ApiResponse.error(res, 404, 'Admin not found in the admin list.');
        }

        const updatedDoc = await PipelineConfig.collection.findOneAndUpdate(
            { _id: existingConfig._id },
            { $set: { adminList, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );

        const updatedConfig = PipelineConfig.toResponse(updatedDoc);

        logger.audit('PIPELINE_ADMIN_REMOVED', {
            configId: updatedConfig.id,
            adminId,
            version,
        });

        return ApiResponse.success(res, 200, 'Admin removed from admin list.', {
            config: await enrichWithServerPathSummary(updatedConfig),
        });
    });

    /**
  * GET /api/v1/admin-dashboard/pipeline-config/notify-list-admin
  * Fetches admins from the notify list for a pipeline configuration version.
  * Query: ?version=v1.0 (optional; falls back to the latest config)
  */
    static getNotifyList = asyncHandler(async (req, res) => {
        try {
            const version = cleanString(req.query?.version || req.body?.version);
            const config = version
                ? await findConfigByVersion(version)
                : await findLatestConfig();

            if (!config) {
                const message = version
                    ? `No pipeline configuration found for version "${version}".`
                    : 'No pipeline configuration found.';
                return ApiResponse.error(res, 404, message);
            }

            const mergedAdminMap = {};
            const adminListObj = config.adminList || {};
            for (const [key, admin] of Object.entries(adminListObj)) {
                if (admin && typeof admin === 'object') {
                    const mapKey = cleanString(admin.id) || cleanString(admin.email) || key;
                    if (mapKey && !mergedAdminMap[mapKey]) {
                        mergedAdminMap[mapKey] = admin;
                    }
                }
            }

            const notifyList = Object.values(mergedAdminMap);
            notifyList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            logger.audit('NOTIFY_LIST_FETCHED', {
                count: notifyList.length,
                version: config.version || version || DEFAULT_VERSION,
                requestedBy: req.user?.id,
            });

            return ApiResponse.success(res, 200, 'Notify list fetched successfully.', {
                version: config.version || version || DEFAULT_VERSION,
                notifyList,
            });
        } catch (error) {
            logger.error('Error fetching notify list', { error: error.message });
            return ApiResponse.error(res, 500, 'Failed to fetch notify list.');
        }
    });


    /**
  * PATCH /api/v1/admin-dashboard/pipeline-config/UpdateServer-path
  *
  * Updates the path configuration for a specific server within a specific version.
  *
  * Body:
  *   version        {string} - Pipeline config version to target (required)
  *   targetServerId {string} - MongoDB ObjectId of the target server (required)
  *   inputPath      {string} - (optional) new input path
  *   outputPath     {string} - (optional) new output path
  *   scriptPath     {string} - (optional) new script path
  *   backupPath     {string} - (optional) new backup path
  *   logPath        {string} - (optional) new log path
  */
    static updateServerPath = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);
        const targetServerId = cleanString(payload.targetServerId || payload.serverId);

        // ─── Step 1: Validate required fields ────────────────────────────────────
        if (!version) {
            return ApiResponse.error(res, 400, 'version is required.');
        }
        if (!targetServerId) {
            return ApiResponse.error(res, 400, 'targetServerId is required.');
        }

        // ─── Step 2: Confirm the server exists in the DB ──────────────────────────
        let server;
        try {
            server = await getServerOrFail(targetServerId, 'targetServerId');
        } catch (err) {
            return ApiResponse.error(res, err.statusCode || 400, err.message);
        }

        // ─── Step 3: Find the pipeline config matching the requested version ──────
        const { configs } = await PipelineConfig.findAll({});

        const existingConfig = configs.find(
            (cfg) => cleanString(cfg.version) === version
        );

        if (!existingConfig) {
            return ApiResponse.error(
                res,
                404,
                `No pipeline config found for version "${version}".`
            );
        }

        // ─── Step 4: Confirm this server has a path entry inside that version ─────
        const currentPaths = normalizeServerPathsForResponse(existingConfig.serverPaths);
        const existingEntries = flattenServerPaths(currentPaths);

        const existingEntry = existingEntries.find((p) => matchesServerId(p, server.id));

        if (!existingEntry) {
            return ApiResponse.error(
                res,
                404,
                `Server "${server.id}" has no path entry in pipeline config version "${version}".`
            );
        }

        // ─── Step 5: Merge incoming paths with the existing entry (partial update) ─
        const serverKey = buildServerKey(server);

        const updatedEntry = {
            targetServerId: server.id,
            inputPath: cleanString(payload.inputPath) || existingEntry.inputPath || '',
            outputPath: cleanString(payload.outputPath) || existingEntry.outputPath || null,
            scriptPath: cleanString(payload.scriptPath) || existingEntry.scriptPath || '',
            backupPath: cleanString(payload.backupPath) || existingEntry.backupPath || null,
            logPath: cleanString(payload.logPath) || existingEntry.logPath || null,
        };

        // ─── Step 6: Rebuild the serverPaths map for this version ─────────────────
        // Remove the old entry for this server then push the updated one
        const mergedPaths = { ...currentPaths };

        mergedPaths[serverKey] = mergedPaths[serverKey]
            ? mergedPaths[serverKey].filter((p) => !matchesServerId(p, server.id))
            : [];

        mergedPaths[serverKey].push(updatedEntry);

        // ─── Step 7: Persist the change to the correct versioned document ──────────
        const updatedDoc = await PipelineConfig.collection.findOneAndUpdate(
            { _id: existingConfig._id },
            { $set: { serverPaths: mergedPaths, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );

        const updatedConfig = PipelineConfig.toResponse(updatedDoc);

        logger.audit('PIPELINE_SERVER_PATH_UPDATED', {
            configId: updatedConfig.id,
            version,
            targetServerId: server.id,
            serverKey,
            updatedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Server path updated successfully.', {
            config: await enrichWithServerPathSummary(updatedConfig),
        });
    });

    /**
 * POST /api/v1/admin-dashboard/pipeline-config/download-path
 *
 * Adds a download path configuration for a specific server within a specific
 * pipeline config version.
 *
 * Rules (mirrors createConfig logic):
 *   CASE A — Version already exists:
 *     a. If the targetServerId is already present in DownloadPaths → reject 400.
 *     b. If the targetServerId is NOT present → merge the new entry in.
 *
 *   CASE B — Version does NOT exist:
 *     a. Create a brand-new PipelineConfig document with the supplied DownloadPaths.
 *
 * Stored fields: outputPath, logPath, scriptPath, multithreadscriptpath,
 * multithreadoutputpath, maxspeedscriptpath.
 */
    static PostDownloadPath = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);
        const targetServerId = cleanString(payload.targetServerId || payload.serverId);

        if (!version) return ApiResponse.error(res, 400, 'version is required.');
        if (!targetServerId) return ApiResponse.error(res, 400, 'targetServerId is required.');

        // ── Step 1: Validate the server exists ────────────────────────────────
        let server;
        try {
            server = await getServerOrFail(targetServerId, 'targetServerId');
        } catch (err) {
            return ApiResponse.error(res, err.statusCode || 400, err.message);
        }

        // ── Step 2: Build the download path entry ─────────────────────────────
        const downloadEntry = {
            targetServerId: server.id,
            outputPath: cleanString(payload.outputPath || payload.output || payload.targetOutputPath) || null,
            folder: cleanString(payload.folder) || null,
            logPath: cleanString(payload.logPath || payload.logDirectoryPath) || null,
            scriptPath: cleanString(payload.scriptPath || payload.scriptDisplayPath || payload.scriptDirectoryPath) || null,
            multithreadscriptpath: cleanString(payload.multithreadscriptpath) || null,
            multithreadoutputpath: cleanString(payload.multithreadoutputpath) || null,
            maxspeedscriptpath: cleanString(payload.maxspeedscriptpath) || null,
        };

        const serverKey = buildServerKey(server);

        // ── Step 3: Check whether this version already exists in the DB ───────
        const existingConfig = await findConfigByVersion(version);

        if (existingConfig) {
            // ── CASE A: Version exists — check for duplicate targetServerId ───

            const existingPaths = existingConfig.DownloadPaths || {};
            const serverGroup = existingPaths[serverKey] || [];

            const alreadyConfigured = serverGroup.some(
                (p) => p.targetServerId === server.id
            );

            if (alreadyConfigured) {
                return ApiResponse.error(
                    res,
                    400,
                    `Download path for this server is already configured for version ${version}.`
                );
            }

            // ── Append the new entry directly under the serverKey ─────────────
            const updatedDoc = await PipelineConfig.collection.findOneAndUpdate(
                { _id: existingConfig._id },
                {
                    $push: { [`DownloadPaths.${serverKey}`]: downloadEntry },
                    $set: { updatedAt: new Date() },
                },
                { returnDocument: 'after' }
            );

            const updatedConfig = PipelineConfig.toResponse(updatedDoc);

            logger.audit('PIPELINE_DOWNLOAD_PATH_UPDATED', {
                configId: updatedConfig.id,
                version,
                targetServerId: server.id,
                updatedBy: req.user?.id,
            });

            return ApiResponse.success(res, 200, 'Download path added successfully.', {
                config: updatedConfig,
            });
        }

        // ── CASE B: Version not found — create a brand-new document ──────────
        const created = await PipelineConfig.create({
            version,
            status: payload.status || 'added',
            adminList: payload.adminList || {},
            serverPaths: {},
            DownloadPaths: {
                [serverKey]: [downloadEntry],
            },
        });

        logger.audit('PIPELINE_DOWNLOAD_PATH_CREATED', {
            configId: created.id,
            version,
            targetServerId: server.id,
            createdBy: req.user?.id,
        });

        return ApiResponse.success(res, 201, 'Download path created successfully.', {
            config: PipelineConfig.toResponse(created),
        });
    });

    /**
     * PATCH /api/v1/admin-dashboard/pipeline-config/UpdateDownload-path
     *
     * Partially updates the download path configuration (output/script/log)
     * for a specific server within a specific pipeline config version.
     *
     * Body:
     *   version {string} - required
     *   targetServerId {string} - required
     *   outputPath {string} - optional
     *   scriptPath {string} - optional
     *   logPath {string} - optional
     *   multithreadscriptpath {string} - optional
     *   multithreadoutputpath {string} - optional
     *   maxspeedscriptpath {string} - optional
     */
    static updateDownloadPath = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);
        const targetServerId = cleanString(payload.targetServerId || payload.serverId);

        if (!version) return ApiResponse.error(res, 400, 'version is required.');
        if (!targetServerId) return ApiResponse.error(res, 400, 'targetServerId is required.');

        // Validate server exists
        let server;
        try {
            server = await getServerOrFail(targetServerId, 'targetServerId');
        } catch (err) {
            return ApiResponse.error(res, err.statusCode || 400, err.message);
        }

        // Find config for version
        const existingConfig = await findConfigByVersion(version);
        if (!existingConfig) {
            return ApiResponse.error(res, 404, `No pipeline config found for version "${version}".`);
        }

        // Normalize current DownloadPaths and find existing entry for this server
        const currentPaths = normalizeServerPathsForResponse(existingConfig.DownloadPaths || {});
        const existingEntries = flattenServerPaths(currentPaths);

        const existingEntry = existingEntries.find((p) => matchesServerId(p, server.id));

        if (!existingEntry) {
            return ApiResponse.error(res, 404, `Download path for server "${server.id}" is not configured in version "${version}".`);
        }

        const serverKey = buildServerKey(server);

        // Merge incoming fields with existing entry (partial update)
        const updatedEntry = {
            targetServerId: server.id,
            outputPath: cleanString(payload.outputPath) || existingEntry.outputPath || null,
            folder: cleanString(payload.folder) || null,
            scriptPath: cleanString(payload.scriptPath) || existingEntry.scriptPath || null,
            logPath: cleanString(payload.logPath) || existingEntry.logPath || null,
            multithreadscriptpath: cleanString(payload.multithreadscriptpath) || existingEntry.multithreadscriptpath || null,
            multithreadoutputpath: cleanString(payload.multithreadoutputpath) || existingEntry.multithreadoutputpath || null,
            maxspeedscriptpath: cleanString(payload.maxspeedscriptpath) || existingEntry.maxspeedscriptpath || null,
        };

        // Rebuild DownloadPaths map for this version: remove old entry and push updated
        const mergedPaths = { ...currentPaths };
        mergedPaths[serverKey] = mergedPaths[serverKey]
            ? mergedPaths[serverKey].filter((p) => !matchesServerId(p, server.id))
            : [];

        mergedPaths[serverKey].push(updatedEntry);

        // Persist change
        const updatedDoc = await PipelineConfig.collection.findOneAndUpdate(
            { _id: existingConfig._id },
            { $set: { DownloadPaths: mergedPaths, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );

        const updatedConfig = PipelineConfig.toResponse(updatedDoc);

        logger.audit('PIPELINE_DOWNLOAD_PATH_UPDATED', {
            configId: updatedConfig.id,
            version,
            targetServerId: server.id,
            serverKey,
            updatedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Download path updated successfully.', {
            config: updatedConfig,
        });
    });

    /**
      * GET /api/v1/admin-dashboard/pipeline-config/versions
      * Fetches all distinct pipeline config versions available in the collection.
      */
    static getVersions = asyncHandler(async (req, res) => {
        const versions = await PipelineConfig.collection.distinct('version', {
            version: { $exists: true, $ne: null },
        });

        const normalizedVersions = (versions || [])
            .filter((version) => typeof version === 'string' && version.trim().length > 0)
            .map((version) => version.trim())
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        logger.audit('PIPELINE_CONFIG_VERSIONS_FETCHED', {
            count: normalizedVersions.length,
            requestedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Pipeline config versions fetched successfully.', {
            versions: normalizedVersions,
        });
    });


    /**
      * GET /api/v1/admin-dashboard/pipeline-config/server-path
      * Fetches serverPathConfig for a particular version.
      */
    static getServerPathConfig = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const serverId = cleanString(payload.serverId || payload.targetServerId);

        if (serverId) {
            try {
                const server = await getLatestServerPathConfigForServer(serverId);
                logger.audit('SERVER_PATH_CONFIG_FETCHED', {
                    serverId,
                    requestedBy: req.user?.id,
                });

                return ApiResponse.success(res, 200, 'Server path config fetched successfully.', {
                    serverPath: server,
                    serverPaths: server.serverPaths,
                });
            } catch (error) {
                logger.error('Error fetching server path config', { serverId, error: error.message });
                return ApiResponse.error(res, error.statusCode || 500, error.message || 'Failed to fetch server path config.');
            }
        }

        const config = await findLatestConfig();

        if (!config) {
            return ApiResponse.error(res, 404, 'No pipeline configuration found.');
        }

        logger.audit('SERVER_PATH_CONFIG_FETCHED', {
            version: config.version || DEFAULT_VERSION,
            requestedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Server path config fetched successfully.', {
            version: config.version || DEFAULT_VERSION,
            serverPaths: normalizeServerPathsForResponse(config.serverPaths),
        });
    });
    /**
     * POST /api/v1/admin-dashboard/pipeline-config/download-path-config
     * Fetches download path config for a particular version.
     * Body: { version: string }
     */
    static getDownloadPathConfig = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);

        if (!version) {
            return ApiResponse.error(res, 400, 'version is required.');
        }

        const config = await findConfigByVersion(version);

        if (!config) {
            return ApiResponse.error(res, 404, `No configuration found for version: ${version}`);
        }

        logger.audit('DOWNLOAD_PATH_CONFIG_FETCHED', {
            version,
            requestedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Download path config fetched successfully.', {
            version,
            downloadPaths: normalizeServerPathsForResponse(config.DownloadPaths || {}),
        });
    });

    /**
     * POST /api/v1/admin-dashboard/pipeline-config/move-pack-path
     */
    static PostMovePackPath = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);
        const targetServerId = cleanString(payload.targetServerId || payload.serverId);

        if (!version) return ApiResponse.error(res, 400, 'version is required.');
        if (!targetServerId) return ApiResponse.error(res, 400, 'targetServerId is required.');

        let server;
        try {
            server = await getServerOrFail(targetServerId, 'targetServerId');
        } catch (err) {
            return ApiResponse.error(res, err.statusCode || 400, err.message);
        }

        const movePackEntry = {
            targetServerId: server.id,
            moveSourcePath: cleanString(payload.moveSourcePath) || null,
            moveTargetPath: cleanString(payload.moveTargetPath) || null,
            packInputFolder: cleanString(payload.packInputFolder) || null,
            packOutputPath: cleanString(payload.packOutputPath) || null,
            commonScriptPath: cleanString(payload.commonScriptPath || payload.scriptPath) || null,
            logPath: cleanString(payload.logPath) || null,
        };

        const serverKey = buildServerKey(server);
        const existingConfig = await findConfigByVersion(version);

        if (existingConfig) {
            const existingPaths = existingConfig.MovePackPaths || {};
            const serverGroup = existingPaths[serverKey] || [];

            const alreadyConfigured = serverGroup.some(
                (p) => p.targetServerId === server.id
            );

            if (alreadyConfigured) {
                return ApiResponse.error(
                    res,
                    400,
                    `Move & Pack path for this server is already configured for version ${version}.`
                );
            }

            const updatedDoc = await PipelineConfig.collection.findOneAndUpdate(
                { _id: existingConfig._id },
                {
                    $push: { [`MovePackPaths.${serverKey}`]: movePackEntry },
                    $set: { updatedAt: new Date() },
                },
                { returnDocument: 'after' }
            );

            const updatedConfig = PipelineConfig.toResponse(updatedDoc);

            logger.audit('PIPELINE_MOVE_PACK_PATH_UPDATED', {
                configId: updatedConfig.id,
                version,
                targetServerId: server.id,
                updatedBy: req.user?.id,
            });

            return ApiResponse.success(res, 200, 'Move & Pack path added successfully.', {
                config: updatedConfig,
            });
        }

        const created = await PipelineConfig.create({
            version,
            status: payload.status || 'added',
            adminList: payload.adminList || {},
            serverPaths: {},
            DownloadPaths: {},
            MovePackPaths: {
                [serverKey]: [movePackEntry],
            },
        });

        logger.audit('PIPELINE_MOVE_PACK_PATH_CREATED', {
            configId: created.id,
            version,
            targetServerId: server.id,
            createdBy: req.user?.id,
        });

        return ApiResponse.success(res, 201, 'Move & Pack path created successfully.', {
            config: PipelineConfig.toResponse(created),
        });
    });

    /**
     * PATCH /api/v1/admin-dashboard/pipeline-config/UpdateMovePack-path
     */
    static updateMovePackPath = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);
        const targetServerId = cleanString(payload.targetServerId || payload.serverId);

        if (!version) return ApiResponse.error(res, 400, 'version is required.');
        if (!targetServerId) return ApiResponse.error(res, 400, 'targetServerId is required.');

        let server;
        try {
            server = await getServerOrFail(targetServerId, 'targetServerId');
        } catch (err) {
            return ApiResponse.error(res, err.statusCode || 400, err.message);
        }

        const existingConfig = await findConfigByVersion(version);
        if (!existingConfig) {
            return ApiResponse.error(res, 404, `No pipeline config found for version "${version}".`);
        }

        const currentPaths = normalizeServerPathsForResponse(existingConfig.MovePackPaths || {});
        const existingEntries = flattenServerPaths(currentPaths);

        const existingEntry = existingEntries.find((p) => matchesServerId(p, server.id));

        if (!existingEntry) {
            return ApiResponse.error(res, 404, `Move & Pack path for server "${server.id}" is not configured in version "${version}".`);
        }

        const serverKey = buildServerKey(server);

        const updatedEntry = {
            targetServerId: server.id,
            moveSourcePath: payload.moveSourcePath !== undefined ? cleanString(payload.moveSourcePath) : existingEntry.moveSourcePath,
            moveTargetPath: payload.moveTargetPath !== undefined ? cleanString(payload.moveTargetPath) : existingEntry.moveTargetPath,
            packInputFolder: payload.packInputFolder !== undefined ? cleanString(payload.packInputFolder) : existingEntry.packInputFolder,
            packOutputPath: payload.packOutputPath !== undefined ? cleanString(payload.packOutputPath) : existingEntry.packOutputPath,
            commonScriptPath: (payload.commonScriptPath || payload.scriptPath) !== undefined ? cleanString(payload.commonScriptPath || payload.scriptPath) : existingEntry.commonScriptPath,
            logPath: payload.logPath !== undefined ? cleanString(payload.logPath) : existingEntry.logPath,
        };

        const mergedPaths = { ...currentPaths };
        mergedPaths[serverKey] = mergedPaths[serverKey]
            ? mergedPaths[serverKey].filter((p) => !matchesServerId(p, server.id))
            : [];

        mergedPaths[serverKey].push(updatedEntry);

        const updatedDoc = await PipelineConfig.collection.findOneAndUpdate(
            { _id: existingConfig._id },
            { $set: { MovePackPaths: mergedPaths, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );

        const updatedConfig = PipelineConfig.toResponse(updatedDoc);

        logger.audit('PIPELINE_MOVE_PACK_PATH_UPDATED', {
            configId: updatedConfig.id,
            version,
            targetServerId: server.id,
            serverKey,
            updatedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Move & Pack path updated successfully.', {
            config: updatedConfig,
        });
    });

    /**
     * GET /api/v1/admin-dashboard/pipeline-config/move-pack-path-config
     *
     * Supports ?version=<version>. When a version is supplied, return only the
     * Move & Pack paths for that version so updates do not get masked by paths
     * from older/newer config documents.
     */
    static getMovePackPathConfig = asyncHandler(async (req, res) => {
        const payload = {
            ...(req.query || {}),
            ...(req.body || {}),
        };
        const version = cleanString(payload.version);

        if (version) {
            const config = await findConfigByVersion(version);

            if (!config) {
                return ApiResponse.error(res, 404, `No configuration found for version: ${version}`);
            }

            logger.audit('MOVE_PACK_PATH_CONFIG_FETCHED', {
                version,
                requestedBy: req.user?.id,
            });

            return ApiResponse.success(res, 200, 'Move & Pack path config fetched successfully.', {
                version,
                movePackPaths: normalizeServerPathsForResponse(config.MovePackPaths || {}),
            });
        }

        // No version supplied: keep the legacy aggregate response for existing callers.
        const docs = await PipelineConfig.collection.find({}).sort({ createdAt: -1 }).toArray();
        const configs = (docs || []).map((d) => PipelineConfig.toResponse(d)).filter(Boolean);

        if (!configs.length) {
            return ApiResponse.error(res, 404, 'No configuration found.');
        }

        const aggregated = {};
        for (const cfg of configs) {
            const normalized = normalizeServerPathsForResponse(cfg.MovePackPaths || {});
            for (const [serverKey, paths] of Object.entries(normalized)) {
                aggregated[serverKey] = aggregated[serverKey] || [];
                for (const p of paths) {
                    // include version for traceability
                    aggregated[serverKey].push({ ...p, version: cfg.version || null });
                }
            }
        }

        logger.audit('MOVE_PACK_PATH_CONFIG_FETCHED', {
            requestedBy: req.user?.id,
            count: Object.keys(aggregated).length,
        });

        return ApiResponse.success(res, 200, 'Move & Pack path config fetched successfully.', {
            movePackPaths: aggregated,
        });
    });

    /**
     * GET /admin-dashboard/auth/users
     * Returns a paginated, filterable list of all admin users.
     * Supports: ?page=1&limit=10&role=admin&isActive=true&search=john
     */
    static getAdminUsers = asyncHandler(async (req, res) => {
        const { page = 1, limit = 10, role, isActive, search } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        const filter = {};

        if (role) filter.role = role;

        if (isActive !== undefined) filter.isActive = isActive === 'true';

        if (search) {
            const regex = new RegExp(search, 'i');
            filter.$or = [{ name: regex }, { email: regex }];
        }

        const { users, total } = await AdminDashboardUser.findAll({
            page: pageNum,
            limit: limitNum,
            filter,
        });

        logger.audit('ADMIN_USERS_FETCHED', {
            requestedBy: req.user.id,
            filter,
            page: pageNum,
        });

        return ApiResponse.success(res, 200, 'Admin users fetched successfully.', {
            users: users.map((user) => user.toJSON()),
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
                hasNext: pageNum < Math.ceil(total / limitNum),
                hasPrev: pageNum > 1,
            },
        });
    });
}

module.exports = PipelineConfigController;
