'use strict';

require('dotenv').config();

const DEFAULT_URL = process.env.DOWNLOAD_STATUS_N8N_CHECK_URL || 'http://localhost:3000/api/v1/admin-dashboard/download-status/n8n';

async function main() {
    const [, , payloadArg] = process.argv;
    const apiKey = process.env.N8N_API_KEY || '';

    if (!payloadArg) {
        console.log('Usage: npm run check:download-status-n8n -- "{"workflow":"searchTiles","runId":"st_test","status":"running"}"');
        console.log(`Default URL: ${DEFAULT_URL}`);
        process.exit(1);
    }

    let payload;
    try {
        payload = JSON.parse(payloadArg);
    } catch (error) {
        console.error('Invalid JSON payload:', error.message);
        process.exit(1);
    }

    const response = await fetch(DEFAULT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-N8N-API-KEY': apiKey } : {}),
        },
        body: JSON.stringify(payload),
    });

    const text = await response.text();

    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    console.log('Raw body:', text);

    try {
        console.log('Parsed JSON:', JSON.stringify(JSON.parse(text), null, 2));
    } catch {
        console.log('Parsed JSON: body is not valid JSON');
    }
}

main().catch((error) => {
    console.error('Check failed:', error.message);
    process.exit(1);
});