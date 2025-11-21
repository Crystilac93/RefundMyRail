import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import session from 'express-session';
import { hashPassword, comparePassword, validatePassword, validateEmail, requireAuth } from './auth.mjs';

// --- Configuration ---
const CONSUMER_KEY = process.env.RAIL_API_KEY;
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Redis Config
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
    if (url.includes('upstash.io') && url.startsWith('redis://')) {
        console.log(`🔒 Upgrading ${name} connection to TLS (rediss://)`);
        url = url.replace('redis://', 'rediss://');
    }

    const client = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        family: 0
    });

    client.on('error', (err) => {
        console.error(`❌ ${name} Redis Error:`, err);
    });

    client.on('connect', () => {
        console.log(`✅ ${name} Redis Connected`);
    });

    return client;
}

// --- Redis Connections ---
console.log("🔌 Connecting to Cache Redis...");
const redisCache = createRedisClient(REDIS_URL_CACHE, "Cache");

console.log("💾 Connecting to Storage Redis...");
const redisDb = createRedisClient(REDIS_URL_DB || REDIS_URL_CACHE, "Storage");

if (REDIS_URL_DB === REDIS_URL_CACHE) {
    console.warn("⚠️  Using the same Redis instance for Cache and Storage.");
} else {
    console.log("✅ Using separate Redis instances for Cache and Storage");
}

console.log("👷 Connecting to Worker Redis...");
const redisWorker = createRedisClient(REDIS_URL_CACHE, "Worker");

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

        if (type === 'details' || (type === 'metrics' && isDateInPast(payload.from_date))) {
            const stringData = JSON.stringify(data);
            await redisCache.set(cacheKey, stringData, 'EX', 86400);
        }

        return data;

    } catch (error) {
        console.error(`Job ${job.id} failed: ${error.message}`);
        throw error;
    }
}, {
    connection: redisWorker,
    limiter: { max: 1, duration: 1500 }
});

// --- Express App ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.set('trust proxy', 1);

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// --- HTML Page Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Dashboard.html'));
});

app.get('/manage', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ManageSubscriptions.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Session Middleware (MemoryStore for development) ---
// Note: Sessions will be lost on server restart
// TODO: Debug RedisStore compatibility issue with Upstash
console.log("⚠️  Using MemoryStore for sessions (development only)");
const sessionStore = new session.MemoryStore();

app.use(session({
    store: sessionStore,
    name: 'sid',
    secret: process.env.SESSION_SECRET || "dev_secret_key_change_this",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        sameSite: IS_PRODUCTION ? 'none' : 'lax'
    }
}));

// --- Core Logic Helper ---
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

// --- API Endpoints ---

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

// --- AUTHENTICATION ENDPOINTS ---

const loginAttempts = new Map();
function checkRateLimit(ip, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || [];
    const recentAttempts = attempts.filter(time => now - time < windowMs);

    if (recentAttempts.length >= maxAttempts) {
        return false;
    }

    recentAttempts.push(now);
    loginAttempts.set(ip, recentAttempts);
    return true;
}

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ error: passwordValidation.errors.join(', ') });
        }

        const existingUser = await redisDb.get(`user:${email}`);
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists' });
        }

        const passwordHash = await hashPassword(password);
        const userId = crypto.randomUUID();
        const user = {
            id: userId,
            email,
            name: name || '',
            passwordHash,
            createdAt: new Date().toISOString()
        };

        await redisDb.set(`user:${email}`, JSON.stringify(user));
        await redisDb.set(`userId:${userId}`, email);

        req.session.userId = userId;
        req.session.email = email;

        console.log(`✅ New user registered: ${email}`);
        res.json({
            status: 'success',
            user: { id: userId, email, name: user.name }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    try {
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
        }

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const userRaw = await redisDb.get(`user:${email}`);
        if (!userRaw) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = JSON.parse(userRaw);

        const passwordValid = await comparePassword(password, user.passwordHash);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        req.session.userId = user.id;
        req.session.email = user.email;

        console.log(`🔐 User logged in: ${email}`);
        res.json({
            status: 'success',
            user: { id: user.id, email: user.email, name: user.name }
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout Error:', err);
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('sid');
        res.json({ status: 'success' });
    });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
        user: {
            id: req.session.userId,
            email: req.session.email
        }
    });
});

// --- SUBSCRIPTION ENDPOINTS ---

app.post('/api/subscribe', async (req, res) => {
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
            times: {
                morning: { start: morningStart, end: morningEnd },
                evening: { start: eveningStart, end: eveningEnd }
            },
            createdAt: new Date().toISOString(),
            active: true
        };

        await redisDb.set(`subscription:${subId}`, JSON.stringify(subscription));
        await redisDb.sadd('subscriptions:all', subId);
        await redisDb.sadd(`user_subs:${email}`, subId);

        console.log(`📝 New subscription: ${email} [${fromCode}->${toCode}]`);
        res.json({ status: "success", id: subId });

    } catch (error) {
        console.error("Subscription Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/api/subscriptions', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });

    try {
        const subIds = await redisDb.smembers(`user_subs:${email}`);
        if (subIds.length === 0) return res.json([]);

        const keys = subIds.map(id => `subscription:${id}`);
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

app.delete('/api/subscription/:id', async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;

    try {
        const subRaw = await redisDb.get(`subscription:${id}`);
        if (!subRaw) return res.status(404).json({ error: "Not found" });

        const sub = JSON.parse(subRaw);
        const userEmail = email || sub.email;

        await redisDb.del(`subscription:${id}`);
        await redisDb.srem('subscriptions:all', id);

        if (userEmail) {
            await redisDb.srem(`user_subs:${userEmail}`, id);
        }

        console.log(`🗑️ Deleted subscription: ${id}`);
        res.json({ status: "deleted" });

    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete" });
    }
});

// --- Server Startup ---
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