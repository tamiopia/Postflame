// @ts-nocheck
import https from 'https';

function pushToPostman(collectionJson, apiKey, collectionUid) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            collection: collectionJson
        });

        const options = {
            hostname: 'api.getpostman.com',
            port: 443,
            path: `/collections/${collectionUid}`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(responseBody));
                } else {
                    reject(new Error(`Postman API Error: ${res.statusCode} - ${responseBody}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(data);
        req.end();
    });
}

export { pushToPostman };
