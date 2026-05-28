'use strict';

const Joi = require('joi');

const VALID_SERVICES = ['search', 'routing', 'tile'];

const copyFromSchema = Joi.object({
    sourceServerId: Joi.string().required(),
    sourceFilePath: Joi.string().trim().min(1).max(500).required(),
});

const contributionConfigSchema = Joi.object({
    apiEndpoint: Joi.string().uri().required(),
    gtfsIncluded: Joi.boolean().required(),
    gtfsServerId: Joi.string().when('gtfsIncluded', { is: true, then: Joi.required(), otherwise: Joi.optional().allow(null, '') }),
    gtfsFilePath: Joi.string().trim().min(1).max(500).when('gtfsIncluded', { is: true, then: Joi.required(), otherwise: Joi.optional().allow(null, '') }),
});

const routingGtfsConfigSchema = Joi.object({
    gtfsFilePath: Joi.string().trim().min(1).max(500).required(),
});

const serviceConfigSchema = Joi.object({
    service: Joi.string().valid(...VALID_SERVICES).required(),
    targetServerId: Joi.string().required(),
    copyFrom: copyFromSchema.optional().allow(null),
    contributionConfig: contributionConfigSchema.optional().allow(null),
    routingGtfsConfig: routingGtfsConfigSchema.optional().allow(null),
});

const createGenerationSchema = Joi.object({
    services: Joi.array()
        .items(serviceConfigSchema)
        .min(1)
        .max(3)
        .unique('service')
        .required(),
});

const getGenerationsSchema = Joi.object({
    status: Joi.string()
        .valid('generating', 'generation_completed', 'staging', 'production', 'failed')
        .optional(),
    page: Joi.number().integer().min(1).default(1).optional(),
    limit: Joi.number().integer().min(1).max(100).default(20).optional(),
});

const transitionSchema = Joi.object({
    status: Joi.string()
        .valid('generating', 'generation_completed', 'staging', 'production', 'failed')
        .required(),
    serverId: Joi.string().when('status', {
        is: Joi.valid('staging', 'production'),
        then: Joi.required(),
        otherwise: Joi.optional().allow(null, ''),
    }),
    note: Joi.string().trim().max(500).optional().allow(''),
});

module.exports = {
    createGenerationSchema,
    getGenerationsSchema,
    transitionSchema,
};
