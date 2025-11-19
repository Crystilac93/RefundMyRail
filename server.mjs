import express from 'express';
import cors from 'cors';
import https from 'https';
import http from 'http'; // Import http module
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
const CONSUMER_KEY = process.env.RAIL_API_KEY; // Removed fallback string for security

// Validate Key Presence
if (!CONSUMER_KEY) {
    console.error("❌ FATAL ERROR: RAIL_API_KEY is not defined in environment variables.");
    console.error("   Please set this variable in your Render dashboard or local .env file.");
    process.exit(1); // Exit process if key is missing to prevent running in a broken state
}

const METRICS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceMetrics";
const DETAILS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceDetails";

const PORT = process.env.PORT || 3000;
// Determine if we are in a production environment (Cloud) or local development
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Endpoints (Same as before) ---
app.post('/api/servicemetrics', async (req, res) => {
    // ... (Keep existing logic) ...
    const payload = req.body;
    if (!payload.to_date && payload.from_date) payload.to_date = payload.from_date;

    try {
        const apiResponse = await fetch(METRICS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-apikey': CONSUMER_KEY },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
             const errorText = await apiResponse.text();
             try { return res.status(apiResponse.status).json(JSON.parse(errorText)); } 
             catch (e) { return res.status(apiResponse.status).json({ error: errorText }); }
        }
        const data = await apiResponse.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/servicedetails', async (req, res) => {
    // ... (Keep existing logic) ...
    try {
        const apiResponse = await fetch(DETAILS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-apikey': CONSUMER_KEY },
            body: JSON.stringify(req.body)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
             try { return res.status(apiResponse.status).json(JSON.parse(errorText)); } 
             catch (e) { return res.status(apiResponse.status).json({ error: errorText }); }
        }
        const data = await apiResponse.json();
        res.json(data); 
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'DelayRepayChecker.html'));
});

// --- Start Server ---

if (IS_PRODUCTION) {
    // CLOUD DEPLOYMENT (Render, Heroku, etc.)
    // Cloud providers handle SSL termination at their edge. 
    // We just run a plain HTTP server on the port they assign.
    http.createServer(app).listen(PORT, () => {
        console.log(`🚀 Production server running on port ${PORT} (HTTP)`);
    });
} else {
    // LOCAL DEVELOPMENT
    // We use our local certificates to simulate HTTPS.
    try {
        const httpsOptions = {
            key: fs.readFileSync('key.pem'),
            cert: fs.readFileSync('cert.pem')
        };
        https.createServer(httpsOptions, app).listen(PORT, () => {
            console.log(`🔒 Local development server running on https://localhost:${PORT}`);
        });
    } catch (e) {
        console.warn("⚠️  SSL keys not found. Falling back to HTTP for local dev.");
        console.warn("    (Run 'mkcert localhost' if you want HTTPS locally)");
        http.createServer(app).listen(PORT, () => {
            console.log(`⚠️  Local server running on http://localhost:${PORT}`);
        });
    }
}