'use strict';

const ApiResponse = require('../utils/ApiResponse');

/**
 * Joi validation middleware.
 * Usage: validate({ body: schema }) or validate({ query: schema, params: schema })
 */
function validate(schemas) {
    return (req, res, next) => {
        const targets = { body: req.body, query: req.query, params: req.params };
        for (const [key, schema] of Object.entries(schemas)) {
            const { error, value } = schema.validate(targets[key], { abortEarly: false, allowUnknown: true });
            if (error) {
                const messages = error.details.map(d => d.message).join(', ');
                return ApiResponse.error(res, 400, messages);
            }
            req[key] = value;
        }
        next();
    };
}

module.exports = validate;
