'use strict';

const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectDb() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set in environment variables.');

    const dbName = new URL(uri).pathname.replace('/', '') || 'omn';

    try {
        client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 7000,
        });
        await client.connect();

        db = client.db(dbName);
        console.log(`[DB] Connected to MongoDB: ${dbName}`);
        return db;
    } catch (error) {
        const message = String(error?.message || 'Unknown MongoDB connection error');
        const refused =
            message.includes('ECONNREFUSED') ||
            message.includes('MongoServerSelectionError');

        if (refused) {
            throw new Error(
                `MongoDB connection failed for ${uri}. Ensure mongod is running and reachable on the configured host/port.`
            );
        }

        throw error;
    }
}

function getDb() {
    if (!db) throw new Error('Database not initialised. Call connectDb() first.');
    return db;
}

async function closeDb() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}

module.exports = { connectDb, getDb, closeDb };
