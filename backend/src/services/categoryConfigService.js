'use strict';

const logger = require('../../logs_/logger');
const CategoryConfig = require('../models/CategoryConfig');
const defaultCategories = require('../categories/defaultCategories.json');

const ALLOWED_FIELD_TYPES = new Set(['text', 'boolean', 'number']);

let categoryMap = new Map();
let initialized = false;

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
}

function sanitizeField(field = {}) {
    const type = String(field.type || '').trim().toLowerCase();

    if (!ALLOWED_FIELD_TYPES.has(type)) {
        throw new Error(`Invalid field type: \"${field.type}\". Allowed: text, boolean, number`);
    }

    const label = String(field.label || '').trim();
    const key = String(field.field || '').trim();

    if (!label) {
        throw new Error('Each field requires a non-empty label');
    }

    if (!key) {
        throw new Error('Each field requires a non-empty field key');
    }

    const osmTag = String(field.osmTag || key).trim();

    return {
        label,
        field: key,
        type,
        osmTag,
        required: Boolean(field.required)
    };
}

function sanitizeCategory(payload = {}) {
    const category = normalizeKey(payload.category);
    const label = String(payload.label || '').trim();
    const primaryTagKey = String(payload.primaryTag?.key || '').trim();
    const primaryTagValue = String(payload.primaryTag?.value || '').trim();

    if (!category || !/^[a-z0-9_-]+$/.test(category)) {
        throw new Error('category must contain only lowercase letters, numbers, underscore, or hyphen');
    }

    if (!label) {
        throw new Error('label is required');
    }

    if (!primaryTagKey || !primaryTagValue) {
        throw new Error('primaryTag.key and primaryTag.value are required');
    }

    const sourceFields = Array.isArray(payload.fields) ? payload.fields : [];
    const fields = sourceFields.map(sanitizeField);

    return {
        category,
        label,
        primaryTag: {
            key: primaryTagKey,
            value: primaryTagValue
        },
        fields,
        isActive: payload.isActive !== false
    };
}

function toConfig(document = {}) {
    return {
        category: document.category,
        label: document.label,
        primaryTag: document.primaryTag,
        fields: Array.isArray(document.fields) ? document.fields : [],
        isActive: document.isActive !== false
    };
}

function toListCategory(document = {}, includeFields = true) {
    const payload = {
        category: document.category,
        label: document.label
    };

    if (includeFields) {
        payload.fields = Array.isArray(document.fields) ? document.fields : [];
    }

    return payload;
}

async function syncCache() {
    const categories = await CategoryConfig.findAll();
    const next = new Map();

    for (const category of categories) {
        next.set(category.category, category);
    }

    categoryMap = next;
    initialized = true;

    return categories;
}

class CategoryConfigService {
    static async initializeDefaults() {
        await CategoryConfig.ensureIndexes();

        const count = await CategoryConfig.countDocuments();
        if (count > 0) {
            await syncCache();
            return { seeded: false, count };
        }

        const now = new Date();
        const docs = defaultCategories.map((category) => {
            const normalized = sanitizeCategory(category);
            return {
                ...normalized,
                createdAt: now,
                updatedAt: now,
                seeded: true
            };
        });

        await CategoryConfig.insertMany(docs);
        await syncCache();

        logger.system('Seeded default admin categories', {
            count: docs.length,
            categories: docs.map((doc) => doc.category)
        });

        return { seeded: true, count: docs.length };
    }

    static async listCategories({ search = '', includeFields = true } = {}) {
        if (!initialized) {
            await syncCache();
        }

        const term = String(search || '').trim().toLowerCase();
        let categories = Array.from(categoryMap.values());

        if (term) {
            categories = categories.filter(
                (item) =>
                    String(item.label || '').toLowerCase().includes(term) ||
                    String(item.category || '').toLowerCase().includes(term)
            );
        }

        return categories
            .filter((item) => item.isActive !== false)
            .map((item) => toListCategory(item, includeFields));
    }

    static async getCategory(categoryKey) {
        if (!initialized) {
            await syncCache();
        }

        const key = normalizeKey(categoryKey);
        const found = categoryMap.get(key);
        if (!found || found.isActive === false) {
            return null;
        }
        return toConfig(found);
    }

    static async getAllCategoryConfigs() {
        if (!initialized) {
            await syncCache();
        }

        return Array.from(categoryMap.values())
            .filter((item) => item.isActive !== false)
            .map((item) => toConfig(item));
    }

    static async createCategory(payload = {}) {
        const normalized = sanitizeCategory(payload);
        const existing = await CategoryConfig.findByCategory(normalized.category);

        if (existing) {
            throw new Error(`Category \"${normalized.category}\" already exists`);
        }

        const now = new Date();
        await CategoryConfig.create({
            ...normalized,
            createdAt: now,
            updatedAt: now,
            seeded: false
        });

        await syncCache();
        return this.getCategory(normalized.category);
    }

    static async updateCategory(categoryKey, payload = {}) {
        const key = normalizeKey(categoryKey);
        const existing = await CategoryConfig.findByCategory(key);

        if (!existing) {
            return null;
        }

        const merged = {
            ...existing,
            ...payload,
            category: key,
            primaryTag: payload.primaryTag || existing.primaryTag,
            fields: payload.fields || existing.fields,
            isActive: payload.isActive === undefined ? existing.isActive : payload.isActive
        };

        const normalized = sanitizeCategory(merged);
        const updated = {
            ...normalized,
            updatedAt: new Date(),
            seeded: existing.seeded === true
        };

        await CategoryConfig.updateByCategory(key, updated);
        await syncCache();

        return this.getCategory(key);
    }
}

module.exports = CategoryConfigService;
