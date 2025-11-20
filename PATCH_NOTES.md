Patch Notes

v1.6.3 - Refund Logic & Visual Clarity

Status: Ready for Deployment

🎨 Dashboard Visuals

High-Impact Status Cards: Replaced the outlined KPI widgets with bold, solid-color cards to improve readability and visual hierarchy.

Cancelled: Solid Red background.

Severe (120+): Solid Darker Red background.

Major (60+): Solid Orange background.

Medium (30+): Solid Amber background.

Minor (15+): Solid Yellow background.

🧮 Logic Updates

Refund Calculation Refinement: Updated the estimated refund logic (calculateKPIs) to reflect a "Best Case Claim" scenario.

Per-Leg Maximum: Instead of summing refunds for every delayed train found, the system now groups results by journey leg (Date + Direction).

Summation: It identifies the single highest refund amount for each leg and sums these maximums to provide a more realistic total estimated claim for the period.

v1.6.2 - Dashboard & Splash UX Refinements

Status: Implemented

🎨 Visual & UX Enhancements

Station Defaults Removed: Inputs start empty with placeholders.

Splash Page Consistency: Updated "Get Free Alerts" to use Time Ranges.

TOC Badges: Added visual indicators for Train Operating Companies (e.g., GWR, SWR).

v1.6.1 - Subscription Data Capture

Status: Implemented

📧 Feature: Email Alerts (Phase 1)

Subscription Logging: Implemented backend infrastructure to capture user interest.

New API Endpoint: Added POST /api/subscribe.

Frontend Integration: Connected Splash Page form to the backend.

v1.6.0 - Membership Tiers & Splash Page

Status: Implemented

🚀 New Features

Public Splash Page: Introduced index.html as the public landing page.

Premium Dashboard Route: Moved tool to /app.

⚙️ Backend Updates

Route Restructuring: Serving distinct pages for root and app routes.

v1.5.3 - Compliance & Asset Fixes

Status: Implemented

⚖️ Legal & Compliance

Data Attribution: Added footer acknowledging National Rail data.

🎨 UI & Assets

Icon Reference: Fixed train_icon.png pathing.

v1.5.2 - Queue UX Refinements

Status: Implemented

🖥️ Frontend Enhancements

Visual Progress Bar: Added determinate progress bar.

Persistent Search Sessions: Jobs resume after refresh.

Distinct Data Badges: Added "Cached" vs. "Live" indicators.

v1.5.1 - Queue Cache Optimization

Status: Implemented

⚡ Performance

Pre-Queue Cache Check: Server checks Redis before queuing.

v1.5.0 - Asynchronous Queuing System

Status: Implemented

⚡ Architecture Update

Asynchronous Job Queue: Integrated BullMQ/Redis.

v1.4.0 - Performance Optimization & Cleanup

Status: Implemented

⚡ Performance

Server-Side Caching: Implemented Redis caching.

🧹 Codebase Cleanup

Removed Background Worker: Deleted standalone script.

v1.3.0 - Security & Data Optimization

Status: Implemented

🔒 Security

Environment Security: Secured API keys.

Git Hygiene: Added .gitignore.

💾 Data

Dynamic Station Data: Switched to stations.json.

v1.2.0 - Full Stack Architecture

Status: Implemented

🚀 Architecture

Express.js Proxy Server: Added server.mjs.

v1.0.0 - Initial Mobile Release

Status: Legacy / Foundation