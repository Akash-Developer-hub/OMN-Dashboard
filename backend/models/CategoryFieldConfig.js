'use strict';

const { getDb } = require('../config/database');

const COLLECTION = 'category_field_configs';

class CategoryFieldConfig {
    static get collection() { return getDb().collection(COLLECTION); }

    static async findByConfigId(configId) {
        return this.collection.findOne({ configId });
    }

    static async replaceByConfigId(configId, document) {
        await this.collection.replaceOne(
            { configId },
            { ...document, configId, createdAt: new Date() },
            { upsert: true }
        );
        return this.collection.findOne({ configId });
    }
}

module.exports = CategoryFieldConfig;
