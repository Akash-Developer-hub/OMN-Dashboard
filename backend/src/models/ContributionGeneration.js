'use strict';

const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'contribution_generation';

class ContributionGeneration {
    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    /**
     * Generates ID in format contribution_gen_YYYYMMDD_HHMMSS
     */
    static generateGenId() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `contribution_gen_${year}${month}${day}_${hours}${minutes}${seconds}`;
    }

    // ─── CONFIGURATION METHODS ─────────────────────────────────────────────
    
    static async getGlobalConfig() {
        try {
            const config = await this.collection.findOne({ type: 'settings' });
            if (!config) {
                return {
                    pythonScriptPath: "/home/vmadmin/ServicesRunning/contribution",
                    ITCSearchDatabasePath: "/home/vmadmin/ServicesRunning/NE/ITC/offline/search/ITC.sqlite3",
                    mode: "PRODUCTION",
                    api: "http://localhost:3000",
                    tmux: "ITC"
                };
            }
            return config;
        } catch (e) {
            console.error('CRITICAL: Error fetching global config:', e);
            throw e;
        }
    }

    static async updateGlobalConfig(newConfig) {
        try {
            // 1. Strip away EVERYTHING except the 5 specific config keys
            // This prevents MongoDB from complaining about _id or other internal fields
            const cleanConfig = {
                pythonScriptPath: newConfig.pythonScriptPath || "/home/vmadmin/ServicesRunning/contribution",
                ITCSearchDatabasePath: newConfig.ITCSearchDatabasePath || "/home/vmadmin/ServicesRunning/NE/ITC/offline/search/ITC.sqlite3",
                mode: newConfig.mode || "PRODUCTION",
                api: newConfig.api || "http://localhost:3000",
                tmux: newConfig.tmux || "ITC",
                type: 'settings',
                updatedAt: Date.now()
            };

            console.log('Attempting to save config to DB:', cleanConfig);

            const result = await this.collection.updateOne(
                { type: 'settings' },
                { $set: cleanConfig },
                { upsert: true }
            );

            console.log('Config save result:', result);
            return cleanConfig;
        } catch (e) {
            console.error('CRITICAL: Error updating global config in DB:', e);
            throw e;
        }
    }

    // ─── BATCH HISTORY METHODS ─────────────────────────────────────────────

    static async createBatch(data) {
        const doc = {
            type: 'history',
            gen_id: this.generateGenId(),
            count: data.count || 0,
            status: 'running',
            contributionIds: data.contributionIds || [],
            createdAt: Date.now(),
            config: data.config || {}
        };

        const result = await this.collection.insertOne(doc);
        return { ...doc, id: result.insertedId.toString() };
    }

    static async finalizePreviousGenerations() {
        await this.collection.updateMany(
            { type: 'history', status: 'running' },
            { $set: { status: 'live' } }
        );
    }

    static async markGenerationLiveByGenId(genId) {
        const result = await this.collection.updateOne(
            { type: 'history', gen_id: genId, status: 'running' },
            { $set: { status: 'live', liveUpdateAt: Date.now() } }
        );

        const updated = await this.collection.findOne({ type: 'history', gen_id: genId });
        return {
            updated: updated ? { ...updated, id: updated._id.toString() } : null,
            transitioned: result.modifiedCount > 0,
            matchedRunning: result.matchedCount > 0
        };
    }

    static async findHistory(query = {}, options = {}) {
        const { page = 1, limit = 20 } = options;
        const skip = (page - 1) * limit;

        const finalQuery = { ...query, type: 'history' };
        const total = await this.collection.countDocuments(finalQuery);
        const data = await this.collection
            .find(finalQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        return {
            total,
            page,
            limit,
            data: data.map(d => ({ ...d, id: d._id.toString() }))
        };
    }
}

module.exports = ContributionGeneration;
