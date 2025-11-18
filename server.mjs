import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
// Use environment variable for API Key in production, or fallback for local testing
const CONSUMER_KEY = process.env.RAIL_API_KEY || "YOUR_NEW_CONSUMER_KEY"; 
const METRICS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceMetrics";
const DETAILS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceDetails";

// Cloud hosts (like Render/Railway) provide a PORT variable. We must use it.
const PORT = process.env.PORT || 3000;
const RATE_LIMIT_DELAY = 1500;

// Setup pathing for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Serve Static Files (Frontend) ---
// This tells the server: "Look in the 'public' folder for html/js/css files"
app.use(express.static(path.join(__dirname, 'public')));

// Utility function for delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- API Endpoints ---

app.post('/api/servicemetrics', async (req, res) => {
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
             // Handle non-JSON error responses gracefully
             try {
                return res.status(apiResponse.status).json(JSON.parse(errorText));
             } catch (e) {
                return res.status(apiResponse.status).json({ error: errorText });
             }
        }

        const data = await apiResponse.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/servicedetails', async (req, res) => {
    try {
        const apiResponse = await fetch(DETAILS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-apikey': CONSUMER_KEY },
            body: JSON.stringify(req.body)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
             try {
                return res.status(apiResponse.status).json(JSON.parse(errorText));
             } catch (e) {
                return res.status(apiResponse.status).json({ error: errorText });
             }
        }

        const data = await apiResponse.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// --- Catch-All Route ---
// If a user visits the homepage, send them the main app file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'DelayRepayChecker.html'));
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});