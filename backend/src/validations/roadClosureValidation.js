'use strict';

const Joi = require('joi');

const coordinateSchema = Joi.array()
    .length(2)
    .items(
        Joi.number().min(-180).max(180).required(), // lng
        Joi.number().min(-90).max(90).required()    // lat
    );

const geoJSONSchema = Joi.object({
    type: Joi.string()
        .valid('Point', 'LineString', 'Polygon')
        .required(),

    coordinates: Joi.alternatives().conditional('type', [
        {
            is: 'Point',
            then: coordinateSchema
        },
        {
            is: 'LineString',
            then: Joi.array()
                .min(2)
                .items(coordinateSchema)
        },
        {
            is: 'Polygon',
            then: Joi.array()
                .min(1)
                .items(
                    Joi.array()
                        .min(4) // closed ring (min 4 points)
                        .items(coordinateSchema)
                )
        }
    ])
})
.custom((value, helpers) => {
    // 🔥 Ensure polygon is closed
    if (value.type === 'Polygon') {
        const ring = value.coordinates[0];
        if (ring && ring.length >= 4) {
            const first = ring[0];
            const last = ring[ring.length - 1];

            if (JSON.stringify(first) !== JSON.stringify(last)) {
                return helpers.error('any.invalid', {
                    message: 'Polygon must be closed (first and last coordinate must match)'
                });
            }
        }
    }
    return value;
}, 'GeoJSON Validation');


const createClosureSchema = {
    body: Joi.object({

        title: Joi.string()
            .trim()
            .min(3)
            .max(150)
            .required(),

        description: Joi.string()
            .trim()
            .max(1000)
            .allow('', null),

        reason: Joi.string()
            .valid('construction', 'accident', 'event', 'maintenance', 'other')
            .required(),

        impactLevel: Joi.string()
            .valid('low', 'medium', 'high')
            .required(),

        city: Joi.string()
            .trim()
            .required(),

        area: Joi.string()
            .trim()
            .allow('', null),

        startDate: Joi.number().required(),

        endDate: Joi.number()
            .greater(Joi.ref('startDate'))
            .required(),

        startTime: Joi.string().allow('', null),
        endTime: Joi.string().allow('', null),

        affectedLanes: Joi.string()
            .valid('single', 'double', 'multi', 'full')
            .required(),

        detourInfo: Joi.string()
            .max(500)
            .allow('', null),

        notifyUsers: Joi.boolean().default(false),

        source: Joi.string()
            .valid('admin', 'user', 'system')
            .default('admin'),

        geometry: geoJSONSchema.required()

    })
};

const updateClosureSchema = {
    body: Joi.object({

        id: Joi.string().required(),

        title: Joi.string().trim().min(3).max(150),

        description: Joi.string().trim().max(1000).allow('', null),

        reason: Joi.string()
            .valid('construction', 'accident', 'event', 'maintenance', 'other'),

        impactLevel: Joi.string()
            .valid('low', 'medium', 'high'),

        city: Joi.string().trim(),

        area: Joi.string().trim().allow('', null),

        startDate: Joi.number(),

        endDate: Joi.number(),

        startTime: Joi.string().allow('', null),
        endTime: Joi.string().allow('', null),

        affectedLanes: Joi.string()
            .valid('single', 'double', 'multi', 'full'),

        detourInfo: Joi.string().max(500).allow('', null),

        notifyUsers: Joi.boolean(),

        source: Joi.string()
            .valid('admin', 'user', 'system'),

        geometry: geoJSONSchema

    })
};

const updateClosureStatusSchema = {
    body: Joi.object({

        id: Joi.string().required(),

        status: Joi.number()
            .valid(0, 1, 2, 3, 4) // pending, approved, rejected, live, expired
            .required()

    })
};

const listClosureSchema = {
    query: Joi.object({

        page: Joi.number().min(1).default(1),

        limit: Joi.number().min(1).max(100).default(20),

        search: Joi.string().allow('', null),

        city: Joi.string().allow('', null),
        area: Joi.string().allow('', null),

        status: Joi.number().valid(0, 1, 2, 3, 4),

        source: Joi.string().valid('admin', 'user', 'system'),

        impactLevel: Joi.string().valid('low', 'medium', 'high'),

        reason: Joi.string().valid('construction', 'accident', 'event', 'maintenance', 'other'),

        sortBy: Joi.string().default('created_at'),

        sortOrder: Joi.string()
            .valid('asc', 'desc')
            .default('desc')

    })
};

module.exports = {
    createClosureSchema,
    updateClosureSchema,
    updateClosureStatusSchema,
    listClosureSchema
};