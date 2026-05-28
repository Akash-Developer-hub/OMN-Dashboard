'use strict';

const { getDb } = require('../config/database');

const COLLECTION = 'poi_media';

class PoiMedia {
    static get collection() { return getDb().collection(COLLECTION); }

    static async findByPoiId(poiId) {
        return this.collection.find({ poi_id: poiId }).toArray();
    }

    static async create(doc) {
        const result = await this.collection.insertOne({ ...doc, createdAt: new Date() });
        return { ...doc, _id: result.insertedId };
    }
}

module.exports = PoiMedia;
