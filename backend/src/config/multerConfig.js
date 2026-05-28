'use strict';

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const AppError = require('../../utils/AppError');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'poi');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

const storage = multer.diskStorage({
    destination(_req, _file, cb) {
        cb(null, UPLOAD_DIR);
    },
    filename(_req, file, cb) {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

function fileFilter(_req, file, cb) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
        return cb(
            new AppError('VALIDATION_ERROR', `File type ${file.mimetype} is not allowed. Allowed types: ${ALLOWED_TYPES.join(', ')}`),
            false
        );
    }
    cb(null, true);
}

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_VIDEO_SIZE, // max per file — individual checks below
        files: 10,               // max 10 files per request
    },
});

/**
 * Middleware: Accepts up to 10 media files (images/videos) under field "media".
 */
const uploadMedia = upload.array('media', 10);

/**
 * Post-upload validation middleware to enforce per-type size limits.
 */
function validateMediaSizes(req, _res, next) {
    if (!req.files || req.files.length === 0) return next();

    for (const file of req.files) {
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) && file.size > MAX_IMAGE_SIZE) {
            return next(
                new AppError('VALIDATION_ERROR', `Image ${file.originalname} exceeds the 10 MB limit.`)
            );
        }
        if (ALLOWED_VIDEO_TYPES.includes(file.mimetype) && file.size > MAX_VIDEO_SIZE) {
            return next(
                new AppError('VALIDATION_ERROR', `Video ${file.originalname} exceeds the 100 MB limit.`)
            );
        }
    }
    next();
}

module.exports = {
    uploadMedia,
    validateMediaSizes,
    UPLOAD_DIR,
};
