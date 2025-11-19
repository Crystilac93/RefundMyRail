Patch Notes

v1.3.0 - Security & Data Optimization

Status: Ready for Deployment

🔒 Security & Infrastructure

Environment Security: Removed hardcoded fallback API keys from server.mjs to ensure fail-secure behavior in production.

Git Hygiene:

Added *.pem to .gitignore to prevent leaking local SSL certificates.

Removed legacy Old/ directory and duplicate root assets (train_icon.png, train_icon.ico) to streamline the repository.

Production Readiness: server.mjs now correctly switches between HTTP (for cloud/Render) and HTTPS (for local development) based on NODE_ENV.

💾 Data Management

Dynamic Station Data: Replaced the hardcoded station list in station_data.js with a dynamic fetch from stations.json.

Benefit: Decouples data from logic, making it easier to update station lists without modifying application code.

Efficiency: The frontend now loads and processes the full UK station dataset at runtime, mapping only the necessary fields (name, code) for the autocomplete system.

v1.2.0 - Full Stack & Background Services

Status: Implemented

🚀 New Features (Backend & Automation)

Background Delay Checker: Added delay_checker.mjs, a standalone Node.js script.

Runs headlessly to check delays for specific commuter routes.

Triggers Native Desktop Notifications (via node-notifier) if delays exceed 15 minutes or if trains are cancelled.

Express.js Proxy Server: Added server.mjs.

Serves the frontend statically from the public/ directory.

Proxies API requests (/api/servicemetrics, /api/servicedetails) to raildata.org.uk to handle CORS and secure the API key.

📱 UI & UX (Frontend - v1.1 Refinements)

Search History: Added persistent history of recent searches (stored in LocalStorage).

Settings Panel: Refined slide-out panel for configuring Home/Work stations and annual ticket prices.

Autocomplete: Robust station search with CRS code lookup.

v1.0.0 - Initial Mobile Release

Status: Legacy / Foundation

⚙️ Core Functionality

Search Modes: Support for "Week View" and "Single Day" view.

Delay Calculation: Automatic retrieval and calculation of delay minutes vs. scheduled arrival.

Refund Logic: Tiered refund estimation (25% to 100%+) based on season ticket calculations.