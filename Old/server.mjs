import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';

// --- Configuration ---
// Make sure to replace these with your new credentials
const CONSUMER_KEY = "DKxUSPBIKGI4oGxB9bdHmarNnTLPhbxXE6Ji3QePYdx2TBEU";
// --------------------------------------------------

// API URLs
const METRICS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceMetrics";
const DETAILS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceDetails";
const PORT = 3000;

// --- HTTPS Server Setup ---
// Read the SSL certificate files
const httpsOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const app = express();

// --- Middleware ---
// Enable CORS for all requests
app.use(cors());
// Parse JSON request bodies
app.use(express.json());

/**
 * Proxy endpoint for /serviceMetrics
 * Fetches a list of services for a given set of criteria.
 */
app.post('/api/servicemetrics', async (req, res) => {
    // Get the payload from the frontend
    const payload = req.body;
    
    // FIX: If to_date is missing, but from_date exists, copy it over.
    if (!payload.to_date && payload.from_date) {
        payload.to_date = payload.from_date;
    }

    try {
        const apiResponse = await fetch(METRICS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-apikey': CONSUMER_KEY 
            },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            // Forward the error from the API
            res.status(apiResponse.status).json(JSON.parse(errorText));
            return;
        }

        const data = await apiResponse.json();
        res.json(data); // Send the data back to the frontend

    } catch (error) {
        console.error("Error in /api/servicemetrics:", error);
        res.status(500).json({ error: 'An internal server error occurred', details: error.message });
    }
});

/**
 * Proxy endpoint for /serviceDetails
 * Fetches the full details (all stops) for a single train RID.
 */
app.post('/api/servicedetails', async (req, res) => {
    try {
        const apiResponse = await fetch(DETAILS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-apikey': CONSUMER_KEY
            },
            body: JSON.stringify(req.body) // Forward the RID from the frontend
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            // Forward the error from the API
            res.status(apiResponse.status).json(JSON.parse(errorText));
            return;
        }

        const data = await apiResponse.json();
        res.json(data); // Send the data back to the frontend

    } catch (error) {
        console.error("Error in /api/servicedetails:", error);
        res.status(500).json({ error: 'An internal server error occurred', details: error.message });
    }
});


// --- Start the Server ---
https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`Rail API proxy server listening on https://localhost:${PORT}`);
});

