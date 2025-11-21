import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const REDIS_URL_DB = process.env.REDIS_URL_DB;

console.log("--- Environment Variables ---");
console.log(`REDIS_URL defined: ${!!REDIS_URL}`);
console.log(`REDIS_URL_DB defined: ${!!REDIS_URL_DB}`);

if (REDIS_URL_DB && REDIS_URL !== REDIS_URL_DB) {
    console.log("⚠️  DIFFERENT REDIS URLS DETECTED!");
    console.log(`REDIS_URL:    ${REDIS_URL.substring(0, 20)}...`);
    console.log(`REDIS_URL_DB: ${REDIS_URL_DB.substring(0, 20)}...`);
} else {
    console.log("✅ Redis URLs match or REDIS_URL_DB is not set.");
}

async function checkRedis(url, label) {
    if (!url) {
        console.log(`[${label}] No URL provided.`);
        return;
    }

    let cleanUrl = url;
    if (cleanUrl.includes('upstash.io') && cleanUrl.startsWith('redis://')) {
        cleanUrl = cleanUrl.replace('redis://', 'rediss://');
    }

    const client = new Redis(cleanUrl, { family: 0 });

    try {
        const count = await client.scard('subscriptions:all');
        console.log(`[${label}] 'subscriptions:all' count: ${count}`);

        if (count > 0) {
            const members = await client.smembers('subscriptions:all');
            console.log(`[${label}] IDs:`, members);
        }
    } catch (e) {
        console.error(`[${label}] Error:`, e.message);
    } finally {
        client.quit();
    }
}

(async () => {
    console.log("\n--- Checking REDIS_URL (Worker uses this) ---");
    await checkRedis(REDIS_URL, "WORKER_CONN");

    if (REDIS_URL_DB && REDIS_URL_DB !== REDIS_URL) {
        console.log("\n--- Checking REDIS_URL_DB (Server uses this) ---");
        await checkRedis(REDIS_URL_DB, "DB_CONN");
    }
})();
