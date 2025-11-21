import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_URL_DB = process.env.REDIS_URL_DB || process.env.REDIS_URL;

function createRedisClient(connectionString, name) {
    let url = connectionString;
    if (url.includes('upstash.io') && url.startsWith('redis://')) {
        console.log(`🔒 Upgrading ${name} connection to TLS (rediss://)`);
        url = url.replace('redis://', 'rediss://');
    }
    return new Redis(url, { family: 0 });
}

const client = createRedisClient(REDIS_URL_DB, "Debug");

async function test() {
    try {
        console.log("Testing SET with EX...");
        await client.set("test:key", "value", "EX", 86400);
        console.log("✅ SET with EX success");

        console.log("Testing SET without EX...");
        await client.set("test:key2", "value");
        console.log("✅ SET without EX success");

    } catch (e) {
        console.error("❌ Redis Error:", e);
    } finally {
        client.disconnect();
    }
}

test();
