const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'admin_service_accounts';

class ServiceAccount {
    constructor(data) {
        Object.assign(this, data);
        if (this._id) this.id = this._id.toString();
    }

    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static async create(data) {
        const doc = {
            ...data,
            isActive: data.isActive !== undefined ? data.isActive : true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const result = await this.collection.insertOne(doc);
        return new ServiceAccount({ ...doc, _id: result.insertedId });
    }

    static async findById(id) {
        if (!ObjectId.isValid(id)) return null;
        const doc = await this.collection.findOne({ _id: new ObjectId(id) });
        return doc ? new ServiceAccount(doc) : null;
    }

    static async findAll(query = {}) {
        const docs = await this.collection.find(query).toArray();
        return {
            serviceAccounts: docs.map(doc => new ServiceAccount(doc)),
            total: docs.length
        };
    }

    static async updateById(id, data) {
        if (!ObjectId.isValid(id)) return false;
        const result = await this.collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { ...data, updatedAt: new Date() } }
        );
        return result.modifiedCount > 0;
    }

    static async deleteById(id) {
        if (!ObjectId.isValid(id)) return false;
        const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
        return result.deletedCount > 0;
    }

    toJSON() {
        const obj = { ...this };
        obj.id = obj._id?.toString();
        delete obj._id;
        return obj;
    }
}

module.exports = ServiceAccount;
