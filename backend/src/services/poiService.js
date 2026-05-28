'use strict';

const fs = require('fs');
const path = require('path');
const AppError = require('../../utils/AppError');
const PointOfInterest = require('../models/PointOfInterest');
const { UPLOAD_DIR } = require('../config/multerConfig');

class PoiService {
    static async ensureIndexes() {
        await PointOfInterest.ensureIndexes();
    }

    /**
     * Create a new Point of Interest.
     * If files were uploaded, their paths are appended to mediaUrls as { url, timeStamp }.
     */
    static async createPoi(payload, files = []) {
        await this.ensureIndexes();

        const mediaUrls = [...(payload.mediaUrls || [])];
        const now = String(Date.now());
        for (const file of files) {
            mediaUrls.push({ url: `/uploads/poi/${file.filename}`, timeStamp: now });
        }

        return PointOfInterest.create({
            ...payload,
            mediaUrls,
        });
    }

    /**
     * Get a single POI by its MongoDB _id.
     */
    static async getPoiById(poiId) {
        if (!PointOfInterest.isValidId(poiId)) {
            throw new AppError('VALIDATION_ERROR', 'Invalid POI ID format.');
        }

        const poi = await PointOfInterest.findById(poiId);
        if (!poi) {
            throw AppError.notFound('Point of Interest');
        }
        return poi;
    }

    /**
     * List POIs with pagination, optional category filter, and text search.
     */
    static async listPois(query = {}) {
        await this.ensureIndexes();
        return PointOfInterest.list(query);
    }

    /**
     * Update a POI. Appends any newly uploaded files to existing mediaUrls in DB.
     */
    static async updatePoi(poiId, payload, files = []) {
        const existing = await this.getPoiById(poiId); // existence check

        if (files.length > 0) {
            const currentMedia = existing.mediaUrls || [];
            const payloadMedia = payload.mediaUrls || [];
            const now = String(Date.now());
            const newItems = files.map((f) => ({ url: `/uploads/poi/${f.filename}`, timeStamp: now }));
            // Merge: keep existing DB media + any objects sent in payload + new uploads, dedup by url
            const allMedia = [...currentMedia, ...payloadMedia, ...newItems];
            const seen = new Set();
            payload.mediaUrls = allMedia.filter(item => {
                const key = item.url;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        const updated = await PointOfInterest.updateById(poiId, payload);
        if (!updated) {
            throw AppError.notFound('Point of Interest');
        }
        return updated;
    }

    /**
     * Delete a POI by its MongoDB _id. Also cleans up uploaded files.
     */
    static async deletePoi(poiId) {
        const poi = await this.getPoiById(poiId); // existence check

        // Clean up media files from disk
        this._deleteFilesFromDisk(poi.mediaUrls || []);

        const deleted = await PointOfInterest.deleteById(poiId);
        if (!deleted) {
            throw AppError.notFound('Point of Interest');
        }
        return deleted;
    }

    /**
     * Add new media files to an existing POI.
     */
    static async addMedia(poiId, files = []) {
        await this.getPoiById(poiId); // existence check

        const now = String(Date.now());
        const newItems = files.map((f) => ({ url: `/uploads/poi/${f.filename}`, timeStamp: now }));
        const updated = await PointOfInterest.addMedia(poiId, newItems);
        if (!updated) {
            throw AppError.notFound('Point of Interest');
        }
        return updated;
    }

    /**
     * Remove specific media URLs from a POI and delete files from disk.
     */
    static async removeMedia(poiId, urls = []) {
        await this.getPoiById(poiId); // existence check

        if (!urls.length) {
            throw new AppError('VALIDATION_ERROR', 'No media URLs provided for removal.');
        }

        // Delete actual files from disk
        this._deleteFilesFromDisk(urls);

        const updated = await PointOfInterest.removeMedia(poiId, urls);
        if (!updated) {
            throw AppError.notFound('Point of Interest');
        }
        return updated;
    }

    /**
     * Helper: delete uploaded files from disk by their URL paths.
     * Accepts array of { url, timeStamp } objects or plain strings.
     */
    static _deleteFilesFromDisk(mediaItems = []) {
        for (const item of mediaItems) {
            const url = typeof item === 'string' ? item : item.url;
            if (typeof url !== 'string' || !url.startsWith('/uploads/poi/')) continue;
            const filename = path.basename(url);
            const filePath = path.join(UPLOAD_DIR, filename);
            fs.unlink(filePath, () => {}); // fire-and-forget
        }
    }
}

module.exports = PoiService;
