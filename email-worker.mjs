import 'dotenv/config';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import Redis from 'ioredis';
import crypto from 'crypto';
import { Queue, QueueEvents } from 'bullmq';

// --- Configuration ---
const CONSUMER_KEY = process.env.RAIL_API_KEY;
const REDIS_URL_CACHE = process.env.REDIS_URL;
const REDIS_URL_DB = process.env.REDIS_URL_DB || process.env.REDIS_URL;
const METRICS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceMetrics";
const DETAILS_URL = "https://api1.raildata.org.uk/1010-historical-service-performance-_hsp_v1/api/v1/serviceDetails";

// Default Ticket Price (Annual / 464)
const DEFAULT_TICKET_PRICE = 7437.92;
const JOURNEYS_PER_YEAR = 464;
const PER_JOURNEY_PRICE = DEFAULT_TICKET_PRICE / JOURNEYS_PER_YEAR;

// --- Redis Connection ---
function createRedisClient(connectionString, name, options = {}) {
    if (!connectionString) {
        console.warn(`⚠️  ${name} URL is missing.`);
        return null;
    }
    let url = connectionString;
    if (url.includes('upstash.io') && url.startsWith('redis://')) {
        url = url.replace('redis://', 'rediss://');
    }
    const client = new Redis(url, { family: 0, ...options });
    client.on('error', (err) => console.error(`❌ ${name} Redis Error:`, err));
    return client;
}

const redisCache = createRedisClient(REDIS_URL_CACHE, "WorkerCache");
const redisDb = createRedisClient(REDIS_URL_DB, "WorkerDB");

// --- BullMQ Setup ---
// Reuse the same queue name as the server to share rate limiting
const searchQueue = new Queue('rail-search-queue', { connection: redisCache });
const queueEvents = new QueueEvents('rail-search-queue', {
    connection: createRedisClient(REDIS_URL_CACHE, "WorkerQueueEvents", { maxRetriesPerRequest: null })
});

// --- Email Transporter ---
// --- Email Transporter ---
// Uses SMTP settings from env, or falls back to a console logger for dev if missing
const smtpPort = process.env.SMTP_PORT || 587;
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort == 465, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// --- Helper Functions ---
function getCacheKey(endpoint, payload) {
    const dataString = endpoint + JSON.stringify(payload);
    return crypto.createHash('md5').update(dataString).digest('hex');
}

async function fetchViaQueue(type, payload) {
    const cacheKey = getCacheKey(type, payload);

    // 1. Try Cache first (fast path)
    try {
        const cached = await redisCache.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) {
        console.warn("Cache check failed", e);
    }

    // 2. Add to Queue (enforces rate limiting via server worker)
    const job = await searchQueue.add(type, { type, payload, cacheKey });

    // 3. Wait for completion
    try {
        // Wait up to 30s for the job to finish
        const result = await job.waitUntilFinished(queueEvents, 30000);
        return result;
    } catch (e) {
        console.error(`Job ${job.id} failed or timed out:`, e);
        return null;
    }
}

