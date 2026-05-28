'use strict';

const { ObjectId } = require('mongodb');
const Contributor        = require('../models/contributions');
const ContributionBuilder = require('../services/contributionBuilder');
const osmTagBuilder         = require('../services/osmTagBuilder');
const CategoryConfigService = require('../services/categoryConfigService');
const User = require('../../models/User');
const PoiComment = require('../../models/PoiComment');
const PoiData = require('../../models/PoiData');
const PoiMedia = require('../../models/PoiMedia');
const logger = require('../../logs_/logger');
const ApiResponse        = require('../../utils/ApiResponse');
const asyncHandler       = require('../../utils/asyncHandler');
const { generateUniqueContributionId } = require('../../utils/contributionUniqueId');
const moment = require('moment-timezone');
const socketManager = require('../../socket/socketManager');
const { sendContributionStatusNotification } = require('../../services/notificationService');

const CONTRIBUTION_REWARD_POINTS_PER_APPROVED = 10;
const DEFAULT_TREND_DAYS = 7;
const LOW_COMPLETENESS_THRESHOLD = 50;


class ContributionsController {

    static guessMimeFromMediaUrl(value = '') {
        const url = String(value || '').toLowerCase();

        if (url.includes('.png')) return 'image/png';
        if (url.includes('.webp')) return 'image/webp';
        if (url.includes('.gif')) return 'image/gif';
        if (url.includes('.jpeg') || url.includes('.jpg')) return 'image/jpeg';

        return 'image/jpeg';
    }

    static extractContributionMedia(contribution = {}) {
        const images = Array.isArray(contribution?.media?.images) ? contribution.media.images : [];
        const fallbackImages = Array.isArray(contribution?.new_object?.images) ? contribution.new_object.images : [];
        const mergedImages = images.length > 0 ? images : fallbackImages;

        const normalizedImages = mergedImages
            .filter((item) => typeof item === 'string' && item.trim())
            .map((item) => ({
                data: item,
                cover: false,
            }));

        const logo = contribution?.media?.logo;
        if (typeof logo === 'string' && logo.trim()) {
            normalizedImages.push({ data: logo, cover: false });
        }

        const coverPhoto = contribution?.media?.coverPhoto;
        if (typeof coverPhoto === 'string' && coverPhoto.trim()) {
            normalizedImages.push({ data: coverPhoto, cover: true });
        }

        const uniqueByData = new Map();
        normalizedImages.forEach((item) => {
            const key = item.data.trim();
            if (!uniqueByData.has(key)) {
                uniqueByData.set(key, item);
                return;
            }

            if (item.cover === true) {
                uniqueByData.set(key, { ...uniqueByData.get(key), cover: true });
            }
        });

        return Array.from(uniqueByData.values());
    }

    static async syncContributionToPoiData(contribution = {}) {
        const uniqueId = String(contribution?.unique_id || '').trim();
        if (!uniqueId) {
            return { poiSynced: false, mediaInserted: 0 };
        }

        const lat = contribution?.location?.lat ?? contribution?.new_object?.lat ?? null;
        const lng = contribution?.location?.lng ?? contribution?.new_object?.lon ?? null;

        const poiPayload = {
            place: {
                name: contribution?.basicInfo?.name || contribution?.name || 'Unnamed POI',
                category: contribution?.category || null,
                latitude: lat,
                longitude: lng,
            },
            address: contribution?.address?.address || null,
            phone: contribution?.contact?.phone || null,
            email: contribution?.contact?.email || null,
            website: contribution?.socialMedia?.website || null,
            summary: contribution?.basicInfo?.description || null,
            openingHours: contribution?.openingHours || null,
            social: contribution?.socialMedia || {},
            services: contribution?.extra || {},
            osm_id: contribution?.osm_id || null,
            status: 'approved',
            sourceContributionId: uniqueId,
            updatedAt: new Date().toISOString(),
        };

        await PoiData.upsertByUniqueId(uniqueId, poiPayload);

        const existingMedia = await PoiMedia.findByPoiId(uniqueId);
        const existingMediaUrls = new Set(
            existingMedia
                .map((item) => String(item?.data || '').trim())
                .filter(Boolean)
        );

        const contributionMedia = ContributionsController.extractContributionMedia(contribution);
        const maxOrder = existingMedia.reduce((max, item) => {
            const order = Number(item?.order);
            return Number.isFinite(order) ? Math.max(max, order) : max;
        }, -1);

        let insertedCount = 0;
        for (const [index, media] of contributionMedia.entries()) {
            const mediaUrl = String(media?.data || '').trim();
            if (!mediaUrl || existingMediaUrls.has(mediaUrl)) {
                continue;
            }

            await PoiMedia.create({
                poi_id: uniqueId,
                type: 'url',
                mime: ContributionsController.guessMimeFromMediaUrl(mediaUrl),
                data: mediaUrl,
                caption: null,
                cover: media.cover === true,
                order: maxOrder + index + 1,
                status: 'approved',
            });

            existingMediaUrls.add(mediaUrl);
            insertedCount += 1;
        }

        return { poiSynced: true, mediaInserted: insertedCount };
    }

    static getValueByPath(obj = {}, path = '') {
        return path.split('.').reduce((acc, key) => {
            if (acc === null || acc === undefined) {
                return undefined;
            }

            return acc[key];
        }, obj);
    }

    static getContributionUpdateChanges(existing = {}, nextDoc = {}) {
        const trackedPaths = [
            'action',
            'category',
            'basicInfo',
            'location',
            'address',
            'contact',
            'media',
            'socialMedia',
            'businessFlags',
            'ownerInfo',
            'extra',
            'new_object.tags',
            'new_object.images',
            'mapunit',
            'fcm_token',
            'app_name',
            'geocoder_address',
            'openingHours'
        ];

        return trackedPaths.reduce((changes, path) => {
            const before = ContributionsController.getValueByPath(existing, path);
            const after = ContributionsController.getValueByPath(nextDoc, path);

            if (JSON.stringify(before) !== JSON.stringify(after)) {
                changes.push({
                    field: path,
                    before: before ?? null,
                    after: after ?? null
                });
            }

            return changes;
        }, []);
    }

    static getContributionPercentage(row = {}) {
        return Number(row?.contributionProgress?.contributePercentage);
    }

    static hasMedia(row = {}) {
        const images = row?.media?.images || row?.new_object?.images;
        const hasImages = Array.isArray(images) && images.length > 0;
        const hasLogo = Boolean(row?.media?.logo || row?.businessMetadata?.logo);
        const hasCoverPhoto = Boolean(row?.media?.coverPhoto || row?.businessMetadata?.coverPhoto);

        return hasImages || hasLogo || hasCoverPhoto;
    }

    static filterRowsByPercentage(rows = [], minPercentage, maxPercentage) {
        const hasMinPercentage = Number.isFinite(minPercentage);
        const hasMaxPercentage = Number.isFinite(maxPercentage);

        if (!hasMinPercentage && !hasMaxPercentage) {
            return rows;
        }

        return rows.filter((row) => {
            const percentage = ContributionsController.getContributionPercentage(row);

            if (!Number.isFinite(percentage)) {
                return false;
            }

            if (hasMinPercentage && percentage < minPercentage) {
                return false;
            }

            if (hasMaxPercentage && percentage > maxPercentage) {
                return false;
            }

            return true;
        });
    }

    static normalizeContributionSource(value) {
        const normalizedValue = String(value || '').trim().toLowerCase();

        if (normalizedValue.includes('admin')) {
            return 'admin';
        }

        if (normalizedValue.includes('vendor')) {
            return 'vendor';
        }

        if (normalizedValue.includes('user')) {
            return 'user';
        }

        return normalizedValue ? 'user' : 'unknown';
    }

    static normalizeContributionRegion(value) {
        const normalizedValue = String(value || '').trim();
        return normalizedValue || 'unknown';
    }

    static normalizeContributorName(value) {
        const normalizedValue = String(value || '').trim();
        return normalizedValue || 'unknown';
    }

    static buildContributionCards(rows = []) {
        return {
            total: rows.length,
            approved: rows.filter((item) => item.status === 1).length,
            pending: rows.filter((item) => item.status === 0).length,
            rejected: rows.filter((item) => item.status === 2).length,
            modified: rows.filter((item) => item.status === 3).length,
            activeBusiness: rows.filter((item) => item.isBusinessPlace === true && item.status === 1).length,
            activePoi: rows.filter((item) => item.isBusinessPlace === true && item.status === 1).length,
            lowCompleteness: rows.filter((item) => {
                const percentage = ContributionsController.getContributionPercentage(item);
                return Number.isFinite(percentage) && percentage < LOW_COMPLETENESS_THRESHOLD;
            }).length,
            verified: rows.filter((item) => item?.ownerInfo?.verified === true).length,
            missingPhotos: rows.filter((item) => !ContributionsController.hasMedia(item)).length,
            avgProgress: rows.length
                ? Math.round(
                    rows.reduce(
                        (sum, item) => sum + (Number.isFinite(ContributionsController.getContributionPercentage(item))
                            ? ContributionsController.getContributionPercentage(item)
                            : 0),
                        0
                    ) / rows.length
                )
                : 0
        };
    }

