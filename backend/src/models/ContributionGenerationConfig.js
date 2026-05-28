'use strict';

const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'contribution_generation_config';

class ContributionGenerationConfig {
    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static async get() {
        const config = await this.collection.findOne({ type: 'global_config' });
        if (!config) {
            // Default initial config
            return {
                pythonScriptPath: " ",
                ITCSearchDatabasePath: "/ITC.sqlite3",
                mode: "PRODUCTION",
                api: "https://sandbox.vmmaps.com/admaps",
                tmux: "ITC"
            };
        }
        return config;
    }
    static async update(newConfig) {
        const { _id, ...rest } = newConfig;
        await this.collection.updateOne(
            { type: 'global_config' },
            { $set: { ...rest, type: 'global_config', updatedAt: Date.now() } },
            { upsert: true }
        );
        return this.get();
    }
}

module.exports = ContributionGenerationConfig;
