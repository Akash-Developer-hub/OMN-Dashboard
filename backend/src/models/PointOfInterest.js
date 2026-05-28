'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'points_of_interest';

let indexesEnsured = false;

class PointOfInterest {
    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static toObjectId(id) {
        return id instanceof ObjectId ? id : new ObjectId(id);
    }

    static isValidId(id) {
        return ObjectId.isValid(id);
    }

    /**
     * Generate a unique POI ID by combining lat + lon.
     * Format: poi_<lat>_<lon>_<timestamp>
     */
    static generatePoiId(latitude, longitude) {
        const lat = String(latitude).replace(/[^0-9-]/g, '').replace('-', 'n');
        const lon = String(longitude).replace(/[^0-9-]/g, '').replace('-', 'n');
        return `poi_${lat}_${lon}`;
    }

    static toResponse(poi) {
        if (!poi) return null;
        return {
            ...poi,
            id: poi._id.toString(),
        };
    }

    static async ensureIndexes() {
        if (indexesEnsured) return;

        await this.collection.createIndex(
            { poi_id: 1 },
            { unique: true, name: 'idx_poi_id' }
        );
        await this.collection.createIndex(
            { 'coordinate.latitude': 1, 'coordinate.longitude': 1 },
            { name: 'idx_poi_coordinate' }
        );
        await this.collection.createIndex(
            { category: 1 },
            { name: 'idx_poi_category' }
        );
        await this.collection.createIndex(
            { place_id: 1 },
            { name: 'idx_poi_place_id' }
        );
        await this.collection.createIndex(
            { createdAt: -1 },
            { name: 'idx_poi_created' }
        );

        indexesEnsured = true;
    }

    static async create(data) {
        const now = Date.now();
        const doc = {
            ...data,
            poi_id: this.generatePoiId(data.coordinate.latitude, data.coordinate.longitude),
            createdAt: now,
            updatedAt: now,
        };

        const result = await this.collection.insertOne(doc);
        return this.toResponse({ ...doc, _id: result.insertedId });
    }

    static async findById(id) {
        const doc = await this.collection.findOne({ _id: this.toObjectId(id) });
        return this.toResponse(doc);
    }

    static async findByPoiId(poiId) {
        const doc = await this.collection.findOne({ poi_id: poiId });
        return this.toResponse(doc);
    }

    static async list({ page = 1, limit = 20, category, search } = {}) {
        const filter = {};
        if (category) {
            filter.category = category;
        }
        if (search) {
            filter.$or = [
                { placeName: { $regex: search, $options: 'i' } },
                { address: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;
        const [docs, total] = await Promise.all([
            this.collection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            this.collection.countDocuments(filter),
        ]);

        return {
            data: docs.map(this.toResponse),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    static async updateById(id, data) {
        const updateDoc = {
            ...data,
            updatedAt: Date.now(),
        };

        // Remove fields that shouldn't be overwritten
        delete updateDoc._id;
        delete updateDoc.poi_id;
        delete updateDoc.createdAt;

        const result = await this.collection.findOneAndUpdate(
            { _id: this.toObjectId(id) },
            { $set: updateDoc },
            { returnDocument: 'after' }
        );

        return this.toResponse(result);
    }

    static async deleteById(id) {
        const result = await this.collection.findOneAndDelete({
            _id: this.toObjectId(id),
        });
        return this.toResponse(result);
    }

    /**
     * Push new media objects into the existing mediaUrls array.
     * Each item: { url: string, timeStamp: string }
     */
    static async addMedia(id, mediaItems = []) {
        if (!mediaItems.length) return this.findById(id);

        const result = await this.collection.findOneAndUpdate(
            { _id: this.toObjectId(id) },
            {
                $push: { mediaUrls: { $each: mediaItems } },
                $set: { updatedAt: Date.now() },
            },
            { returnDocument: 'after' }
        );
        return this.toResponse(result);
    }

    /**
     * Remove media items whose url matches any of the given URLs.
     */
    static async removeMedia(id, urls = []) {
        if (!urls.length) return this.findById(id);

        const result = await this.collection.findOneAndUpdate(
            { _id: this.toObjectId(id) },
            {
                $pull: { mediaUrls: { url: { $in: urls } } },
                $set: { updatedAt: Date.now() },
            },
            { returnDocument: 'after' }
        );
        return this.toResponse(result);
    }
}

module.exports = PointOfInterest;
