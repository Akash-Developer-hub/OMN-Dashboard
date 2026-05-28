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
        const config = await PipelineConfig.create({
            version,
            status: payload.status || 'added',
            adminList:
                payload.adminList ||
                (isExplicitAdminAddition ? buildAdminList(admin) : {}),
            serverPaths: groupServerPaths(serverPaths),
        });

        logger.audit('PIPELINE_CONFIG_CREATED', {
            configId: config.id,
            adminId: admin.id,
            version,
            runId: config.runId,
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
     * GET /api/v1/admin-dashboard/pipeline-config/admin-list
     * Fetches the merged adminList across all pipeline configurations.
     */
    /**
     * POST /api/v1/admin-dashboard/pipeline-config/notify-list
     *
     * Fetches the list of administrators configured to receive notifications
     * for a specific pipeline configuration version.
     *
     * Body:
     *   version {string} - Pipeline config version (default: v1.0)
     *
     * Response:
     *   notifyList {Array<NotifiedAdmin>} - Array of admin objects with id, name, email, role, method
     */
    // static getNotifyList = asyncHandler(async (req, res) => {
    //     const payload = req.body || {};
    //     const version = cleanString(payload.version) || DEFAULT_VERSION;

    //     try {
    //         // Find the config for the requested version
    //         const config = await findConfigByVersion(version);

    //         if (!config) {
    //             return ApiResponse.error(res, 404, `No configuration found for version: ${version}`);
    //         }

    //         // Extract adminList and convert from object to array
    //         const adminListObj = config.adminList || {};
    //         const notifyList = Object.values(adminListObj).filter(admin => admin && admin.id);

    //         // Sort by name for consistent ordering
    //         notifyList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    //         logger.audit('NOTIFY_LIST_FETCHED', {
    //             version,
    //             count: notifyList.length,
    //             requestedBy: req.user?.id,
    //         });

    //         return ApiResponse.success(res, 200, 'Notify list fetched successfully.', {
    //             version,
    //             notifyList,
    //         });
    //     } catch (error) {
    //         logger.error('Error fetching notify list', { version, error: error.message });
    //         return ApiResponse.error(res, 500, 'Failed to fetch notify list.');
    //     }
    // });

    static getNotifyList = asyncHandler(async (req, res) => {
        const version = cleanString(req.params.version) || DEFAULT_VERSION;

        try {
            const config = await findConfigByVersion(version);

            if (!config) {
                return ApiResponse.error(res, 404, `No configuration found for version: ${version}`);
            }

            const adminListObj = config.adminList || {};
            const notifyList = Object.values(adminListObj).filter(admin => admin && admin.id);

            notifyList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            logger.audit('NOTIFY_LIST_FETCHED', {
                version,
                count: notifyList.length,
                requestedBy: req.user?.id,
            });

            return ApiResponse.success(res, 200, 'Notify list fetched successfully.', {
                version,
                notifyList,
            });
        } catch (error) {
            logger.error('Error fetching notify list', { version, error: error.message });
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
     * GET /api/v1/admin-dashboard/pipeline-config/current-version
     * Fetches the latest version string for the 'generation' mode.
     */
    static getCurrentVersion = asyncHandler(async (req, res) => {
        const { configs } = await PipelineConfig.findAll({});

        if (!configs || configs.length === 0) {
            return ApiResponse.success(res, 200, 'Current version fetched.', {
                version: DEFAULT_VERSION,
            });
        }

        // Sort by createdAt descending to get the latest
        const sortedConfigs = configs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const latestConfig = sortedConfigs[0];

        return ApiResponse.success(res, 200, 'Current version fetched.', {
            version: latestConfig.version || DEFAULT_VERSION,
        });
    });

    /**
     * POST /api/v1/admin-dashboard/pipeline-config/server-path
     * Fetches serverPathConfig for a particular version.
     * 
     * Body:
     *   version {string} - Pipeline config version (required)
     */
    static getServerPathConfig = asyncHandler(async (req, res) => {
        const payload = req.body || {};
        const version = cleanString(payload.version);

        if (!version) {
            return ApiResponse.error(res, 400, 'version is required.');
        }

        const config = await findConfigByVersion(version);

        if (!config) {
            return ApiResponse.error(res, 404, `No configuration found for version: ${version}`);
        }

        logger.audit('SERVER_PATH_CONFIG_FETCHED', {
            version,
            requestedBy: req.user?.id,
        });

        return ApiResponse.success(res, 200, 'Server path config fetched successfully.', {
            version,
            serverPaths: normalizeServerPathsForResponse(config.serverPaths),
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