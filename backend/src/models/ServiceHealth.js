'use strict';

const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'service_health';
const LOGS_COLLECTION_NAME = 'service_health_logs';

class ServiceHealth {
    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static get logsCollection() {
        return getDb().collection(LOGS_COLLECTION_NAME);
    }

    static async dropOldIndexes() {
        try {
            await this.collection.dropIndex('idx_service_health_service');
        } catch (err) {}
        try {
            await this.collection.dropIndex('idx_service_health_last_checked');
        } catch (err) {}
    }

    static async getSnapshot() {
        await this.dropOldIndexes().catch(() => {});
        return await this.collection.findOne({ _id: 'singleton' }) || {};
    }

    static async saveSnapshot(updatedFields) {
        if (!updatedFields || Object.keys(updatedFields).length === 0) {
            return;
        }
        await this.dropOldIndexes().catch(() => {});
        return await this.collection.updateOne(
            { _id: 'singleton' },
            { $set: updatedFields },
            { upsert: true }
        );
    }

    static async saveConfiguration({ server, serviceDefinition, pm2Name, type, healthUrl, apiUrl, apiMethod, apiTimeout, apiHeaders, apiQueryParams, apiBody }) {
        const now = new Date().toISOString();
        await this.dropOldIndexes().catch(() => {});
        const setFields = {
            [`${pm2Name}.serviceDefinition`]: serviceDefinition,
            [`${pm2Name}.type`]: type || 'pm2',
            [`${pm2Name}.updatedAt`]: now
        };
        if (server) setFields[`${pm2Name}.server`] = server;
        if (healthUrl) setFields[`${pm2Name}.healthUrl`] = healthUrl;
        if (apiUrl) setFields[`${pm2Name}.apiUrl`] = apiUrl;
        if (apiMethod) setFields[`${pm2Name}.apiMethod`] = apiMethod;
        if (apiTimeout) setFields[`${pm2Name}.apiTimeout`] = apiTimeout;
        if (apiHeaders) setFields[`${pm2Name}.apiHeaders`] = apiHeaders;
        if (apiQueryParams) setFields[`${pm2Name}.apiQueryParams`] = apiQueryParams;
        if (apiBody) setFields[`${pm2Name}.apiBody`] = apiBody;
        const update = {
            $set: setFields,
            $setOnInsert: {
                [`${pm2Name}.createdAt`]: now
            }
        };
        return await this.collection.updateOne(
            { _id: 'singleton' },
            update,
            { upsert: true }
        );
    }
    
    static async getConfigurations() {
        await this.dropOldIndexes().catch(() => {});
        const snapshot = await this.collection.findOne({ _id: 'singleton' }) || {};
        
        const configurations = [];
        for (const [key, value] of Object.entries(snapshot)) {
            if (key !== '_id' && value && typeof value === 'object') {
                configurations.push({
                    pm2Name: key,
                    ...value
                });
            }
        }
        
        return configurations;
    }

    // ---
    static async editServiceName(pm2Name, serviceDefinition) {
        const now = new Date().toISOString();
        await this.dropOldIndexes().catch(() => {});
        return await this.collection.updateOne(
            { _id: 'singleton', [pm2Name]: { $exists: true } },
            {
                $set: {
                    [`${pm2Name}.serviceDefinition`]: serviceDefinition,
                    [`${pm2Name}.updatedAt`]: now
                }
            }
        );
    }

    static async deleteService(pm2Name) {
        await this.dropOldIndexes().catch(() => {});
        return await this.collection.updateOne(
            { _id: 'singleton', [pm2Name]: { $exists: true } },
            { $unset: { [pm2Name]: "" } }
        );
    }
    // ---

    static async isServiceDefinitionDuplicate(serviceDefinition, excludePm2Name = null) {
        await this.dropOldIndexes().catch(() => {});
        const snapshot = await this.collection.findOne({ _id: 'singleton' }) || {};

        for (const [key, value] of Object.entries(snapshot)) {
            if (key !== '_id' && value && typeof value === 'object') {
                if (value.serviceDefinition === serviceDefinition && key !== excludePm2Name) {
                    return true;
                }
            }
        }
        return false;
    }

    // --- ARRAY-BASED RESPONSE TIME TRACKING ---

    static async logResponseTime(pm2Name, responseTimeMs) {
        if (responseTimeMs === undefined || responseTimeMs === null) return;
        const now = new Date();
        
        // Push the new log into the single document for this service
        await this.logsCollection.updateOne(
            { serviceName: pm2Name },
            { 
                $push: { 
                    logs: { 
                        responseTimeMs: responseTimeMs, 
                        createdAt: now 
                    } 
                } 
            },
            { upsert: true }
        );
        
        // Background cleanup: Pull (remove) logs older than 2 days from the array
        const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
        this.logsCollection.updateOne(
            { serviceName: pm2Name },
            {
                $pull: {
                    logs: {
                        createdAt: { $lt: twoDaysAgo }
                    }
                }
            }
        ).catch(() => {});
    }

    static async getResponseTimeMetrics(pm2Name, rangeStr = '24h') {
        const rangeHrs = rangeStr === '48h' ? 48 : 24;
        const now = new Date();
        
        const currentHour = new Date(now);
        currentHour.setMinutes(0, 0, 0, 0);

        const startTime = new Date(currentHour.getTime() - ((rangeHrs - 1) * 60 * 60 * 1000));

        // Fetch the SINGLE document for this specific service
        const doc = await this.logsCollection.findOne({ serviceName: pm2Name });
        
        // Extract the array of logs (default to empty array if no document exists yet)
        const allLogs = doc && doc.logs ? doc.logs : [];
        
        // Filter out logs that are older than our requested start time
        const logs = allLogs.filter(log => log.createdAt >= startTime);

        // Initialize empty hourly buckets dynamically
        const bucketsMap = new Map();
        for (let i = 0; i < rangeHrs; i++) {
            const bucketTime = new Date(startTime.getTime() + (i * 60 * 60 * 1000));
            const formattedTimestamp = bucketTime.toISOString().replace('.000Z', 'Z');
            bucketsMap.set(formattedTimestamp, { sum: 0, count: 0 });
        }

        // Sort array logs into their corresponding hour
        for (const log of logs) {
            const logHour = new Date(log.createdAt);
            logHour.setMinutes(0, 0, 0, 0);
            const isoKey = logHour.toISOString().replace('.000Z', 'Z');
            
            if (bucketsMap.has(isoKey)) {
                const b = bucketsMap.get(isoKey);
                b.sum += log.responseTimeMs;
                b.count += 1;
            }
        }

        const dataPoints = [];
        let peakAvg = 0;

        // Calculate averages for each hour
        for (const [timestamp, bucket] of bucketsMap.entries()) {
            const avg = bucket.count > 0 ? Math.round(bucket.sum / bucket.count) : 0;
            dataPoints.push({ timestamp, avg });
            
            if (avg > peakAvg) {
                peakAvg = avg;
            }
        }

        let currentAvg = 0;
        for (let i = dataPoints.length - 1; i >= 0; i -= 1) {
            if (dataPoints[i].avg > 0) {
                currentAvg = dataPoints[i].avg;
                break;
            }
        }

        return {
            range: `${rangeHrs}h`,
            dataPoints,
            peakAvg,
            currentAvg
        };
    }
}

module.exports = ServiceHealth;