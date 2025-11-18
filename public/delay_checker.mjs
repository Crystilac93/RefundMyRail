import fetch from 'node-fetch';
import notifier from 'node-notifier';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url'; // Required for getting directory name in ES Module

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
const API_KEY = process.env.RAIL_API_KEY; // Read API key from .env file
const METRICS_URL = 'https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceMetrics';
const DETAILS_URL = 'https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceDetails';
const RATE_LIMIT_DELAY = 1500; // ms between API calls
const RETRY_DELAY = 2000; // ms before retrying a rate-limited call

const journeys = [
    { type: "Outbound", from_loc: "DID", to_loc: "PAD", from_time: "0700", to_time: "0730" },
    { type: "Inbound", from_loc: "PAD", to_loc: "DID", from_time: "1700", to_time: "1730" }
];

const CLAIM_THRESHOLD_MINS = 15; // Minimum delay for a notification

// Determine __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Utility Functions ---
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatDateForAPI(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseApiTime(timeStr) {
    if (!timeStr || timeStr.length !== 4) return null;
    const h = parseInt(timeStr.substring(0, 2), 10), m = parseInt(timeStr.substring(2, 4), 10);
    return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

function calculateDelay(scheduled, actual) {
    if (!actual || actual === "") return Infinity; // Treat cancelled as Infinity
    const schTime = parseApiTime(scheduled), actTime = parseApiTime(actual);
    if (!schTime || !actTime) return 0;
    if (actTime.getTime() < schTime.getTime() - 43200000) actTime.setUTCDate(actTime.getUTCDate() + 1);
    const diffMs = actTime.getTime() - schTime.getTime(), diffMins = Math.round(diffMs / 60000);
    return diffMins > 0 ? diffMins : 0;
}

function formatTime(timeStr) {
    if (!timeStr || timeStr.length !== 4) return timeStr || 'N/A';
    return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}`;
}

// --- Main Logic ---
async function checkDelays() {
    let allServicesContext = [];
    let allRids = new Set();
    let failedMetrics = [];
    let delayedJourneys = [];
    let failedDetails = [];

    console.log(`Starting delay check for ${formatDateForAPI(new Date())}...`);
    if (!API_KEY || API_KEY === 'YOUR_X_APIKEY_HERE') {
        console.error("ERROR: RAIL_API_KEY not found in .env file. Please create a .env file and add your API key.");
        notifier.notify({
            title: 'Rail Delay Check Error',
            message: 'API Key is missing. Please check configuration.',
            icon: path.join(__dirname, 'train_icon.png'),
            sound: true,
            wait: false
        });
        return;
    }

    const todayStr = formatDateForAPI(new Date());

    // --- Step 1: Fetch Metrics for Today ---
    console.log("Fetching service lists...");
    for (const journey of journeys) {
        const payload = {
            from_loc: journey.from_loc, to_loc: journey.to_loc,
            from_time: journey.from_time, to_time: journey.to_time,
            from_date: todayStr, to_date: todayStr, // Only check today
            days: "WEEKDAY" // Assuming you only travel weekdays
        };

        let metricsResponse; let attempt = 1; let success = false;
        while (attempt <= 2 && !success) {
            try {
                metricsResponse = await fetch(METRICS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-apikey': API_KEY },
                    body: JSON.stringify(payload)
                });

                if (!metricsResponse.ok) {
                    if (metricsResponse.status === 429 && attempt === 1) {
                        console.warn(`Rate limit fetching list (${journey.type}). Retrying...`); await wait(RETRY_DELAY); attempt++; continue;
                    } else { throw new Error(`Metrics API Error ${metricsResponse.status}: ${await metricsResponse.text()}`); }
                }

                const metricsData = await metricsResponse.json();
                if (metricsData.Services) {
                    metricsData.Services.forEach(service => {
                        const rid = service.serviceAttributesMetrics?.rids?.[0];
                        if (rid && !allRids.has(rid)) {
                            allRids.add(rid);
                            allServicesContext.push({ rid, date: todayStr, journeyType: journey.type, from_loc: journey.from_loc, to_loc: journey.to_loc });
                        }
                    });
                }
                success = true;
            } catch (error) {
                console.error(`Error fetching metrics for ${journey.type} (Attempt ${attempt}):`, error.message);
                if (attempt === 2 || !error.message?.includes('429')) {
                     failedMetrics.push(`${journey.type} service list`);
                }
            } finally {
                 if (success || attempt >= 2) {
                     await wait(RATE_LIMIT_DELAY);
                 }
            }
             if (!success) attempt++;
        } // End while loop
    } // End journey loop

    if (allServicesContext.length === 0) {
        console.log("No relevant services found for today.");
        if(failedMetrics.length > 0) {
             notifier.notify({ title: 'Rail Delay Check Warning', message: `Could not fetch service lists: ${failedMetrics.join(', ')}`, sound: true, wait: false });
        }
        return;
    }

    // --- Step 2: Fetch Details ---
    console.log(`Found ${allServicesContext.length} potential services. Fetching details...`);

    for (let i = 0; i < allServicesContext.length; i++) {
        const context = allServicesContext[i];
        console.log(`Fetching details ${i + 1}/${allServicesContext.length} (RID: ${context.rid})...`);

        let detailsResponse; let detailsData; let attempt = 1; let success = false;
        while (attempt <= 2 && !success) {
            try {
                detailsResponse = await fetch(DETAILS_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-apikey': API_KEY },
                    body: JSON.stringify({ rid: context.rid })
                });

                if (!detailsResponse.ok) {
                    if (detailsResponse.status === 429 && attempt === 1) {
                        console.warn(`Rate limit fetching details for RID ${context.rid}. Retrying...`); await wait(RETRY_DELAY); attempt++; continue;
                    } else { throw new Error(`Details API Error ${detailsResponse.status}: ${await detailsResponse.text()}`); }
                }
                detailsData = await detailsResponse.json();
                success = true;
            } catch (error) {
                console.error(`Error fetching details for RID ${context.rid} (Attempt ${attempt}):`, error.message);
                 if (attempt === 2 || !error.message?.includes('429')) {
                     failedDetails.push(`RID ${context.rid} (${context.journeyType})`);
                 }
            } finally {
                 if (success || attempt >= 2) {
                     await wait(RATE_LIMIT_DELAY);
                 }
            }
            if (!success) attempt++;
        } // End while loop

        if (success && detailsData) {
            const serviceDetails = detailsData.serviceAttributesDetails;
            const locations = serviceDetails?.locations || [];
            const departureInfo = locations.find(loc => loc.location === context.from_loc);
            const arrivalInfo = locations.find(loc => loc.location === context.to_loc);

            if (departureInfo && arrivalInfo) {
                const delayMins = calculateDelay(arrivalInfo.gbtt_pta, arrivalInfo.actual_ta);
                const isCancelled = (!arrivalInfo.actual_ta || arrivalInfo.actual_ta === "");

                if (isCancelled || delayMins >= CLAIM_THRESHOLD_MINS) {
                    delayedJourneys.push({
                        type: context.journeyType,
                        schDep: formatTime(departureInfo.gbtt_ptd),
                        schArr: formatTime(arrivalInfo.gbtt_pta),
                        status: isCancelled ? "Cancelled" : `${delayMins} min delay`
                    });
                }
            } else {
                 console.warn(`Could not find departure/arrival info for RID ${context.rid}`);
                 failedDetails.push(`RID ${context.rid} (${context.journeyType}) - Incomplete Data`);
            }
        }
    } // End details fetch loop

    // --- Step 3: Send Notification ---
    console.log("Check complete.");
    let notificationTitle = 'Rail Delay Check Complete';
    let notificationMessage = "";
    
    // --- Compose Message ---
    if (delayedJourneys.length > 0) {
        notificationTitle = `ACTION REQUIRED: ${delayedJourneys.length} Potential Delay Repay Claims!`;
        notificationMessage = `Claims found for today (${todayStr}):\n`;
        delayedJourneys.forEach(j => {
            notificationMessage += `\n- ${j.type} (${j.schDep} - ${j.schArr}): ${j.status}`;
        });
        
        if (failedMetrics.length > 0 || failedDetails.length > 0) {
            notificationMessage += "\n\n(Note: Some data searches failed due to API rate limits.)";
        }

    } else {
        notificationTitle = 'Daily Rail Delay Check';
        notificationMessage = `No significant delays (${CLAIM_THRESHOLD_MINS}m+) found for your journeys today (${todayStr}).`;

        if (failedMetrics.length > 0 || failedDetails.length > 0) {
            notificationMessage += "\n\nWarning: Some API calls failed. Please check console for details.";
            notificationTitle = 'Daily Rail Check: Errors Present';
        }
    }
    
    console.warn("Failed to retrieve data for:", { metrics: failedMetrics, details: failedDetails });

    // The notification path logic remains the same
    const iconPath = path.join(__dirname, 'train_icon.png');

    notifier.notify({
        title: notificationTitle,
        message: notificationMessage,
        icon: iconPath.replace(/^\//, ''), // Remove leading slash if running on Windows path
        sound: true, // Play system notification sound
        wait: false, // Don't wait for user action
        // Optional: Use toast style for more modern look on Windows 10/11
        appID: 'Rail Delay Checker' // Needed for Windows 10/11 toast notifications
    }, (err, response) => {
        if (err) {
            console.error("Notification Error:", err);
        } else {
            console.log("Notification sent.");
        }
    });

}

// Run the check
checkDelays().catch(err => {
    console.error("Unhandled error during delay check:", err);
     notifier.notify({
        title: 'Rail Delay Check FAILED',
        message: `An unexpected error occurred: ${err.message}`,
        icon: path.join(__dirname, 'train_icon.png').replace(/^\//, ''),
        sound: true,
        wait: false,
        appID: 'Rail Delay Checker'
    });
});
