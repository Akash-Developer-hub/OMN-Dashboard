'use strict';

const Joi = require('joi');

// ── Shared sub-schemas ────────────────────────────────────

const basicInfoSchema = Joi.object({
    name:        Joi.string().trim().required(),
    description: Joi.string().trim().allow('', null)
}).required();

const locationSchema = Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
}).required();

const addressSchema = Joi.object({
    houseNumber: Joi.alternatives().try(Joi.string(), Joi.number()).allow('', null),
    street:      Joi.string().allow('', null),
    area:        Joi.string().allow('', null),
    district:    Joi.string().allow('', null),
    city:        Joi.string().allow('', null),
    state:       Joi.string().allow('', null),
    pincode:     Joi.alternatives().try(Joi.string(), Joi.number()).allow('', null)
}).default({});

const contactSchema = Joi.object({
    phone: Joi.string().allow('', null),
    email: Joi.string().email({ tlds: { allow: false } }).allow('', null)
}).default({});

const mediaSchema = Joi.object({
    images:     Joi.array().items(Joi.string().trim()).default([]),
    logo:       Joi.string().allow('', null),
    coverPhoto: Joi.string().allow('', null)
}).default({});

const socialMediaSchema = Joi.object({
    website:   Joi.string().uri().allow('', null),
    facebook:  Joi.string().uri().allow('', null),
    instagram: Joi.string().uri().allow('', null),
    twitter:   Joi.string().uri().allow('', null)
}).default({});

const businessFlagsSchema = Joi.object({
    isBusinessPlace: Joi.boolean().default(false),
    isOwnBusiness:   Joi.boolean().default(false)
}).default({});

const ownerInfoSchema = Joi.object({
    name:     Joi.string().allow('', null),
    email:    Joi.string().email({ tlds: { allow: false } }).allow('', null),
    phone:    Joi.string().allow('', null),
    verified: Joi.boolean().default(false)
}).allow(null).default(null);

// ── Add contribution body schema ──────────────────────────

const addContributionBody = Joi.object({
    user_id:  Joi.string().trim().required(),
    action:   Joi.string().trim().default('create'),
    category: Joi.string().trim().required(),
    priority: Joi.string().trim().valid('low', 'medium', 'high').default('low'),

    basicInfo:     basicInfoSchema,
    location:      locationSchema,
    address:       addressSchema,
    contact:       contactSchema,
    media:         mediaSchema,
    socialMedia:   socialMediaSchema,
    businessFlags: businessFlagsSchema,
    ownerInfo:     ownerInfoSchema,
    // Free-form category-specific fields validated server-side via the category config
    extra: Joi.object().unknown(true).default({}),
    // Opening hours (OSM opening_hours format or free-form string)
    openingHours: Joi.string().trim().allow('', null).default(null),
    // Optional metadata
    osm_id:           Joi.alternatives().try(Joi.string(), Joi.number(), Joi.valid(null)).default(null),
    mapunit:          Joi.string().trim().allow('', null).default(null),
    fcm_token:        Joi.string().allow('', null).default(null),
    app_name:         Joi.string().allow('', null).default(null),
    geocoder_address: Joi.string().allow('', null).default(null),
    priority:         Joi.string().valid('low', 'medium', 'high').default('medium')
});

const updateContributionBody = addContributionBody.keys({
    id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    action: Joi.string().trim().default('update')
});

const approveContributionBody = Joi.object({
    id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    approved: Joi.boolean().truthy('1', 'true').falsy('0', 'false').default(true)
});

const listCategoriesQuery = Joi.object({
    search:      Joi.string().trim().max(100).allow('', null),
    includeFields: Joi.boolean().truthy('1', 'true').falsy('0', 'false').default(true)
});

const listContributionsQuery = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    category: Joi.string().trim(),
    activity: Joi.string().valid('all', 'active', 'inactive').default('all'),
    status: Joi.string().trim().allow('', null),
    search: Joi.string().trim().max(200).allow('', null),
    isCreatedBy: Joi.string().trim().allow('', null),
    priority: Joi.string().trim().valid('low', 'medium', 'high').allow(null),
    minPercentage: Joi.number().integer().min(0).max(100),
    maxPercentage: Joi.number().integer().min(0).max(100),
    trendDays: Joi.number().integer().min(1).max(365).default(7),
    sortBy: Joi.string().valid('created_at', 'updated_at', 'status', 'category').default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
}).custom((value, helpers) => {
    if (
        value.minPercentage !== undefined &&
        value.maxPercentage !== undefined &&
        value.minPercentage > value.maxPercentage
    ) {
        return helpers.error('any.invalid', {
            message: 'minPercentage cannot be greater than maxPercentage'
        });
    }

    return value;
});

const categoryFieldSchema = Joi.object({
    label: Joi.string().trim().required(),
    field: Joi.string().trim().required(),
    type: Joi.string().valid('text', 'boolean', 'number').required(),
    osmTag: Joi.string().trim().allow('', null),
    required: Joi.boolean().default(false)
});

const createCategoryBody = Joi.object({
    category: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).required(),
    label: Joi.string().trim().required(),
    primaryTag: Joi.object({
        key: Joi.string().trim().required(),
        value: Joi.string().trim().required()
    }).required(),
    fields: Joi.array().items(categoryFieldSchema).default([]),
    isActive: Joi.boolean().default(true)
});

const updateCategoryParams = Joi.object({
    category: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).required()
});

const updateCategoryBody = Joi.object({
    label: Joi.string().trim(),
    primaryTag: Joi.object({
        key: Joi.string().trim().required(),
        value: Joi.string().trim().required()
    }),
    fields: Joi.array().items(categoryFieldSchema),
    isActive: Joi.boolean()
}).min(1);
const statusUpdateContributionBody = Joi.object({
    id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    status: Joi.string().trim().required()
});
const getContributionAnalyticsBody = Joi.object({
    category: Joi.string().trim(),
    search: Joi.string().allow('', null).optional(),
    startDate: Joi.number().default(() => Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60), // Default to 30 days ago
    endDate: Joi.number().default(() => Math.floor(Date.now() / 1000)), // Default to now
});

const schemas = {
    addContribution: {
        body: addContributionBody
    },
    updateContribution: {
        body: updateContributionBody
    },
    approveContribution: {
        body: approveContributionBody
    },
    statusUpdateContribution:{
        body: statusUpdateContributionBody
    },
    listContributions: {
        query: listContributionsQuery
    },
    listCategories: {
        query: listCategoriesQuery
    },
    createCategory: {
        body: createCategoryBody
    },
    updateCategory: {
        params: updateCategoryParams,
        body: updateCategoryBody
    },
    getContributionAnalytics: {
        body: getContributionAnalyticsBody
    }
};

module.exports = { schemas };
