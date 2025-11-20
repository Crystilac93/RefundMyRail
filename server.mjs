import express from 'express';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Queue, Worker } from 'bullmq'; 
import Redis from 'ioredis';

// --- Configuration ---
const CONSUMER_KEY = process.env.RAIL_API_KEY;
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Redis Config
// REDIS_URL: Your original cache/queue instance
// REDIS_URL_DB: Your new Upstash instance for persistent subscriptions
const REDIS_URL_CACHE = process.env.REDIS_URL; 
const REDIS_URL_DB = process.env.REDIS_URL_DB || process.env.REDIS_URL; 

if (!CONSUMER_KEY) {
    console.error("❌ FATAL ERROR: RAIL_API_KEY is not defined.");
    process.exit(1);
}

const METRICS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceMetrics";
const DETAILS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceDetails";

// --- Redis Connection Helper ---
function createRedisClient(connectionString, name) {
    if (!connectionString) {
        console.warn(`⚠️  ${name} URL is missing.`);
        return null;
    }

    let url = connectionString;
    // Upstash requires TLS (rediss://). If the user provides redis:// for an upstash host, we auto-upgrade it.
    if (url.includes('upstash.io') && url.startsWith('redis://')) {
        console.log(`🔒 Upgrading ${name} connection to TLS (rediss://)`);
        url = url.replace('redis://', 'rediss://');
    }

    return new Redis(url, { maxRetriesPerRequest: null });
}

// --- Redis Connections ---
console.log("🔌 Connecting to Cache Redis...");
const redisCache = createRedisClient(REDIS_URL_CACHE, "Cache");

let redisDb;
if (REDIS_URL_DB !== REDIS_URL_CACHE) {
    console.log("💾 Connecting to Storage Redis...");
    redisDb = createRedisClient(REDIS_URL_DB, "Storage");
} else {
    console.warn("⚠️  WARNING: Using the same Redis for Cache and Storage. Data loss risk if cache fills up.");
    redisDb = redisCache;
}

// --- Helper Functions ---
function getCacheKey(endpoint, payload) {
    const dataString = endpoint + JSON.stringify(payload);
    return crypto.createHash('md5').update(dataString).digest('hex');
}

function isDateInPast(dateStr) {
    if (!dateStr) return false;
    const today = new Date().toISOString().split('T')[0];
    return dateStr < today;
}

// --- Queue Setup ---
const searchQueue = new Queue('rail-search-queue', { connection: redisCache });

// --- Worker Setup ---
const worker = new Worker('rail-search-queue', async (job) => {
    const { type, payload, cacheKey } = job.data;
    console.log(`⚙️ Processing job ${job.id}: ${type}`);

    let url;
    if (type === 'metrics') url = METRICS_URL;
    else if (type === 'details') url = DETAILS_URL;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-apikey': CONSUMER_KEY },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            if (response.status === 429) throw new Error('Rate Limited');
            const text = await response.text();
            throw new Error(`API Error ${response.status}: ${text}`);
        }

        const data = await response.json();
        
        // Save to Redis Cache (Uses redisCache - ephemeral)
        if (type === 'details' || (type === 'metrics' && isDateInPast(payload.from_date))) {
             const stringData = JSON.stringify(data);
             await redisCache.set(cacheKey, stringData, 'EX', 86400); // Expire cache after 24h
        }

        return data; 

    } catch (error) {
        console.error(`Job ${job.id} failed: ${error.message}`);
        throw error;
    }
}, { 
    connection: redisCache,
    limiter: { max: 1, duration: 1500 }
});

// --- Express App ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false })); 

// --- Core API Endpoints ---

