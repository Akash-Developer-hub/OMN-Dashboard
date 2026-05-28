'use strict';

const { ObjectId } = require('mongodb');
const { getDb } = require('../../config/database');

const COLLECTION_NAME = 'contributors';

class Contributor {
    static getcollection() {
        return getDb().collection(COLLECTION_NAME);
    }

    static toObjectId(id) {
        return id instanceof ObjectId ? id : new ObjectId(id);
    }

    static isValidId(id) {
        return ObjectId.isValid(id);
    }
}

module.exports = Contributor;