    static buildTrendMetric(current = 0, previous = 0) {
        const change = current - previous;

        return {
            current,
            previous,
            change,
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
        };
    }

    static buildContributionCardTrends(currentCards = {}, previousCards = {}, trendDays = DEFAULT_TREND_DAYS) {
        return {
            windowDays: trendDays,
            total: ContributionsController.buildTrendMetric(currentCards.total || 0, previousCards.total || 0),
            approved: ContributionsController.buildTrendMetric(currentCards.approved || 0, previousCards.approved || 0),
            pending: ContributionsController.buildTrendMetric(currentCards.pending || 0, previousCards.pending || 0),
            rejected: ContributionsController.buildTrendMetric(currentCards.rejected || 0, previousCards.rejected || 0),
            modified: ContributionsController.buildTrendMetric(
                currentCards.modified || 0,
                previousCards.modified || 0
            ),
            activeBusiness: ContributionsController.buildTrendMetric(
                currentCards.activeBusiness || 0,
                previousCards.activeBusiness || 0
            ),
            activePoi: ContributionsController.buildTrendMetric(
                currentCards.activePoi || 0,
                previousCards.activePoi || 0
            ),
            lowCompleteness: ContributionsController.buildTrendMetric(
                currentCards.lowCompleteness || 0,
                previousCards.lowCompleteness || 0
            ),
            verified: ContributionsController.buildTrendMetric(
                currentCards.verified || 0,
                previousCards.verified || 0
            ),
            missingPhotos: ContributionsController.buildTrendMetric(
                currentCards.missingPhotos || 0,
                previousCards.missingPhotos || 0
            ),
            avgProgress: ContributionsController.buildTrendMetric(
                currentCards.avgProgress || 0,
                previousCards.avgProgress || 0
            )
        };
    }

    // ── POST /add ─────────────────────────────────────────

    static addContribution = asyncHandler(async (req, res) => {
        let contributionDoc;

        try {
            contributionDoc = await ContributionBuilder.build(req.body);
        } catch (error) {
            return ApiResponse.error(res, 400, error.message);
        }

        contributionDoc.created_at = moment().valueOf();
        contributionDoc.updated_at = moment().valueOf();
        contributionDoc.approved_by= null;
        contributionDoc.status = 1; // directly approved since it's created by admin
        contributionDoc.isApproved = true;
        contributionDoc.isActive = true;
        contributionDoc.isCreatedByAdmin = true;
        contributionDoc.isCreatedBy = 'internal-admin';
        contributionDoc.name = 'praveen'; // Placeholder name, can be updated later
        const collection = Contributor.getcollection();
        contributionDoc.unique_id = await generateUniqueContributionId(collection);
        const result     = await collection.insertOne(contributionDoc);

        return ApiResponse.created(res, 'Contribution created successfully', {
            _id: result.insertedId,
            ...contributionDoc
        });
    })

    // ── GET /categories ───────────────────────────────────

    static getCategories = asyncHandler(async (req, res) => {
        const { search = '', includeFields = true } = req.query;
        console.log('Fetching categories with search:', search, 'and includeFields:', includeFields);
        const categories = await CategoryConfigService.listCategories({
            search,
            includeFields: !(includeFields === false || includeFields === 'false')
        });

        return ApiResponse.success(res, 200, 'Categories fetched successfully', categories);
    })


    static createCategory = asyncHandler(async (req, res) => {
        try {
            const category = await CategoryConfigService.createCategory(req.body);
            return ApiResponse.created(res, 'Category created successfully', category);
        } catch (error) {
            return ApiResponse.error(res, 400, error.message);
        }
    })


    static updateCategory = asyncHandler(async (req, res) => {
        const { category } = req.params;

        try {
            const updated = await CategoryConfigService.updateCategory(category, req.body);

            if (!updated) {
                return ApiResponse.error(res, 404, 'Category not found');
            }

            return ApiResponse.success(res, 200, 'Category updated successfully', updated);
        } catch (error) {
            return ApiResponse.error(res, 400, error.message);
        }
    })


    static updateContribution = asyncHandler(async (req, res) => {
        const { id } = req.body || {};
        if (!id || !Contributor.isValidId(id)) {
            return ApiResponse.error(res, 400, 'A valid contribution id is required');
        }

        const collection = Contributor.getcollection();
        const objectId = Contributor.toObjectId(id);
        const existing = await collection.findOne({ _id: objectId });

        if (!existing) {
            return ApiResponse.error(res, 404, 'Contribution not found');
        }

        const categories = await CategoryConfigService.getAllCategoryConfigs();
        const categoriesByKey = new Map(categories.map((item) => [item.category, item]));

        const existingPayload = osmTagBuilder.mapContributionToFrontendPayload(existing, categoriesByKey);
        const mergedPayload = osmTagBuilder.mergeUpdatePayload(existingPayload, req.body);

        let rebuiltDoc;

        try {
            rebuiltDoc = await ContributionBuilder.build({
                ...mergedPayload,
                action: req.body.action || 'update'
            });
        } catch (error) {
            return ApiResponse.error(res, 400, error.message);
        }

        const existingPercentage = Number(existing?.contributionProgress?.contributePercentage);
        const rebuiltPercentage = Number(rebuiltDoc?.contributionProgress?.contributePercentage);

        if (
            Number.isFinite(existingPercentage) &&
            (!Number.isFinite(rebuiltPercentage) || rebuiltPercentage < existingPercentage)
        ) {
            rebuiltDoc.contributionProgress = existing.contributionProgress;
        }

        const updateChanges = ContributionsController.getContributionUpdateChanges(existing, rebuiltDoc);

        if (updateChanges.length === 0) {
            return ApiResponse.success(res, 200, 'No changes detected. Contribution remains unchanged.', existing);
        }

        const now = moment().valueOf();
        const changedBy = req.user?.id || req.user?._id || req.body?.user_id || existing.user_id || null;
        const nextDoc = {
            ...rebuiltDoc,
            created_at: existing.created_at || rebuiltDoc.created_at,
            updated_at: now,
            status: 1,
            isApproved: true,
            __v: Number.isInteger(existing.__v) ? existing.__v + 1 : 1
        };
        const changeLogEntry = {
            changedAt: now, 
            changedBy,
            previousStatus: existing.status || null,
            nextStatus: 'pending',
            action: 'update-and-resubmit-for-approval',
            totalChangedFields: updateChanges.length,
            changes: updateChanges
        };

        const { _id, ...setDoc } = nextDoc;

        await collection.updateOne(
            { _id: objectId },
            {
                $set: setDoc,
                $push: {
                    changeLogs: {
                        $each: [changeLogEntry],
                        $slice: -100
                    }
                }
            }
        );

        logger.audit('CONTRIBUTION_UPDATED_FOR_APPROVAL', {
            contributionId: String(objectId),
            changedBy,
            previousStatus: existing.status || null,
            nextStatus: 'pending',
            changedFields: updateChanges.map((item) => item.field),
            ip: req.ip,
            correlationId: req.correlationId
        });

        let userContributionStats = null;
        if (existing.user_id) {
            userContributionStats = await ContributionsController.syncUserContributionStats(existing.user_id);
        }

        const updated = await collection.findOne({ _id: objectId });

        return ApiResponse.success(
            res,
            200,
            'Contribution updated and moved to pending admin approval successfully',
            {
                ...updated,
                userContributionStats,
                latestChangeLog: changeLogEntry
            }
        );
    })


    static deleteContribution = async (req, res) => {

    }

    static approveContribution = asyncHandler(async (req, res) => {
        const { id, approved = true } = req.body || {};

        if (!id || !Contributor.isValidId(id)) {
            return ApiResponse.error(res, 400, 'A valid contribution id is required');
        }

        const collection = Contributor.getcollection();
        const objectId = Contributor.toObjectId(id);
        const existing = await collection.findOne({ _id: objectId });

        if (!existing) {
            return ApiResponse.error(res, 404, 'Contribution not found');
        }

        const isApproved = approved === true || approved === 'true' || approved === 1 || approved === '1';
        const now = moment().valueOf();
        const approverId = req.user?.id || req.user?._id || null;


        await collection.updateOne(
            { _id: objectId },
            {
                $set: {
                    status: isApproved ? 1 : 2,
                    isApproved,
                    approved_by: isApproved ? approverId : null,
                    approved_at: isApproved ? now : null,
                    updated_at: now
                }
            }
        );

        let userContributionStats = null;
        if (isApproved && existing.user_id) {
            userContributionStats = await ContributionsController.syncUserContributionStats(existing.user_id);
        }

        const updated = await collection.findOne({ _id: objectId });

        if (existing.user_id) {
            await sendContributionStatusNotification({
                userId: existing.user_id,
                contributionId: objectId,
                statusValue: isApproved ? 'approved' : 'rejected',
                poiName: existing.basicInfo?.name
            });
        }

        return ApiResponse.success(
            res,
            200,
            `Contribution ${isApproved ? 'approved' : 'rejected'} successfully`,
            {
                ...updated,
                userContributionStats
            }
        );
    })

