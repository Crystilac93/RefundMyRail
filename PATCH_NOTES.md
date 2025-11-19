Patch Notes

v1.5.1 - Queue UX Refinements

Status: Ready for Deployment

🖥️ Frontend Enhancements

Visual Progress Bar: Replaced the generic spinner with a determinate progress bar during the search process. It dynamically updates based on the stages of the job (Queueing -> Metrics -> Details -> Finalizing).

Persistent Search Sessions: Improved the "Resume on Refresh" capability. If a user refreshes the page while a search is processing, the application now attempts to reconnect to the active job ID stored in localStorage and resume monitoring without restarting the search.

Distinct Data Badges: Added clear visual indicators in the results area:

Blue "Cached Data" Badge: Shown if any part of the result was served from the Redis/local cache.

Green "Live Data" Badge: Shown if the result was freshly fetched from the National Rail API.

Improved Status Messages: Status text now provides more granular feedback (e.g., "Analyzing 5/10 trains...") rather than a generic loading message.

v1.5.0 - Asynchronous Queuing System

Status: Implemented

⚡ Architecture Update

Asynchronous Job Queue: Integrated BullMQ with Redis to manage search requests.

Problem Solved: Eliminates API rate limit errors (429 Too Many Requests) when multiple users search simultaneously.

Mechanism: Instead of synchronous processing, searches are now enqueued as jobs. A background worker processes them sequentially, respecting a strict rate limit (1 job per 1.5 seconds).

User Experience: The frontend now polls for job completion, showing a "Queuing search..." status instead of hanging or failing immediately.

Shared Benefits: The queue system leverages the existing Redis cache (v1.4.0). If User A searches for a route, the worker caches the result. If User B searches for the same route later, the worker serves it instantly from the cache without hitting the external API or queue delay.

🖥️ Frontend Updates

Polling Logic: Updated DelayRepayChecker.html to handle the new async workflow (Submit -> Get ID -> Poll Status -> Display Result).

v1.4.0 - Performance Optimization & Cleanup

Status: Implemented

⚡ Performance (Caching Strategy)

Server-Side Caching: Implemented a robust caching layer in server.mjs using ioredis.

Persistence: Uses Redis (via Upstash) to store API responses persistently.

Logic: Caches serviceMetrics requests only for past dates to ensure data integrity. serviceDetails are cached by RID.

🧹 Codebase Cleanup

Removed Background Worker: Deleted delay_checker.mjs and dependencies to focus on the web application.

v1.3.0 - Security & Data Optimization

Status: Implemented

🔒 Security & Infrastructure

Environment Security: Removed hardcoded fallback API keys.

Git Hygiene: Added *.pem to .gitignore.

Production Readiness: server.mjs switches between HTTP (Cloud) and HTTPS (Local).

💾 Data Management

Dynamic Station Data: Replaced hardcoded station list with dynamic stations.json fetch.

v1.2.0 - Full Stack Architecture

Status: Implemented

🚀 Architecture

Express.js Proxy Server: Added server.mjs to proxy API requests.

v1.0.0 - Initial Mobile Release

Status: Legacy / Foundation