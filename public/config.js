// This file contains configuration constants for the Rail Delay Finder application.

// --- API Endpoints ---
// Use relative paths. This automatically directs requests to the server hosting the page.
const METRICS_URL = '/api/servicemetrics';
const DETAILS_URL = '/api/servicedetails';

// --- Rate Limiting ---
const RATE_LIMIT_DELAY = 1500;
const RETRY_DELAY = 1500;

// --- Calculation Constants ---
const JOURNEYS_PER_YEAR = 464;