    static normalizeUserId(userId) {
        if (!userId) return null;
        if (userId instanceof ObjectId) return userId;
        if (typeof userId === 'string' && ObjectId.isValid(userId)) {
            return new ObjectId(userId);
        }
        return userId;
    }

    static async getUserContributionStats(userId) {
        const normalizedUserId = ContributionsController.normalizeUserId(userId);

        if (!normalizedUserId) {
            return {
                contributionLevel: 0,
                totalCreatedContributions: 0,
                totalApprovedContributions: 0,
                contributionApprovalPercentage: 0,
                rewardPoints: 0
            };
        }

        const collection = Contributor.getcollection();
        const [totalCreatedContributions, totalApprovedContributions] = await Promise.all([
            collection.countDocuments({ user_id: normalizedUserId }),
            collection.countDocuments({ user_id: normalizedUserId, status: 'approved' })
        ]);

        const contributionApprovalPercentage = totalCreatedContributions > 0
            ? Math.round((totalApprovedContributions / totalCreatedContributions) * 100)
            : 0;

        return {
            contributionLevel: totalCreatedContributions,
            totalCreatedContributions,
            totalApprovedContributions,
            contributionApprovalPercentage,
            rewardPoints: totalApprovedContributions * CONTRIBUTION_REWARD_POINTS_PER_APPROVED
        };
    }

    static async syncUserContributionStats(userId) {
        const normalizedUserId = ContributionsController.normalizeUserId(userId);
        const stats = await ContributionsController.getUserContributionStats(normalizedUserId);
        const now = moment().valueOf();

        await User.collection.updateOne(
            { _id: normalizedUserId },
            {
                $set: {
                    contributionLevel: stats.contributionLevel,
                    contributionPercentage: stats.contributionApprovalPercentage,
                    contributionRewards: {
                        points: stats.rewardPoints,
                        pointsPerApprovedContribution: CONTRIBUTION_REWARD_POINTS_PER_APPROVED,
                        approvedContributions: stats.totalApprovedContributions,
                        totalContributions: stats.totalCreatedContributions,
                        contributionLevel: stats.contributionLevel,
                        contributionApprovalPercentage: stats.contributionApprovalPercentage,
                        updatedAt: now
                    },
                    updatedAt: now
                }
            }
        );

        return stats;
    }


