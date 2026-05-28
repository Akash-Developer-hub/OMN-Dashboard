'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const HomeScreenConfig = require('../../models/HomeScreenConfig');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

const CONFIG_ID = 'home_v12';

/**
 * GET /api/v1/admin-dashboard/home-screen-config
 * Returns the current home screen config document.
 */
router.get('/', asyncHandler(async (_req, res) => {
    const config = await HomeScreenConfig.findByConfigId(CONFIG_ID);
    if (!config) {
        return ApiResponse.error(res, 404, 'Home screen config not found.');
    }
    return ApiResponse.success(res, 200, 'Home screen config fetched successfully.', config);
}));

/**
 * PUT /api/v1/admin-dashboard/home-screen-config
 * Full replace — saves the entire sections array.
 * Body: { sections: Array<{ id, show, order, data }> }
 */
router.put('/', asyncHandler(async (req, res) => {
    const { sections } = req.body;

    if (!Array.isArray(sections)) {
        return ApiResponse.error(res, 400, 'sections must be an array.');
    }

    const existing = await HomeScreenConfig.findByConfigId(CONFIG_ID);
    const now = new Date();

    const doc = {
        ...(existing || {}),
        configId: CONFIG_ID,
        schemaVersion: existing?.schemaVersion ?? 1,
        sections,
        updatedAt: now,
        ...(existing ? {} : { createdAt: now }),
    };

    // Remove _id so findOneAndReplace works cleanly
    delete doc._id;

    const updated = await HomeScreenConfig.replaceByConfigId(CONFIG_ID, doc);
    return ApiResponse.success(res, 200, 'Home screen config saved successfully.', updated);
}));

/**
 * PATCH /api/v1/admin-dashboard/home-screen-config/section/:sectionId
 * Update a single section (show toggle or data fields).
 * Body: { show?: boolean, order?: number, data?: object }
 */
router.patch('/section/:sectionId', asyncHandler(async (req, res) => {
    const { sectionId } = req.params;
    const { show, order, data } = req.body;

    const config = await HomeScreenConfig.findByConfigId(CONFIG_ID);
    if (!config) {
        return ApiResponse.error(res, 404, 'Home screen config not found.');
    }

    const sections = (config.sections || []).map((s, idx) => {
        if (s.id !== sectionId) return s;
        return {
            ...s,
            ...(show !== undefined ? { show } : {}),
            ...(order !== undefined ? { order } : {}),
            ...(data !== undefined ? { data: { ...s.data, ...data } } : {}),
        };
    });

    const now = new Date();
    const doc = { ...config, sections, updatedAt: now };
    delete doc._id;

    const updated = await HomeScreenConfig.replaceByConfigId(CONFIG_ID, doc);
    return ApiResponse.success(res, 200, 'Section updated successfully.', updated);
}));

/**
 * POST /api/v1/admin-dashboard/home-screen-config/custom-component
 * Append a new custom component entry to the sections array.
 * Body: { show?: boolean, data: { component: object, action?: object } }
 */
router.post('/custom-component', asyncHandler(async (req, res) => {
    const { show = true, data } = req.body;

    if (!data || typeof data !== 'object') {
        return ApiResponse.error(res, 400, 'data is required and must be an object.');
    }

    if (!data.component || typeof data.component !== 'object') {
        return ApiResponse.error(res, 400, 'data.component is required and must be an object.');
    }

    const config = await HomeScreenConfig.findByConfigId(CONFIG_ID);
    if (!config) {
        return ApiResponse.error(res, 404, 'Home screen config not found.');
    }

    const newSection = {
        id: 'customComponent',
        instanceId: uuidv4(),
        show: Boolean(show),
        data
    };

    const sections = [...(config.sections || []), newSection];
    const now = new Date();
    const doc = { ...config, sections, updatedAt: now };
    delete doc._id;

    const updated = await HomeScreenConfig.replaceByConfigId(CONFIG_ID, doc);
    return ApiResponse.success(res, 201, 'Custom component added successfully.', updated);
}));

/**
 * DELETE /api/v1/admin-dashboard/home-screen-config/custom-component/:instanceId
 * Remove a specific customComponent section by its instanceId.
 */
router.delete('/custom-component/:instanceId', asyncHandler(async (req, res) => {
    const { instanceId } = req.params;

    const config = await HomeScreenConfig.findByConfigId(CONFIG_ID);
    if (!config) {
        return ApiResponse.error(res, 404, 'Home screen config not found.');
    }

    const originalLength = (config.sections || []).length;
    const sections = (config.sections || []).filter(
        (s) => !(s.id === 'customComponent' && s.instanceId === instanceId)
    );

    if (sections.length === originalLength) {
        return ApiResponse.error(res, 404, `Custom component with instanceId "${instanceId}" not found.`);
    }

    const now = new Date();
    const doc = { ...config, sections, updatedAt: now };
    delete doc._id;

    const updated = await HomeScreenConfig.replaceByConfigId(CONFIG_ID, doc);
    return ApiResponse.success(res, 200, 'Custom component deleted successfully.', updated);
}));

module.exports = router;
