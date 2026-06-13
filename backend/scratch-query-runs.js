'use strict';

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is not defined');
        process.exit(1);
    }
    const dbName = new URL(uri).pathname.replace('/', '') || 'omn';
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);

    const doc = await db.collection('data_pipeline_runs').findOne({ runId: 'run_zr5wdj' });
    console.log('Document run_zr5wdj:');
    if (doc) {
        // print keys related to routing or multipart or step
        const keys = Object.keys(doc);
        const filtered = {};
        for (const k of keys) {
            if (k.toLowerCase().includes('multipart') || k.toLowerCase().includes('routing') || k.toLowerCase().includes('status') || k.toLowerCase().includes('services')) {
                filtered[k] = doc[k];
            }
        }
        console.log(JSON.stringify(filtered, null, 2));
    } else {
        console.log('Document not found');
    }

    await client.close();
}

main().catch(console.error);
