'use strict';

const { getDb } = require('../config/database');

const COLLECTION = 'home_screen_configs';

class HomeScreenConfig {
    static get collection() { return getDb().collection(COLLECTION); }

    static async findByConfigId(configId) {
        return this.collection.findOne({ configId });
    }

    static async replaceByConfigId(configId, document) {
        const result = await this.collection.findOneAndReplace(
            { configId },
            document,
            { upsert: true, returnDocument: 'after' }
        );
        return result;
    }
}

module.exports = HomeScreenConfig;
