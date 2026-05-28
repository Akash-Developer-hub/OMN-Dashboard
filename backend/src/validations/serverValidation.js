'use strict';

const Joi = require('joi');

const VALID_ENVIRONMENTS = ['development', 'staging', 'production'];

const createServerSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    environment: Joi.string().valid(...VALID_ENVIRONMENTS).required(),
    username: Joi.string().trim().max(50).allow('', null).optional(),
    port: Joi.string().trim().max(10).allow('', null).optional(),   
    ipAddress: Joi.string()
        .trim()
        .pattern(/^(\d{1,3}\.){3}\d{1,3}$|^([a-fA-F0-9:]+)$|^[a-zA-Z0-9.-]+$/)
        .min(1)
        .max(255)
        .required(),
    location: Joi.string().trim().max(100).allow('', null).optional(),
    description: Joi.string().trim().max(500).allow('', null).optional(),
    isActive: Joi.boolean().default(true).optional(),
});

const updateServerSchema = Joi.object({
    name: Joi.string().trim().min(1).max(100).optional(),
    environment: Joi.string().valid(...VALID_ENVIRONMENTS).optional(),
    username: Joi.string().trim().max(50).allow('', null).optional(),
    port: Joi.string().trim().max(10).allow('', null).optional(),
    ipAddress: Joi.string()
        .trim()
        .pattern(/^(\d{1,3}\.){3}\d{1,3}$|^([a-fA-F0-9:]+)$|^[a-zA-Z0-9.-]+$/)
        .min(1)
        .max(255)
        .optional(),
    location: Joi.string().trim().max(100).allow('', null).optional(),
    description: Joi.string().trim().max(500).allow('', null).optional(),
    isActive: Joi.boolean().optional(),
}).min(1);

const setServerStatusSchema = Joi.object({
    isActive: Joi.boolean().required(),
});

const getServersSchema = Joi.object({
    environment: Joi.string().valid(...VALID_ENVIRONMENTS).optional(),
    isActive: Joi.boolean().optional(),
    search: Joi.string().trim().max(100).allow('', null).optional(),
    page: Joi.number().integer().min(1).default(1).optional(),
    limit: Joi.number().integer().min(1).max(200).default(50).optional(),
});

module.exports = {
    createServerSchema,
    updateServerSchema,
    setServerStatusSchema,
    getServersSchema,
};