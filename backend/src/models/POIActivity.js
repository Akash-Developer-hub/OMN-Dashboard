'use strict';
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'admin_poi_activity';

class POIActivity {
    static get collection() { 
        return getDb().collection(COLLECTION_NAME); 
    }

    static async create(data) {
        const doc = { 
            ...data, 
            timestamp: new Date().toISOString(), 
            createdAt: new Date().toISOString() 
        };
        return await this.collection.insertOne(doc);
    }

    static async find(filter = {}, sort = { timestamp: -1 }, limit = 50) {
        return await this.collection.find(filter).sort(sort).limit(limit).toArray();
    }

    static async aggregate(pipeline) {
        return await this.collection.aggregate(pipeline).toArray();
    }
}

module.exports = POIActivity;
