'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../../config/database');
const { ObjectId } = require('mongodb');

const COLLECTION_NAME = 'admin_users';
const VALID_ROLES = ['admin', 'superadmin', 'vendor'];

class AdminDashboardUser {
    constructor(data) {
        Object.assign(this, data);
        if (this._id) this.id = this._id.toString();
    }

    static fromDoc(doc) {
        return doc ? new AdminDashboardUser(doc) : null;
    }

    static get collection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static async findOne(query) {
        const doc = await this.collection.findOne(query);
        return this.fromDoc(doc);
    }

    static async count(query = {}) {
        return await this.collection.countDocuments(query);
    }

    static async findById(id) {
        if (!ObjectId.isValid(id)) return null;
        const doc = await this.collection.findOne({ _id: new ObjectId(id) });
        return this.fromDoc(doc);
    }

    static async create(data) {
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(data.password, salt);

        const doc = {
            name: data.name,
            email: data.email.toLowerCase(),
            password: hashedPassword,
            role: data.role,
            isActive: true,
            loginAttempts: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await this.collection.insertOne(doc);
        return this.fromDoc({ ...doc, _id: result.insertedId });
    }

    /**
     * Find existing user by email OR create a new one.
     * Returns { user, isNew } — isNew=true means just registered.
     */
    static async findOrCreate(data) {
        const existing = await this.findOne({ email: data.email.toLowerCase() });
        if (existing) {
            return { user: existing, isNew: false };
        }
        const created = await this.create(data);
        return { user: created, isNew: true };
    }

    static async findAll({ page = 1, limit = 20, filter = {} } = {}) {
        const skip = (page - 1) * limit;
        const [docs, total] = await Promise.all([
            this.collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            this.collection.countDocuments(filter)
        ]);
        return { users: docs.map(d => this.fromDoc(d)), total, page, limit };
    }

    static async updateById(id, data) {
        if (!ObjectId.isValid(id)) return null;
        const allowed = ['name', 'role', 'isActive'];
        const updates = {};
        for (const key of allowed) {
            if (data[key] !== undefined) updates[key] = data[key];
        }
        if (data.password) {
            const salt = await bcrypt.genSalt(12);
            updates.password = await bcrypt.hash(data.password, salt);
        }
        if (!Object.keys(updates).length) return null;
        updates.updatedAt = new Date();
        await this.collection.updateOne({ _id: new ObjectId(id) }, { $set: updates });
        return this.findById(id);
    }

    static async deleteById(id) {
        if (!ObjectId.isValid(id)) return false;
        const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
        return result.deletedCount === 1;
    }

    async save() {
        const { id, _id, ...updateData } = this;
        updateData.updatedAt = new Date();

        if (updateData.password && updateData.password.length < 60) {
            const salt = await bcrypt.genSalt(12);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        }

        await AdminDashboardUser.collection.updateOne(
            { _id: new ObjectId(this._id) },
            { $set: updateData }
        );
        return this;
    }

    async comparePassword(candidate) {
        return bcrypt.compare(candidate, this.password);
    }

    isLocked() {
        return !!(this.lockUntil && this.lockUntil > new Date());
    }

    async incrementLoginAttempts() {
        const MAX_ATTEMPTS = 5;
        const LOCK_MINUTES = 30;
        const updates = { $inc: { loginAttempts: 1 } };

        if (this.loginAttempts + 1 >= MAX_ATTEMPTS && !this.isLocked()) {
            updates.$set = {
                lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            };
        }

        await AdminDashboardUser.collection.updateOne(
            { _id: new ObjectId(this._id) },
            updates
        );
    }

    async resetLoginAttempts() {
        await AdminDashboardUser.collection.updateOne(
            { _id: new ObjectId(this._id) },
            {
                $set: { loginAttempts: 0, lastLogin: new Date() },
                $unset: { lockUntil: '' }
            }
        );
    }

    toJSON() {
        const obj = { ...this };
        obj.id = obj._id?.toString();
        delete obj._id;
        delete obj.password;
        delete obj.loginAttempts;
        delete obj.lockUntil;
        return obj;
    }
}

module.exports = AdminDashboardUser;