async function handleRequest(type, payload, res) {
    const cacheKey = getCacheKey(type, payload);

    try {
        const cachedRaw = await redisCache.get(cacheKey);
        if (cachedRaw) {
            return res.json({ jobId: `cached:${cacheKey}`, status: 'completed' });
        }
    } catch (e) {
        console.error("Redis Cache Error:", e);
    }

    try {
        const job = await searchQueue.add(type, { type, payload, cacheKey });
        res.json({ jobId: job.id, status: 'queued' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

app.post('/api/servicemetrics', async (req, res) => {
    const payload = req.body;
    if (!payload.to_date && payload.from_date) payload.to_date = payload.from_date;
    await handleRequest('metrics', payload, res);
});

app.post('/api/servicedetails', async (req, res) => {
    await handleRequest('details', req.body, res);
});

app.get('/api/job/:id', async (req, res) => {
    const jobId = req.params.id;

    if (jobId.startsWith('cached:')) {
        const cacheKey = jobId.split('cached:')[1];
        const cachedRaw = await redisCache.get(cacheKey);
        if (cachedRaw) {
             const data = JSON.parse(cachedRaw);
             return res.json({ status: 'completed', data: { ...data, _fromCache: true } });
        } else {
            return res.status(404).json({ error: 'Cache expired' });
        }
    }

    try {
        const job = await searchQueue.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const state = await job.getState(); 
        
        if (state === 'completed') {
            const result = job.returnvalue;
            res.json({ status: 'completed', data: result });
        } else if (state === 'failed') {
            res.json({ status: 'failed', error: job.failedReason });
        } else {
            res.json({ status: 'pending', state });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- SUBSCRIPTION ENDPOINTS (Uses redisDb - persistent) ---

app.post('/api/subscribe', async (req, res) => {
    // FIX: Updated to accept 'morningStart', 'morningEnd' etc instead of 'morningTime'
    const { email, fromCode, toCode, morningStart, morningEnd, eveningStart, eveningEnd } = req.body;

    if (!email || !fromCode || !toCode) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const subId = crypto.randomUUID();
        const subscription = {
            id: subId,
            email,
            route: { from: fromCode, to: toCode },
            // FIX: Storing structured ranges
            times: { 
                morning: { start: morningStart, end: morningEnd }, 
                evening: { start: eveningStart, end: eveningEnd } 
            },
            createdAt: new Date().toISOString(),
            active: true
        };

        // 1. Store object
        await redisDb.set(`subscription:${subId}`, JSON.stringify(subscription));
        
        // 2. Add to global list (for future cron jobs)
        await redisDb.sadd('subscriptions:all', subId);
        
        // 3. Add to user index (for management page)
        await redisDb.sadd(`user_subs:${email}`, subId);

        console.log(`📝 New subscription: ${email} [${fromCode}->${toCode}]`);
        res.json({ status: "success", id: subId });

    } catch (error) {
        console.error("Subscription Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// GET subscriptions for a specific email
app.get('/api/subscriptions', async (req, res) => {
    const { email } = req.query;
    if(!email) return res.status(400).json({ error: "Email required" });

    try {
        // 1. Get all IDs for this user from index
        const subIds = await redisDb.smembers(`user_subs:${email}`);
        
        if(subIds.length === 0) return res.json([]);

        // 2. Fetch actual data for each ID
        const keys = subIds.map(id => `subscription:${id}`);
        
        // Use mget to fetch all keys in one round-trip
        const rawSubs = await redisDb.mget(keys);
        
        const subscriptions = rawSubs
            .filter(s => s !== null)
            .map(s => JSON.parse(s));

        res.json(subscriptions);

    } catch (error) {
        console.error("Fetch Subs Error:", error);
        res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
});

// DELETE a subscription
app.delete('/api/subscription/:id', async (req, res) => {
    const { id } = req.params;
    const { email } = req.body; 

    try {
        // Check if exists to ensure we clean up the correct indices
        const subRaw = await redisDb.get(`subscription:${id}`);
        if(!subRaw) return res.status(404).json({error: "Not found"});
        
        const sub = JSON.parse(subRaw);
        const userEmail = email || sub.email;

        // 1. Remove from KV
        await redisDb.del(`subscription:${id}`);
        
        // 2. Remove from Global Set
        await redisDb.srem('subscriptions:all', id);
        
        // 3. Remove from User Index
        if(userEmail) {
            await redisDb.srem(`user_subs:${userEmail}`, id);
        }

        console.log(`🗑️ Deleted subscription: ${id}`);
        res.json({ status: "deleted" });

    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete" });
    }
});

// --- Routes ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'DelayRepayChecker.html'));
});

app.get('/manage', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ManageSubscriptions.html'));
});

// --- Start Server ---
if (IS_PRODUCTION) {
    http.createServer(app).listen(PORT, () => {
        console.log(`🚀 Production server running on port ${PORT}`);
    });
} else {
    try {
        const httpsOptions = { key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') };
        https.createServer(httpsOptions, app).listen(PORT, () => {
            console.log(`🔒 Local server running on https://localhost:${PORT}`);
        });
    } catch (e) {
        console.warn("⚠️ SSL keys not found. Falling back to HTTP.");
        http.createServer(app).listen(PORT, () => {
            console.log(`⚠️ Local server running on http://localhost:${PORT}`);
        });
    }
}