function getWeekDays() {
    const today = new Date();
    // If running on Friday, we want Mon-Fri of this week.
    // If today is Friday (day 5), Monday is today - 4.
    const day = today.getDay(); // 0-6
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(today.setDate(diff));

    const days = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

function calculateRefund(delay, isCancelled) {
    if (isCancelled) return { amount: PER_JOURNEY_PRICE * 0.5, label: '50%' };
    if (delay >= 120) return { amount: PER_JOURNEY_PRICE * 2, label: '200%' };
    if (delay >= 60) return { amount: PER_JOURNEY_PRICE * 1, label: '100%' };
    if (delay >= 30) return { amount: PER_JOURNEY_PRICE * 0.5, label: '50%' };
    if (delay >= 15) return { amount: PER_JOURNEY_PRICE * 0.25, label: '25%' };
    return { amount: 0, label: '0%' };
}

// --- Main Logic ---
async function processSubscriptions() {
    console.log("📧 Starting Weekly Email Worker...");

    const subIds = await redisDb.smembers('subscriptions:all');
    console.log(`Found ${subIds.length} subscriptions.`);

    const days = getWeekDays();
    console.log(`Processing for week: ${days[0]} to ${days[4]}`);

    for (const id of subIds) {
        try {
            const subRaw = await redisDb.get(`subscription:${id}`);
            if (!subRaw) continue;
            const sub = JSON.parse(subRaw);

            if (!sub.active) continue;

            console.log(`Processing sub for ${sub.email} (${sub.route.from} -> ${sub.route.to})`);
            const results = await getJourneyResults(sub, days);

            if (results.length > 0) {
                await sendEmail(sub.email, results);
            } else {
                console.log(`No delays found for ${sub.email}, skipping email.`);
            }

        } catch (error) {
            console.error(`Error processing subscription ${id}:`, error);
        }
    }
    console.log("📧 Weekly Email Worker Finished.");
}

// --- TOC Links ---
const TOC_LINKS = {
    'GW': 'https://www.gwr.com/help-and-support/refunds-and-compensation/delay-repay',
    'SW': 'https://www.southwesternrailway.com/contact-and-help/refunds-and-compensation/delay-repay',
    'VT': 'https://www.avantiwestcoast.co.uk/help-and-support/delay-repay',
    'SE': 'https://www.southeasternrailway.co.uk/help-and-contact/refunds-and-compensation-claims/delay-repay',
    'SN': 'https://www.southernrailway.com/help-and-support/delay-repay',
    'TL': 'https://www.thameslinkrailway.com/help-and-support/delay-repay',
    'GN': 'https://www.greatnorthernrail.com/help-and-support/delay-repay',
    'KX': 'https://www.gatwickexpress.com/help-and-support/delay-repay',
    'LM': 'https://www.londonnorthwesternrailway.co.uk/about-us/delay-repay',
    'EM': 'https://www.eastmidlandsrailway.co.uk/help-manage/delay-repay',
    'NE': 'https://www.lner.co.uk/support/delay-repay/',
    'NT': 'https://www.northernrailway.co.uk/help/delay-repay',
    'TP': 'https://www.tpexpress.co.uk/help/delay-repay-compensation',
    'XC': 'https://www.crosscountrytrains.co.uk/customer-service/delay-repay',
    'CC': 'https://www.c2c-online.co.uk/help-feedback/delay-repay/',
    'CH': 'https://www.chilternrailways.co.uk/delayrepay15',
    'GA': 'https://www.greateranglia.co.uk/about-us/our-performance/delay-repay',
    'AW': 'https://tfw.wales/help-and-contact/rail/delay-repay',
    'SR': 'https://www.scotrail.co.uk/plan-your-journey/refunds-and-compensation/delay-repay',
    'GX': 'https://www.gatwickexpress.com/help-and-support/delay-repay'
};

async function getJourneyResults(sub, days) {
    const journeys = [
        { type: "Outbound", from: sub.route.from, to: sub.route.to, start: sub.times.morning.start, end: sub.times.morning.end },
        { type: "Inbound", from: sub.route.to, to: sub.route.from, start: sub.times.evening.start, end: sub.times.evening.end }
    ];

    let allServices = [];

    for (const date of days) {
        for (const journey of journeys) {
            const payload = {
                from_loc: journey.from,
                to_loc: journey.to,
                from_time: journey.start.replace(':', ''),
                to_time: journey.end.replace(':', ''),
                from_date: date,
                to_date: date,
                days: "WEEKDAY"
            };

            const metrics = await fetchViaQueue('metrics', payload);
            if (!metrics || !metrics.Services) continue;

            for (const s of metrics.Services) {
                const rid = s.serviceAttributesMetrics?.rids?.[0];
                if (!rid) continue;

                const detailsPayload = { rid };
                const details = await fetchViaQueue('details', detailsPayload);

                if (details) {
                    const locs = details.serviceAttributesDetails?.locations || [];
                    const dep = locs.find(l => l.location === journey.from);
                    const arr = locs.find(l => l.location === journey.to);

                    if (dep && arr) {
                        const isCancelled = !arr.actual_ta || arr.actual_ta === "";
                        let delay = 0;
                        if (!isCancelled) {
                            const schTime = parseApiTime(arr.gbtt_pta);
                            const actTime = parseApiTime(arr.actual_ta);
                            if (schTime && actTime) {
                                if (actTime < schTime - 43200000) actTime.setDate(actTime.getDate() + 1);
                                delay = Math.max(0, Math.round((actTime - schTime) / 60000));
                            }
                        }

                        if (isCancelled || delay >= 15) {
                            const refund = calculateRefund(delay, isCancelled);
                            allServices.push({
                                date,
                                type: journey.type,
                                schDep: dep.gbtt_ptd,
                                actArr: isCancelled ? 'Cancelled' : arr.actual_ta,
                                delay,
                                isCancelled,
                                isCancelled,
                                refund,
                                toc: details.serviceAttributesDetails?.toc_code
                            });
                        }
                    }
                }
            }
        }
    }
    return allServices;
}

function parseApiTime(timeStr) {
    if (!timeStr || timeStr.length !== 4) return null;
    const h = parseInt(timeStr.substring(0, 2), 10);
    const m = parseInt(timeStr.substring(2, 4), 10);
    return new Date(1970, 0, 1, h, m, 0);
}

function generateEmailHtml(results, totalRefund) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Weekly Refund Report</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f8fafc; color: #334155;">
        <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; margin-top: 40px; margin-bottom: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            
            <!-- Header -->
            <div style="background-color: #10b981; padding: 32px 24px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.025em;">RefundMyRail</h1>
                <p style="margin: 8px 0 0; color: #ecfdf5; font-size: 16px; font-weight: 500;">Weekly Delay Report</p>
            </div>

            <!-- Content -->
            <div style="padding: 32px 24px;">
                <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5;">Here is your potential refund summary for this week.</p>
                
                <!-- KPI Card -->
                <div style="background: linear-gradient(to right, #10b981, #0d9488); color: white; padding: 32px; border-radius: 12px; text-align: center; margin-bottom: 32px; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.2);">
                    <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; opacity: 0.9;">Potential Refund</div>
                    <div style="font-size: 48px; font-weight: 800; margin: 8px 0;">£${totalRefund.toFixed(2)}</div>
                    <div style="font-size: 12px; opacity: 0.8;">*Estimated based on avg annual ticket</div>
                </div>

                <!-- Table -->
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background-color: #f1f5f9; text-align: left;">
                                <th style="padding: 16px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; border-radius: 8px 0 0 8px;">Date</th>
                                <th style="padding: 16px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">Operator</th>
                                <th style="padding: 16px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">Dep</th>
                                <th style="padding: 16px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">Arr</th>
                                <th style="padding: 16px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">Delay</th>
                                <th style="padding: 16px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">Refund</th>
                                <th style="padding: 16px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; border-radius: 0 8px 8px 0;">Claim</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results.map(r => {
        const claimLink = TOC_LINKS[r.toc] || `https://www.google.com/search?q=${r.toc}+delay+repay`;
        const tocCode = r.toc || 'UNK';
        return `
                                <tr style="border-bottom: 1px solid #e2e8f0;">
                                    <td style="padding: 16px; color: #334155; font-weight: 500;">${r.date}</td>
                                    <td style="padding: 16px;">
                                        <span style="display: inline-block; padding: 4px 8px; background-color: #f1f5f9; color: #475569; border-radius: 6px; font-size: 12px; font-weight: 700;">${tocCode}</span>
                                    </td>
                                    <td style="padding: 16px; font-family: monospace; color: #334155;">${formatTime(r.schDep)}</td>
                                    <td style="padding: 16px; font-family: monospace; color: ${r.isCancelled ? '#ef4444' : '#334155'};">${formatTime(r.actArr)}</td>
                                    <td style="padding: 16px; font-weight: 700; color: ${r.delay >= 30 ? '#ef4444' : '#f59e0b'};">
                                        ${r.isCancelled ? 'Cancelled' : r.delay + 'm'}
                                    </td>
                                    <td style="padding: 16px; color: #10b981; font-weight: 700;">£${r.refund.amount.toFixed(2)}</td>
                                    <td style="padding: 16px;">
                                        <a href="${claimLink}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #d1fae5; color: #047857; text-decoration: none; border-radius: 9999px; font-size: 12px; font-weight: 700;">
                                            Claim &rarr;
                                        </a>
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
                
                <p style="margin-top: 32px; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.5;">
                    This is an automated report. Please verify with official operator data before claiming.
                </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 32px 24px; border-top: 1px solid #e2e8f0; text-align: center;">
                <div style="margin-bottom: 16px;">
                    <span style="font-weight: 700; color: #94a3b8; font-size: 14px;">RefundMyRail</span>
                </div>
                <p style="margin: 4px 0; font-size: 12px; color: #cbd5e1;">&copy; 2025 RefundMyRail.</p>
                <p style="margin: 4px 0; font-size: 12px; color: #cbd5e1;">Contains National Rail data © 2025. Source: Rail Delivery Group.</p>
                <p style="margin: 4px 0; font-size: 11px; color: #cbd5e1; margin-top: 12px;">RefundMyRail is an independent tool and is not affiliated with National Rail.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

async function sendEmail(email, results) {
    const totalRefund = results.reduce((sum, r) => sum + r.refund.amount, 0);
    const html = generateEmailHtml(results, totalRefund);

    if (!process.env.SMTP_USER) {
        console.log(`[MOCK EMAIL] To: ${email}, Subject: Weekly Refund Report, Body Length: ${html.length}`);
        return;
    }

    await transporter.sendMail({
        from: '"RefundMyRail" <noreply@refundmyrail.co.uk>',
        to: email,
        subject: `🚆 Weekly Refund Report: £${totalRefund.toFixed(2)}`,
        html
    });
    console.log(`✅ Email sent to ${email}`);
}

function formatTime(t) {
    if (!t || t.length !== 4) return '--:--';
    return `${t.substr(0, 2)}:${t.substr(2, 2)}`;
}

// --- Schedule ---
// Run every Friday at 19:00 (7 PM)
console.log("📅 Scheduling Weekly Email Worker for Fridays at 19:00");
cron.schedule('0 19 * * 5', () => {
    processSubscriptions();
});

// Export for manual triggering if needed
export { processSubscriptions, generateEmailHtml };