    /**
     * GET /list  —  Paginated contribution list with card summary and trend deltas.
     *
     * ─── CARDS ──────────────────────────────────────────────────────────────────
     * Cards are computed from the *complete* filtered result set (not just the
     * current page) so the numbers are always globally accurate.
     *
     * When minPercentage / maxPercentage filters are present:
     *   • All matching documents are fetched and mapped in memory; the percentage
     *     filter is applied in JS because MongoDB cannot query the computed field
     *     `contributionProgress.contributePercentage` efficiently without a stored
     *     index.  The page slice is then taken from this pre-filtered array.
     *
     * When no percentage filter is present:
     *   • A lean projection query (status, isBusinessPlace, contributionProgress,
     *     ownerInfo, media, businessMetadata, new_object, created_at) fetches the
     *     full result set for stats, while a separate query retrieves only the page
     *     slice for the `data` array.  countDocuments() runs in parallel.
     *
     * Card fields and their derivation:
     *   ┌──────────────────┬───────────────────────────────────────────────────────┐
     *   │ Field            │ Rule                                                  │
     *   ├──────────────────┼───────────────────────────────────────────────────────┤
     *   │ total            │ Total count of documents matching the active filters.  │
     *   │ approved         │ status === 'approved'                                  │
     *   │ pending          │ status === 'pending'                                   │
     *   │ rejected         │ status === 'rejected'                                  │
     *   │ activeBusiness   │ isBusinessPlace === true  (legacy alias for activePoi) │
     *   │ activePoi        │ isBusinessPlace === true                               │
     *   │ lowCompleteness  │ contributePercentage < LOW_COMPLETENESS_THRESHOLD (50) │
     *   │ verified         │ ownerInfo.verified === true                            │
     *   │ missingPhotos    │ No images array entries AND no logo AND no coverPhoto  │
     *   │                  │ (checks media.*, businessMetadata.*, new_object.images)│
     *   │ avgProgress      │ Mean contributePercentage across all filtered rows,    │
     *   │                  │ rounded to nearest integer.  0 when no rows exist.     │
     *   └──────────────────┴───────────────────────────────────────────────────────┘
     *
     * ─── TRENDS ─────────────────────────────────────────────────────────────────
     * Trends compare two consecutive time windows of equal length (trendDays) that
     * are derived from the *same* filtered result set — no extra DB query is made.
     *
     *   Timeline:
     *     previousPeriodStart ──── currentPeriodStart ──── now
     *     |← previous window (trendDays) →|← current window (trendDays) →|
     *
     *   • currentPeriodStart  = now − trendDays
     *   • previousPeriodStart = now − (trendDays × 2)
     *
     *   Rows are split by their created_at timestamp into currentTrendRows /
     *   previousTrendRows.  Cards are built for each bucket separately, then each
     *   metric is compared:
     *
     *     change    = current − previous
     *     direction = 'up'   if change > 0
     *               = 'down' if change < 0
     *               = 'flat' if change === 0
     *
     *   trends.windowDays echoes back the effective trendDays used so callers
     *   can display the window label without re-parsing the query string.
     *
     * @param {import('express').Request}  req
     * @param {import('express').Response} res
     */
    static getContributions = asyncHandler(async (req, res) => {
        const {
            page = 1,
            limit = 20,
            category,
            activity = 'all',
            status,
            search,
            priority = null,
            isCreatedBy = null,
            minPercentage,
            maxPercentage,
            trendDays = DEFAULT_TREND_DAYS,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        const query = {};

        if (category) {
            const categoryConfig = await CategoryConfigService.getCategory(category);
            if (!categoryConfig) {
                return ApiResponse.error(res, 400, `Unknown category: "${category}"`);
            }

            if (categoryConfig?.primaryTag?.key && categoryConfig?.primaryTag?.value) {
                query.$or = [
                    { category },
                    { [`new_object.tags.${categoryConfig.primaryTag.key}`]: categoryConfig.primaryTag.value }
                ];
            } else {
                query.category = category;
            }
        }

        if (activity === 'active') {
            query.isBusinessPlace = true;
        } else if (activity === 'inactive') {
            query.isBusinessPlace = false;
        }

        if (status) {
            query.status = status;
        }

        if (search) {
            const regex = { $regex: search, $options: 'i' };
            const searchOr = [
                { 'basicInfo.name': regex },
                { 'basicInfo.description': regex },
                { 'new_object.tags.name': regex },
                { 'new_object.tags.description': regex },
                { 'address.city': regex },
                { 'address.area': regex },
                { 'address.street': regex }
            ];

            if (Array.isArray(query.$or) && query.$or.length > 0) {
                query.$and = query.$and || [];
                query.$and.push({ $or: query.$or });
                query.$and.push({ $or: searchOr });
                delete query.$or;
            } else {
                query.$or = searchOr;
            }
        }
        if (isCreatedBy) {
            query.isCreatedBy = isCreatedBy;
        }
        if(priority){
            query.priority = priority;
        }

        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const minPercentageNumber = Number(minPercentage);
        const maxPercentageNumber = Number(maxPercentage);
        const hasMinPercentage = Number.isFinite(minPercentageNumber);
        const hasMaxPercentage = Number.isFinite(maxPercentageNumber);
        const sortDirection = sortOrder === 'asc' ? 1 : -1;
        const hasPercentageFilter = hasMinPercentage || hasMaxPercentage;
        const trendWindowDays = Number.isFinite(Number(trendDays)) && Number(trendDays) > 0
            ? Number(trendDays)
            : DEFAULT_TREND_DAYS;
        const now = moment().valueOf();
        const currentPeriodStart = moment(now).subtract(trendWindowDays, 'days').valueOf();
        const previousPeriodStart = moment(currentPeriodStart).subtract(trendWindowDays, 'days').valueOf();
        const categories = await CategoryConfigService.getAllCategoryConfigs();
        const categoriesByKey = new Map(categories.map((item) => [item.category, item]));

        const collection = Contributor.getcollection();
        let total = 0;
        let data = [];
        let filteredRows = [];

        if (hasPercentageFilter) {
            const allRows = await collection
                .find(query)
                .sort({ [sortBy]: sortDirection })
                .toArray();

            filteredRows = ContributionsController.filterRowsByPercentage(
                allRows,
                minPercentageNumber,
                maxPercentageNumber
            );

            total = filteredRows.length;
            const skip = (pageNumber - 1) * limitNumber;
            data = filteredRows
                .slice(skip, skip + limitNumber)
                .map((row) => osmTagBuilder.mapContributionToFrontendPayload(row, categoriesByKey));
        } else {
            const skip = (pageNumber - 1) * limitNumber;
            const statsProjection = {
                projection: {
                    status: 1,
                    isBusinessPlace: 1,
                    contributionProgress: 1,
                    ownerInfo: 1,
                    media: 1,
                    businessMetadata: 1,
                    new_object: 1,
                    created_at: 1
                }
            };
            const [count, rows, statsRows] = await Promise.all([
                collection.countDocuments(query),
                collection
                    .find(query)
                    .sort({ [sortBy]: sortDirection })
                    .skip(skip)
                    .limit(limitNumber)
                    .toArray(),
                collection
                    .find(query, statsProjection)
                    .toArray()
            ]);

            total = count;
            data = rows.map((row) => osmTagBuilder.mapContributionToFrontendPayload(row, categoriesByKey));
            filteredRows = statsRows;
        }

        const cards = ContributionsController.buildContributionCards(filteredRows);
        const currentTrendRows = filteredRows.filter((item) => {
            const createdAt = Number(item?.created_at);
            return Number.isFinite(createdAt) && createdAt >= currentPeriodStart && createdAt <= now;
        });
        const previousCards = ContributionsController.buildContributionCards(
            filteredRows.filter((item) => {
                const createdAt = Number(item?.created_at);
                return Number.isFinite(createdAt) && createdAt >= previousPeriodStart && createdAt < currentPeriodStart;
            })
        );

        cards.trends = ContributionsController.buildContributionCardTrends(
            ContributionsController.buildContributionCards(currentTrendRows),
            previousCards,
            trendWindowDays
        );

        return ApiResponse.success(
            res,
            200,
            'Contributions fetched successfully',
            data,
            {
                pagination: {
                    page: pageNumber,
                    limit: limitNumber,
                    total,
                    pages: Math.ceil(total / limitNumber)
                },
                filters: {
                    category: category || null,
                    activity,
                    status: status || null,
                    search: search || null,
                    minPercentage: hasMinPercentage ? minPercentageNumber : null,
                    maxPercentage: hasMaxPercentage ? maxPercentageNumber : null,
                    trendDays: trendWindowDays
                },
                cards
            }
        );
    })

    static deleteContributionById = asyncHandler(async (req, res) => {
        const { id } = req.body || {};

        if (!id || !Contributor.isValidId(id)) {
            return ApiResponse.error(res, 400, 'A valid contribution id is required');
        }

        const collection = Contributor.getcollection();
        const objectId = Contributor.toObjectId(id);
        const row = await collection.findOneAndDelete({ _id: objectId });

        if (!row) {
            return ApiResponse.error(res, 404, 'Contribution not found');
        }

        logger.info('Contribution deleted', {
            event: 'contribution_delete',
            contributionId: id,
            deletedBy: req.user?.id || req.user?._id || null
        });

        const categories = await CategoryConfigService.getAllCategoryConfigs();
        const categoriesByKey = new Map(categories.map((item) => [item.category, item]));
        const data = osmTagBuilder.mapContributionToFrontendPayload(row, categoriesByKey);

        return ApiResponse.success(res, 200, 'Contribution deleted successfully', data);
    })

    static statisticsContribution = async (req, res) => {

    }
    static handleStatusUpdate = async (req, res) => {

        try{
            const { id, status } = req.body || {};

            if (!id || !Contributor.isValidId(id)) {
                return ApiResponse.error(res, 400, 'A valid contribution id is required');
            }

            const collection = Contributor.getcollection();

            const objectId = Contributor.toObjectId(id);
            const existing = await collection.findOne({ _id: objectId });
            if (!existing) {
                return ApiResponse.error(res, 404, 'Contribution not found');
            }
            const now = moment().valueOf();
            await collection.updateOne(
                { _id: objectId },
                {
                    $set: {
                        status,
                        updated_at: now
                    }
                }
            );
            const updated = await collection.findOne({ _id: objectId });
            return ApiResponse.success(
                res,
                200,
                `Contribution status updated to ${status} successfully`,
                updated
            );

        }catch(error){
            return ApiResponse.error(res, 400, error.message);
        }
    }



    static getContributionAnalytics = asyncHandler(async (req, res) => {
        try {
            const { category, startDate, endDate } = req.body || {};
            const baseQuery = {};

            if (category) {
                const categoryConfig = await CategoryConfigService.getCategory(category);
                if (!categoryConfig) {
                    return ApiResponse.error(res, 400, `Unknown category: "${category}"`);
                }
                baseQuery.category = category;
            }

            const query = { ...baseQuery };
            // if (startDate || endDate) {
            //     query.created_at = {};
            //     if (startDate) query.created_at.$gte = Number(startDate);
            //     if (endDate) query.created_at.$lte = Number(endDate);
            // }

            const collection = Contributor.getcollection();
            const currentMonthStart = moment().startOf('month').valueOf();
            const nextMonthStart = moment(currentMonthStart).add(1, 'month').valueOf();
            const lastMonthStart = moment(currentMonthStart).subtract(1, 'month').valueOf();
            const currentWeekStart = moment().startOf('isoWeek').valueOf();
            const nextWeekStart = moment(currentWeekStart).add(1, 'week').valueOf();

            const monthMetricGroupStage = {
                $group: {
                    _id: null,
                    totalContributions: { $sum: 1 },
                    approvedContributions: {
                        $sum: {
                            $cond: [
                                { $in: ['$status', [1, '1', 'approved']] },
                                1,
                                0
                            ]
                        }
                    },
                    activeContributions: {
                        $sum: {
                            $cond: [
                                {
                                    $or: [
                                        { $eq: ['$isActive', true] },
                                        { $in: ['$status', [0, '0', 'pending']] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    avgReviewTimeMs: {
                        $avg: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$approved_at', null] },
                                        { $gte: ['$approved_at', '$created_at'] }
                                    ]
                                },
                                { $subtract: ['$approved_at', '$created_at'] },
                                null
                            ]
                        }
                    }
                }
            };

            const [
                statusData,
                totalContributions,
                monthlyData,
                contributorData,
                reviewTimeData,
                contributorNameData,
                typeData,
                sourceData,
                regionData,
                currentWeekDayData,
                monthComparisonData
            ] = await Promise.all([

                // ✅ STATUS COUNT
                collection.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]).toArray(),

                // ✅ TOTAL
                collection.countDocuments(query),

                // ✅ MONTHLY TREND
                collection.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: {
                                year: { $year: { $toDate: '$created_at' } },
                                month: { $month: { $toDate: '$created_at' } }
                            },
                            total: { $sum: 1 },
                            approved: {
                                $sum: {
                                    $cond: [
                                        { $in: ['$status', [1, '1', 'approved']] },
                                        1,
                                        0
                                    ]
                                }
                            },
                            pending: {
                                $sum: {
                                    $cond: [
                                        { $in: ['$status', [0, '0', 'pending']] },
                                        1,
                                        0
                                    ]
                                }
                            },
                            rejected: {
                                $sum: {
                                    $cond: [
                                        { $in: ['$status', [2, '2', 'rejected']] },
                                        1,
                                        0
                                    ]
                                }
                            },
                            modified: {
                                $sum: {
                                    $cond: [
                                        { $in: ['$status', [3, '3', 'modified', 'changes_requested']] },
                                        1,
                                        0
                                    ]
                                }
                            },
                            avgReviewTimeMs: {
                                $avg: {
                                    $cond: [
                                        {
                                            $and: [
                                                { $ne: ['$approved_at', null] },
                                                { $gte: ['$approved_at', '$created_at'] }
                                            ]
                                        },
                                        { $subtract: ['$approved_at', '$created_at'] },
                                        null
                                    ]
                                }
                            }
                        }
                    },
                    { $sort: { '_id.year': 1, '_id.month': 1 } }
                ]).toArray(),

                // ✅ ACTIVE CONTRIBUTORS
                collection.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: '$user_id',
                            contributions: { $sum: 1 }
                        }
                    }
                ]).toArray(),

                // ✅ AVG REVIEW TIME
                collection.aggregate([
                    {
                        $match: {
                            ...query,
                            approved_at: { $ne: null }
                        }
                    },
                    {
                        $project: {
                            reviewTime: {
                                $subtract: ['$approved_at', '$created_at']
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            avgReviewTime: { $avg: '$reviewTime' }
                        }
                    }
                ]).toArray(),

                // ✅ TOP CONTRIBUTORS BY NAME (MERGES SAME NAME)
                collection.aggregate([
                    { $match: query },
                    {
                        $project: {
                            contributorName: {
                                $trim: {
                                    input: { $ifNull: ['$name', ''] }
                                }
                            },
                            userId: '$user_id'
                        }
                    },
                    {
                        $group: {
                            _id: {
                                $cond: [
                                    { $gt: [{ $strLenCP: '$contributorName' }, 0] },
                                    '$contributorName',
                                    'unknown'
                                ]
                            },
                            contributions: { $sum: 1 },
                            contributorIds: { $addToSet: '$userId' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            name: '$_id',
                            contributions: 1,
                            contributorAccounts: {
                                $size: {
                                    $filter: {
                                        input: '$contributorIds',
                                        as: 'id',
                                        cond: {
                                            $and: [
                                                { $ne: ['$$id', null] },
                                                { $ne: ['$$id', ''] }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    },
                    { $sort: { contributions: -1, name: 1 } },
                    { $limit: 10 }
                ]).toArray(),

                // ✅ TYPE (ACTION BASED)
                collection.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: '$action',
                            count: { $sum: 1 }
                        }
                    }
                ]).toArray(),

                collection.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: {
                                $switch: {
                                    branches: [
                                        {
                                            case: {
                                                $regexMatch: {
                                                    input: {
                                                        $toLower: {
                                                            $ifNull: ['$isCreatedBy', '']
                                                        }
                                                    },
                                                    regex: 'internal-admin'
                                                }
                                            },
                                            then: 'admin'
                                        },
                                        {
                                            case: {
                                                $regexMatch: {
                                                    input: {
                                                        $toLower: {
                                                            $ifNull: ['$isCreatedBy', '']
                                                        }
                                                    },
                                                    regex: 'vendor'
                                                }
                                            },
                                            then: 'vendor'
                                        },
                                        {
                                            case: {
                                                $regexMatch: {
                                                    input: {
                                                        $toLower: {
                                                            $ifNull: ['$isCreatedBy', '']
                                                        }
                                                    },
                                                    regex: 'user'
                                                }
                                            },
                                            then: 'user'
                                        }
                                    ],
                                    default: {
                                        $cond: [
                                            {
                                                $gt: [
                                                    {
                                                        $strLenCP: {
                                                            $trim: {
                                                                input: {
                                                                    $ifNull: ['$isCreatedBy', '']
                                                                }
                                                            }
                                                        }
                                                    },
                                                    0
                                                ]
                                            },
                                            'user',
                                            'unknown'
                                        ]
                                    }
                                }
                            },
                            count: { $sum: 1 }
                        }
                    }
                ]).toArray(),

                collection.aggregate([
                    { $match: query },
                    {
                        $group: {
                            _id: {
                                $cond: [
                                    {
                                        $gt: [
                                            {
                                                $strLenCP: {
                                                    $trim: {
                                                        input: {
                                                            $ifNull: ['$address.state', '']
                                                        }
                                                    }
                                                }
                                            },
                                            0
                                        ]
                                    },
                                    {
                                        $trim: {
                                            input: {
                                                $ifNull: ['$address.state', '']
                                            }
                                        }
                                    },
                                    'unknown'
                                ]
                            },
                            count: { $sum: 1 }
                        }
                    }
                ]).toArray(),

                collection.aggregate([
                    {
                        $match: {
                            ...baseQuery,
                            created_at: { $gte: currentWeekStart, $lt: nextWeekStart }
                        }
                    },
                    {
                        $group: {
                            _id: { $isoDayOfWeek: { $toDate: '$created_at' } },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]).toArray(),

                // ✅ CURRENT MONTH vs LAST MONTH
                collection.aggregate([
                    {
                        $match: {
                            ...baseQuery,
                            created_at: { $gte: lastMonthStart, $lt: nextMonthStart }
                        }
                    },
                    {
                        $facet: {
                            currentMonth: [
                                { $match: { created_at: { $gte: currentMonthStart, $lt: nextMonthStart } } },
                                monthMetricGroupStage
                            ],
                            lastMonth: [
                                { $match: { created_at: { $gte: lastMonthStart, $lt: currentMonthStart } } },
                                monthMetricGroupStage
                            ]
                        }
                    }
                ]).toArray()
            ]);

            const byStatus = {};
            statusData.forEach((item) => {
                const key = item._id !== null && item._id !== undefined ? String(item._id) : 'unknown';
                byStatus[key] = item.count;
            });

            const bySource = {
                user: 0,
                admin: 0,
                vendor: 0,
                unknown: 0
            };

            sourceData.forEach((item) => {
                const key = ContributionsController.normalizeContributionSource(item._id);
                bySource[key] = item.count;
            });

            const byRegion = {};
            regionData.forEach((item) => {
                const key = ContributionsController.normalizeContributionRegion(item._id);
                byRegion[key] = item.count;
            });

            const currentWeekContributionByDay = {
                monday: 0,
                tuesday: 0,
                wednesday: 0,
                thursday: 0,
                friday: 0,
                saturday: 0,
                sunday: 0
            };
            const isoDayToKey = {
                1: 'monday',
                2: 'tuesday',
                3: 'wednesday',
                4: 'thursday',
                5: 'friday',
                6: 'saturday',
                7: 'sunday'
            };

            currentWeekDayData.forEach((item) => {
                const key = isoDayToKey[Number(item?._id)];
                if (key) {
                    currentWeekContributionByDay[key] = Number(item?.count || 0);
                }
            });

            const approvedCount = (byStatus['1'] || 0) + (byStatus.approved || 0);
            const approvalRate = totalContributions
                ? (approvedCount / totalContributions) * 100
                : 0;

            const activeContributors = contributorData.length;
            const topContributors = contributorNameData
                .map((item, index) => ({
                    rank: index + 1,
                    name: ContributionsController.normalizeContributorName(item?.name),
                    contributions: Number(item?.contributions || 0),
                    contributorAccounts: Number(item?.contributorAccounts || 0)
                }));
    
                
            const avgReviewTime = reviewTimeData.length > 0
                ? reviewTimeData[0].avgReviewTime / (1000 * 60 * 60)
                : 0;

            const comparisonRoot = monthComparisonData[0] || {};
            const currentMonthMetrics = comparisonRoot.currentMonth?.[0] || {};
            const lastMonthMetrics = comparisonRoot.lastMonth?.[0] || {};

            const normalizeMonthMetrics = (metrics = {}) => {
                const total = Number(metrics.totalContributions || 0);
                const approved = Number(metrics.approvedContributions || 0);
                const active = Number(metrics.activeContributions || 0);
                const avgReviewTimeMs = Number(metrics.avgReviewTimeMs || 0);
                return {
                    totalContributions: total,
                    approvalRate: total > 0 ? Number(((approved / total) * 100).toFixed(2)) : 0,
                    avgReviewTimeHours: Number((avgReviewTimeMs / (1000 * 60 * 60)).toFixed(2)),
                    activeContributions: active
                };
            };

            const currentMonth = normalizeMonthMetrics(currentMonthMetrics);
            const lastMonth = normalizeMonthMetrics(lastMonthMetrics);
            const monthWiseAverageReviewTimeHours = monthlyData.map((item) => ({
                year: Number(item?._id?.year || 0),
                month: Number(item?._id?.month || 0),
                avgReviewTimeHours: Number((Number(item?.avgReviewTimeMs || 0) / (1000 * 60 * 60)).toFixed(2))
            }));

            return ApiResponse.success(res, 200, 'Analytics fetched', {
                summary: {
                    totalContributions,
                    approvalRate: approvalRate.toFixed(2),
                    avgReviewTime: avgReviewTime.toFixed(2),
                    activeContributors
                },
                monthComparison: {
                    currentMonth,
                    lastMonth,
                    delta: {
                        totalContributions: currentMonth.totalContributions - lastMonth.totalContributions,
                        approvalRate: Number((currentMonth.approvalRate - lastMonth.approvalRate).toFixed(2)),
                        avgReviewTimeHours: Number((currentMonth.avgReviewTimeHours - lastMonth.avgReviewTimeHours).toFixed(2)),
                        activeContributions: currentMonth.activeContributions - lastMonth.activeContributions
                    }
                },
                byStatus,
                bySource,
                byRegion,
                currentWeekContributionByDay,
                topContributors,
                monthWiseAverageReviewTimeHours,
                monthlyTrend: monthlyData,
                byType: typeData
            });

        } catch (error) {
            return ApiResponse.error(res, 400, error.message);
        }
    });


    static getApprovedContributions = async (req, res) => {
        try {
            const collection = Contributor.getcollection();
            const approvedContributions = await collection
                .find({ status: { $in: [1, '1', 'approved'] } })
                .sort({ created_at: -1 })
                .toArray();

            return ApiResponse.success(res, 200, 'Approved contributions fetched', approvedContributions);
        } catch (error) {
            return ApiResponse.error(res, 400, error.message);
        }
    }

    static updateContributionStatusIlive = async (req, res) => {
        try {
            const { id } = req.body || {};
            const collection = Contributor.getcollection();

            if (!Array.isArray(id) || id.length === 0) {
                return ApiResponse.error(res, 400, 'id must be a non-empty array of contribution ids.');
            }

            const objectIds = id
                .filter((item) => ObjectId.isValid(item))
                .map((item) => new ObjectId(item));

            if (objectIds.length === 0) {
                return ApiResponse.error(res, 400, 'No valid contribution ids provided.');
            }

            const approvedContributions = await collection
                .find({
                    _id: { $in: objectIds },
                    status: { $in: [1, '1', 'approved'] },
                })
                .toArray();

            if (approvedContributions.length === 0) {
                return ApiResponse.error(res, 400, 'No approved contributions found for provided ids.');
            }

            let totalMediaInserted = 0;
            for (const contribution of approvedContributions) {
                const syncResult = await ContributionsController.syncContributionToPoiData(contribution);
                totalMediaInserted += syncResult.mediaInserted;
            }

            const approvedObjectIds = approvedContributions.map((item) => item._id);
            const liveTimestamp = Date.now();

            const updateResult = await collection.updateMany(
                { _id: { $in: approvedObjectIds } },
                { $set: { isLive: true, liveAt: liveTimestamp, liveUpdateAt: liveTimestamp } }
            );

            return ApiResponse.success(res, 200, 'Contribution status updated to live', {
                matchedCount: updateResult.matchedCount || 0,
                modifiedCount: updateResult.modifiedCount || 0,
                syncedPoiCount: approvedContributions.length,
                mediaInsertedCount: totalMediaInserted,
            });
        } catch (error) {
            return ApiResponse.error(res, 500, error.message);
        }

    }

    /**
     * GET /approved-not-live/count
     * Returns count of contributions that are approved (status 1) but not yet live (isLive != true).
     */
    static getApprovedNotLiveCount = asyncHandler(async (req, res) => {
        const collection = Contributor.getcollection();
        const filter = {
            status: { $in: [1, '1', 'approved'] }
        };
        const count = await collection.countDocuments(filter);
        return ApiResponse.success(res, 200, 'Approved count fetched', { count });
    });

    /**
     * GET /approved-not-live
     * Returns paginated list of contributions that are approved (status 1) but not yet live.
     */
    static getApprovedNotLiveList = asyncHandler(async (req, res) => {
        const { page = 1, limit = 20, search } = req.query;
        const pageNumber = Math.max(1, Number(page));
        const limitNumber = Math.min(100, Math.max(1, Number(limit)));
        const skip = (pageNumber - 1) * limitNumber;

        const filter = {
            status: { $in: [1, '1', 'approved'] }
        };

        if (search) {
            const regex = { $regex: search, $options: 'i' };
            filter.$and = [
                { $or: filter.$or },
                {
                    $or: [
                        { 'basicInfo.name': regex },
                        { 'basicInfo.description': regex },
                        { 'address.city': regex },
                        { 'address.area': regex },
                        { category: regex }
                    ]
                }
            ];
            delete filter.$or;
        }

        const collection = Contributor.getcollection();
        const [total, data] = await Promise.all([
            collection.countDocuments(filter),
            collection.find(filter).sort({ created_at: -1 }).skip(skip).limit(limitNumber).toArray()
        ]);

        return ApiResponse.paginated(res, data, pageNumber, limitNumber, total, 'Approved not-live contributions fetched');
    });

    /**
     * GET /approved-live/count
     * Returns count of contributions that are approved (status 1) and already live (isLive == true).
     */
    static getApprovedLiveCount = asyncHandler(async (req, res) => {
        const collection = Contributor.getcollection();
        const filter = {
            status: { $in: [1, '1', 'approved'] },
            isLive: true
        };
        const count = await collection.countDocuments(filter);
        return ApiResponse.success(res, 200, 'Approved live count fetched', { count });
    });

    /**
     * GET /approved-live
     * Returns paginated list of contributions that are approved (status 1) and already live.
     */
    static getApprovedLiveList = asyncHandler(async (req, res) => {
        const { page = 1, limit = 20, search } = req.query;
        const pageNumber = Math.max(1, Number(page));
        const limitNumber = Math.min(100, Math.max(1, Number(limit)));
        const skip = (pageNumber - 1) * limitNumber;

        const filter = {
            status: { $in: [1, '1', 'approved'] },
            isLive: true
        };

        if (search) {
            const regex = { $regex: search, $options: 'i' };
            filter.$and = [
                { isLive: true },
                {
                    $or: [
                        { 'basicInfo.name': regex },
                        { 'basicInfo.description': regex },
                        { 'address.city': regex },
                        { 'address.area': regex },
                        { category: regex }
                    ]
                }
            ];
            delete filter.isLive;
        }

        const collection = Contributor.getcollection();
        const [total, data] = await Promise.all([
            collection.countDocuments(filter),
            collection.find(filter).sort({ liveUpdateAt: -1, created_at: -1 }).skip(skip).limit(limitNumber).toArray()
        ]);

        return ApiResponse.paginated(res, data, pageNumber, limitNumber, total, 'Approved live contributions fetched');
    });

    // ── Contribution Support (chat threads) ───────────────────────────────────

    /**
     * GET /support
     * Returns one thread entry per contribution that has at least one comment,
     * with the contribution name (from contributors collection) and last message info.
     */
    static getSupportThreads = asyncHandler(async (req, res) => {
        const db = require('../../config/database').getDb();
        const commentsCol = db.collection('poi_contribution_comments');

        // Aggregate: latest message info + unread user messages per contributionId
        const threads = await commentsCol.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$contributionId',
                    last_message: { $first: '$text' },
                    last_message_time: { $first: '$createdAt' },
                    // Count user messages not yet read by admin
                    unread_count: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ['$type', 'admin'] },
                                        { $ne: ['$readByAdmin', true] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            { $sort: { last_message_time: -1 } },
        ]).toArray();

        // Fetch contribution names in one query
        const ids = threads.map((t) => t._id).filter(Boolean);
        const contributions = await Contributor.getcollection()
            .find({ _id: { $in: ids } }, { projection: { _id: 1, 'basicInfo.name': 1 } })
            .toArray();

        const nameMap = {};
        contributions.forEach((c) => {
            nameMap[c._id.toString()] = c.basicInfo?.name || null;
        });

        const data = threads.map((t) => ({
            contribution_id: t._id.toString(),
            contribution_name: nameMap[t._id.toString()] || t._id.toString(),
            last_message: t.last_message || '',
            last_message_time: t.last_message_time ? t.last_message_time.toISOString() : new Date().toISOString(),
            unread_count: t.unread_count || 0,
        }));

        return ApiResponse.success(res, 200, 'Support threads fetched successfully.', data);
    });

    /**
     * GET /support/:contributionId/messages
     * Returns all messages for a contribution thread in a normalized chat format
     * sorted oldest-first for natural chat rendering.
     */
    static getSupportMessages = asyncHandler(async (req, res) => {
        const { contributionId } = req.params;

        if (!Contributor.isValidId(contributionId)) {
            return ApiResponse.error(res, 400, 'Invalid contribution ID.', 'INVALID_ID');
        }

        const { comments } = await PoiComment.findByContributionId(contributionId, { page: 1, limit: 500 });

        // Reverse to oldest-first
        const data = comments.reverse().map((c) => ({
            id: c._id.toString(),
            contribution_id: contributionId,
            sender_type: c.type === 'admin' ? 'admin' : 'user',
            sender_name: c.userName || (c.type === 'admin' ? 'Admin' : 'User'),
            message: c.text,
            created_at: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        }));

        return ApiResponse.success(res, 200, 'Messages fetched successfully.', data);
    });

    /**
     * POST /support/:contributionId/messages
     * Adds an admin message to a contribution thread.
     * Body: { message: string, sender_type?: 'admin' }
     */
    static addSupportMessage = asyncHandler(async (req, res) => {
        const { contributionId } = req.params;
        const { message } = req.body;

        if (!Contributor.isValidId(contributionId)) {
            return ApiResponse.error(res, 400, 'Invalid contribution ID.', 'INVALID_ID');
        }

        if (!message || !String(message).trim()) {
            return ApiResponse.error(res, 400, 'message is required.', 'VALIDATION_ERROR');
        }

        const contribution = await Contributor.getcollection().findOne({
            _id: Contributor.toObjectId(contributionId)
        });

        if (!contribution) {
            return ApiResponse.error(res, 404, 'Contribution not found.', 'NOT_FOUND');
        }

        const comment = await PoiComment.create({
            contributionId: Contributor.toObjectId(contributionId),
            userId: null,
            userName: 'Admin',
            type: 'admin',
            text: String(message).trim(),
            createdAt: new Date(),
        });

        const data = {
            id: comment._id.toString(),
            contribution_id: contributionId,
            poi_name: contribution.basicInfo?.name || null,
            sender_type: 'admin',
            sender_name: 'Admin',
            message: comment.text,
            created_at: comment.createdAt.toISOString(),
        };

        // Push live message to the contribution owner over Socket.IO (best-effort)
        if (contribution.user_id) {
            try {
                socketManager.emitToUser(String(contribution.user_id), 'support_message', data);
            } catch (err) {
                logger.warn('[ContributionsController] Socket emit failed (non-fatal)', { error: err.message });
            }
        }

        return ApiResponse.created(res, 'Message sent successfully.', data);
    });

    /**
     * POST /support/:contributionId/read
     * Mark all user messages in a thread as read by admin.
     */
    static markMessagesRead = asyncHandler(async (req, res) => {
        const { contributionId } = req.params;

        if (!Contributor.isValidId(contributionId)) {
            return ApiResponse.error(res, 400, 'Invalid contribution ID.', 'INVALID_ID');
        }

        const modified = await PoiComment.markAdminRead(contributionId);
        return ApiResponse.success(res, 200, 'Messages marked as read.', { marked: modified });
    });

    // ── Existing comment endpoints ─────────────────────────────────────────────

    static addComment = asyncHandler(async (req, res) => {
        const { contributionId } = req.params;
        const { text } = req.body;

        if (!Contributor.isValidId(contributionId)) {
            return ApiResponse.error(res, 400, 'Invalid contribution ID.', 'INVALID_ID');
        }

        const contribution = await Contributor.getcollection().findOne({
            _id: Contributor.toObjectId(contributionId)
        });

        if (!contribution) {
            return ApiResponse.error(res, 404, 'Contribution not found.', 'NOT_FOUND');
        }

        const comment = await PoiComment.create({
            contributionId: Contributor.toObjectId(contributionId),
            userId: null,
            userName: 'Admin',
            type: 'admin',
            text: String(text).trim(),
            createdAt: new Date()
        });

        return ApiResponse.created(res, 'Comment added successfully.', comment);
    });

    static getContributionById = asyncHandler(async (req, res) => {
        const { contributionId } = req.params;

        if (!Contributor.isValidId(contributionId)) {
            return ApiResponse.error(res, 400, 'Invalid contribution ID.', 'INVALID_ID');
        }

        const collection = Contributor.getcollection();
        const contribution = await collection.findOne({ _id: Contributor.toObjectId(contributionId) });

        if (!contribution) {
            return ApiResponse.error(res, 404, 'Contribution not found.', 'NOT_FOUND');
        }

        return ApiResponse.success(res, 200, 'Contribution fetched successfully.', contribution);
    });

    static getComments = asyncHandler(async (req, res) => {
        const { contributionId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

        if (!Contributor.isValidId(contributionId)) {
            return ApiResponse.error(res, 400, 'Invalid contribution ID.', 'INVALID_ID');
        }

        const { comments, total } = await PoiComment.findByContributionId(contributionId, { page, limit });

        return ApiResponse.paginated(res, comments, page, limit, total, 'Comments fetched successfully.');
    });

    /**
     * GET /insights
     * Returns comprehensive contribution insights for the admin dashboard.
     *
     * Query params:
     *   - dateRange: 'today' | 'week' | 'month' | 'custom' (default: 'month')
     *   - startDate: epoch ms (required if dateRange=custom)
     *   - endDate: epoch ms (required if dateRange=custom)
     *   - category: filter by contribution category
     *   - status: filter by status (0=pending, 1=approved, 2=rejected)
     *   - region: filter by address.state
     *   - contributionType: filter by action type
     *   - contributor: filter by user_id
     */
    static getContributionInsights = asyncHandler(async (req, res) => {
        const {
            dateRange = 'month',
            startDate,
            endDate,
            category,
            status,
            region,
            contributionType,
            contributor
        } = req.query;

        const now = moment();
        let rangeStart, rangeEnd, prevRangeStart, prevRangeEnd;

        switch (dateRange) {
            case 'today':
                rangeStart = moment(now).startOf('day').valueOf();
                rangeEnd = now.valueOf();
                prevRangeStart = moment(now).subtract(1, 'day').startOf('day').valueOf();
                prevRangeEnd = moment(now).subtract(1, 'day').endOf('day').valueOf();
                break;
            case 'week':
                rangeStart = moment(now).startOf('isoWeek').valueOf();
                rangeEnd = now.valueOf();
                prevRangeStart = moment(now).subtract(1, 'week').startOf('isoWeek').valueOf();
                prevRangeEnd = moment(now).subtract(1, 'week').endOf('isoWeek').valueOf();
                break;
            case 'custom':
                if (!startDate || !endDate) {
                    return ApiResponse.error(res, 400, 'startDate and endDate are required for custom date range');
                }
                rangeStart = Number(startDate);
                rangeEnd = Number(endDate);
                const duration = rangeEnd - rangeStart;
                prevRangeStart = rangeStart - duration;
                prevRangeEnd = rangeStart;
                break;
            case 'month':
            default:
                rangeStart = moment(now).startOf('month').valueOf();
                rangeEnd = now.valueOf();
                prevRangeStart = moment(now).subtract(1, 'month').startOf('month').valueOf();
                prevRangeEnd = moment(now).subtract(1, 'month').endOf('month').valueOf();
                break;
        }

        const baseQuery = {};
        if (category) baseQuery.category = category;
        if (status !== undefined && status !== null && status !== '') {
            baseQuery.status = Number(status);
        }
        if (region) baseQuery['address.state'] = { $regex: region, $options: 'i' };
        if (contributionType) baseQuery.action = contributionType;
        if (contributor) {
            baseQuery.user_id = Contributor.isValidId(contributor)
                ? Contributor.toObjectId(contributor)
                : contributor;
        }

        const currentQuery = { ...baseQuery, created_at: { $gte: rangeStart, $lte: rangeEnd } };
        const previousQuery = { ...baseQuery, created_at: { $gte: prevRangeStart, $lte: prevRangeEnd } };

        const collection = Contributor.getcollection();

        const [
            currentRows,
            previousRows,
            allTimeRows,
            dailyTrend,
            categoryDistribution,
            hourlyDistribution,
            geoDistribution,
            cityDistribution,
            contributorStats,
            newContributorsThisWeek,
            newContributorsThisMonth,
            geoCoordinates
        ] = await Promise.all([
            // Current period rows
            collection.find(currentQuery).toArray(),
            // Previous period rows
            collection.find(previousQuery).toArray(),
            // All time (with base filters, no date range) for overall stats
            collection.find(baseQuery).toArray(),
            // Daily trend for current period
            collection.aggregate([
                { $match: { ...baseQuery, created_at: { $gte: rangeStart, $lte: rangeEnd } } },
                {
                    $group: {
                        _id: {
                            year: { $year: { $toDate: '$created_at' } },
                            month: { $month: { $toDate: '$created_at' } },
                            day: { $dayOfMonth: { $toDate: '$created_at' } }
                        },
                        total: { $sum: 1 },
                        approved: { $sum: { $cond: [{ $in: ['$status', [1, '1', 'approved']] }, 1, 0] } },
                        rejected: { $sum: { $cond: [{ $in: ['$status', [2, '2', 'rejected']] }, 1, 0] } },
                        pending: { $sum: { $cond: [{ $in: ['$status', [0, '0', 'pending']] }, 1, 0] } }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
            ]).toArray(),
            // Category distribution
            collection.aggregate([
                { $match: currentQuery },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]).toArray(),
            // Hourly distribution (peak hours)
            collection.aggregate([
                { $match: currentQuery },
                {
                    $group: {
                        _id: { $hour: { $toDate: '$created_at' } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]).toArray(),
            // Geographic distribution by state
            collection.aggregate([
                { $match: currentQuery },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$address.state', ''] } } } }, 0] },
                                { $trim: { input: '$address.state' } },
                                'Unknown'
                            ]
                        },
                        total: { $sum: 1 },
                        approved: { $sum: { $cond: [{ $in: ['$status', [1, '1', 'approved']] }, 1, 0] } },
                        pending: { $sum: { $cond: [{ $in: ['$status', [0, '0', 'pending']] }, 1, 0] } },
                        rejected: { $sum: { $cond: [{ $in: ['$status', [2, '2', 'rejected']] }, 1, 0] } }
                    }
                },
                { $sort: { total: -1 } }
            ]).toArray(),
            // City distribution
            collection.aggregate([
                { $match: currentQuery },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$address.district', ''] } } } }, 0] },
                                { $trim: { input: '$address.district' } },
                                'Unknown'
                            ]
                        },
                        total: { $sum: 1 },
                        approved: { $sum: { $cond: [{ $in: ['$status', [1, '1', 'approved']] }, 1, 0] } },
                        pending: { $sum: { $cond: [{ $in: ['$status', [0, '0', 'pending']] }, 1, 0] } },
                        rejected: { $sum: { $cond: [{ $in: ['$status', [2, '2', 'rejected']] }, 1, 0] } }
                    }
                },
                { $sort: { total: -1 } }
            ]).toArray(),
            // Contributor stats (unique contributors)
            collection.aggregate([
                { $match: currentQuery },
                {
                    $group: {
                        _id: '$user_id',
                        contributions: { $sum: 1 },
                        name: { $first: '$name' }
                    }
                },
                { $sort: { contributions: -1 } }
            ]).toArray(),
            // New contributors this week
            collection.aggregate([
                { $match: baseQuery },
                { $sort: { created_at: 1 } },
                { $group: { _id: '$user_id', firstContribution: { $first: '$created_at' } } },
                { $match: { firstContribution: { $gte: moment(now).startOf('isoWeek').valueOf() } } },
                { $count: 'count' }
            ]).toArray(),
            // New contributors this month
            collection.aggregate([
                { $match: baseQuery },
                { $sort: { created_at: 1 } },
                { $group: { _id: '$user_id', firstContribution: { $first: '$created_at' } } },
                { $match: { firstContribution: { $gte: moment(now).startOf('month').valueOf() } } },
                { $count: 'count' }
            ]).toArray(),
            // Geographic coordinates for heatmap (limit 2000)
            collection.aggregate([
                { $match: { ...currentQuery, 'location.coordinates': { $exists: true } } },
                { $project: { _id: 0, coordinates: '$location.coordinates', status: 1, category: 1 } },
                { $limit: 2000 }
            ]).toArray()
        ]);

        // ── KPI Cards ────────────────────────────────────────────
        const currentTotal = currentRows.length;
        const previousTotal = previousRows.length;
        const currentApproved = currentRows.filter(r => [1, '1', 'approved'].includes(r.status)).length;
        const currentRejected = currentRows.filter(r => [2, '2', 'rejected'].includes(r.status)).length;
        const currentPending = currentRows.filter(r => [0, '0', 'pending'].includes(r.status)).length;
        const previousApproved = previousRows.filter(r => [1, '1', 'approved'].includes(r.status)).length;
        const previousRejected = previousRows.filter(r => [2, '2', 'rejected'].includes(r.status)).length;
        const previousPending = previousRows.filter(r => [0, '0', 'pending'].includes(r.status)).length;

        const allTimeTotal = allTimeRows.length;
        const allTimeApproved = allTimeRows.filter(r => [1, '1', 'approved'].includes(r.status)).length;
        const allTimeRejected = allTimeRows.filter(r => [2, '2', 'rejected'].includes(r.status)).length;
        const allTimePending = allTimeRows.filter(r => [0, '0', 'pending'].includes(r.status)).length;

        const activeContributors = new Set(currentRows.map(r => String(r.user_id)).filter(Boolean)).size;
        const prevActiveContributors = new Set(previousRows.map(r => String(r.user_id)).filter(Boolean)).size;

        const approvalRate = currentTotal > 0 ? Number(((currentApproved / currentTotal) * 100).toFixed(1)) : 0;
        const prevApprovalRate = previousTotal > 0 ? Number(((previousApproved / previousTotal) * 100).toFixed(1)) : 0;

        // Average review time (current period, in hours)
        const reviewedCurrent = currentRows.filter(r => r.approved_at && r.created_at && r.approved_at >= r.created_at);
        const avgReviewTimeHours = reviewedCurrent.length > 0
            ? Number((reviewedCurrent.reduce((sum, r) => sum + (r.approved_at - r.created_at), 0) / reviewedCurrent.length / (1000 * 60 * 60)).toFixed(1))
            : 0;
        const reviewedPrev = previousRows.filter(r => r.approved_at && r.created_at && r.approved_at >= r.created_at);
        const prevAvgReviewTimeHours = reviewedPrev.length > 0
            ? Number((reviewedPrev.reduce((sum, r) => sum + (r.approved_at - r.created_at), 0) / reviewedPrev.length / (1000 * 60 * 60)).toFixed(1))
            : 0;

        const growthPercent = previousTotal > 0
            ? Number((((currentTotal - previousTotal) / previousTotal) * 100).toFixed(1))
            : currentTotal > 0 ? 100 : 0;

        const kpiCards = {
            totalContributions: { value: allTimeTotal, current: currentTotal, previous: previousTotal, trend: currentTotal >= previousTotal ? 'up' : 'down' },
            activeContributors: { value: activeContributors, previous: prevActiveContributors, trend: activeContributors >= prevActiveContributors ? 'up' : 'down' },
            newContributorsWeek: { value: newContributorsThisWeek[0]?.count || 0 },
            newContributorsMonth: { value: newContributorsThisMonth[0]?.count || 0 },
            approved: { value: allTimeApproved, current: currentApproved, previous: previousApproved, trend: currentApproved >= previousApproved ? 'up' : 'down' },
            rejected: { value: allTimeRejected, current: currentRejected, previous: previousRejected, trend: currentRejected >= previousRejected ? 'up' : 'down' },
            pending: { value: allTimePending, current: currentPending, previous: previousPending, trend: currentPending >= previousPending ? 'up' : 'down' },
            approvalRate: { value: approvalRate, previous: prevApprovalRate, trend: approvalRate >= prevApprovalRate ? 'up' : 'down' },
            avgReviewTime: { value: avgReviewTimeHours, previous: prevAvgReviewTimeHours, unit: 'hours', trend: avgReviewTimeHours <= prevAvgReviewTimeHours ? 'up' : 'down' },
            growthPercent: { value: growthPercent, trend: growthPercent >= 0 ? 'up' : 'down' }
        };

        // ── Volume Insights ──────────────────────────────────────
        const dailyTrendFormatted = dailyTrend.map(d => ({
            date: `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`,
            total: d.total,
            approved: d.approved,
            rejected: d.rejected,
            pending: d.pending
        }));

        const categoryDist = categoryDistribution.map(c => ({
            category: c._id || 'Unknown',
            count: c.count
        }));

        const hourlyDist = hourlyDistribution.map(h => ({
            hour: h._id,
            count: h.count
        }));

        const peakHour = hourlyDist.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, count: 0 });

        // ── Geographic Insights ──────────────────────────────────
        const regionRanking = geoDistribution.map(r => ({
            region: r._id,
            total: r.total,
            approved: r.approved,
            pending: r.pending,
            rejected: r.rejected
        }));

        const cityRanking = cityDistribution.map(c => ({
            city: c._id,
            total: c.total,
            approved: c.approved,
            pending: c.pending,
            rejected: c.rejected
        }));

        const heatmapPoints = geoCoordinates
            .filter(g => Array.isArray(g.coordinates) && g.coordinates.length === 2)
            .map(g => ({
                lat: g.coordinates[1],
                lng: g.coordinates[0],
                status: g.status,
                category: g.category
            }));

        const topContributors = contributorStats.slice(0, 10).map((c, i) => ({
            rank: i + 1,
            userId: c._id ? String(c._id) : null,
            name: c.name || 'Unknown',
            contributions: c.contributions
        }));

        return ApiResponse.success(res, 200, 'Contribution insights fetched', {
            dateRange: { type: dateRange, start: rangeStart, end: rangeEnd, prevStart: prevRangeStart, prevEnd: prevRangeEnd },
            kpiCards,
            volumeInsights: {
                dailyTrend: dailyTrendFormatted,
                categoryDistribution: categoryDist,
                hourlyDistribution: hourlyDist,
                peakHour: { hour: peakHour.hour, count: peakHour.count },
                growthPercent
            },
            geographicInsights: {
                regionRanking,
                cityRanking,
                heatmapPoints,
                highestContributionRegion: regionRanking[0] || null,
                mostPendingRegion: [...regionRanking].sort((a, b) => b.pending - a.pending)[0] || null,
                lowestContributionRegions: regionRanking.slice(-3).reverse()
            },
            topContributors
        });
    });
}

module.exports = ContributionsController;