'use strict';

const { getDb } = require('../config/database');

const COLLECTION = 'poi_data';

class PoiData {
    static get collection() { return getDb().collection(COLLECTION); }

    static async upsertByUniqueId(uniqueId, payload) {
        return this.collection.updateOne(
            { unique_id: uniqueId },
            { $set: { ...payload, unique_id: uniqueId, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true }
        );
    }

    static async findByUniqueId(uniqueId) {
        return this.collection.findOne({ unique_id: uniqueId });
    }
}

module.exports = PoiData;
