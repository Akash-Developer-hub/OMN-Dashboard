'use strict';

const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'admin_category_configs';

class CategoryConfig {
    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static async ensureIndexes() {
        await this.collection.createIndex({ category: 1 }, { unique: true, name: 'ux_category_key' });
    }

    static async countDocuments(query = {}) {
        return this.collection.countDocuments(query);
    }

    static async findAll() {
        return this.collection.find({}).sort({ category: 1 }).toArray();
    }

    static async findByCategory(category) {
        return this.collection.findOne({ category });
    }

    static async create(document) {
        const result = await this.collection.insertOne(document);
        return { ...document, _id: result.insertedId };
    }

    static async insertMany(documents = []) {
        if (!Array.isArray(documents) || documents.length === 0) {
            return { insertedCount: 0 };
        }
        return this.collection.insertMany(documents);
    }

    static async updateByCategory(category, update) {
        return this.collection.findOneAndUpdate(
            { category },
            { $set: update },
            { returnDocument: 'after' }
        );
    }
}

module.exports = CategoryConfig;
