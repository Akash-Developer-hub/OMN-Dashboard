'use strict';

const { getDb } = require('../config/database');

const COLLECTION = 'poi_comments';

class PoiComment {
    static get collection() { return getDb().collection(COLLECTION); }

    static async findByContributionId(contributionId, { page = 1, limit = 50 } = {}) {
        const skip = (page - 1) * limit;
        const [comments, total] = await Promise.all([
            this.collection.find({ contribution_id: contributionId }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            this.collection.countDocuments({ contribution_id: contributionId }),
        ]);
        return { comments, total };
    }

    static async create(doc) {
        const result = await this.collection.insertOne({ ...doc, createdAt: new Date() });
        return { ...doc, _id: result.insertedId };
    }

    static async markAdminRead(contributionId) {
        const result = await this.collection.updateMany(
            { contribution_id: contributionId, adminRead: { $ne: true } },
            { $set: { adminRead: true, adminReadAt: new Date() } }
        );
        return result.modifiedCount;
    }
}

module.exports = PoiComment;
