'use strict';

const CategoryFieldConfig = require('../../models/CategoryFieldConfig');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');

const BASE_CONFIG_ID = 'category_fields_v1';

const getConfigId = (langCode) => {
    if (langCode === 'ar') {
        return `${BASE_CONFIG_ID}_ar`;
    }
    return BASE_CONFIG_ID;
};

class CategoryConfigController {
    static getConfig = asyncHandler(async (req, res) => {
        const langCode = String(req.query.langCode || req.query.lang || 'en').toLowerCase();
        const configId = getConfigId(langCode);
        const config = await CategoryFieldConfig.findByConfigId(configId);
        if (!config) {
            return ApiResponse.success(res, 200, 'No category config found.', null);
        }
        const { _id, ...data } = config;
        return ApiResponse.success(res, 200, 'Category config fetched successfully.', data);
    });

    static updateConfig = asyncHandler(async (req, res) => {
        const langCode = String(req.query.langCode || req.query.lang || req.body.langCode || 'en').toLowerCase();
        const configId = getConfigId(langCode);
        const now = new Date();
        const document = {
            ...req.body,
            configId,
            langCode: langCode === 'ar' ? 'ar' : req.body.langCode,
            updatedAt: now,
        };
        const updated = await CategoryFieldConfig.replaceByConfigId(configId, document);
        const { _id, ...data } = updated;
        return ApiResponse.success(res, 200, 'Category config updated successfully.', data);
    });
}

module.exports = CategoryConfigController;
