'use strict';

class AppError extends Error {
    constructor(code, message, statusCode = 400) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
