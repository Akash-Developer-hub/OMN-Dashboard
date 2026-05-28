'use strict';

const { getDb } = require('../config/database');
const { ObjectId } = require('mongodb');

const COLLECTION = 'users';

class User {
    static get collection() { return getDb().collection(COLLECTION); }

    static async findById(id) {
        if (!ObjectId.isValid(id)) return null;
        return this.collection.findOne({ _id: new ObjectId(id) });
    }

    static async findOne(query) {
        return this.collection.findOne(query);
    }
}

module.exports = User;
