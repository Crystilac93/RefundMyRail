Patch Notes

v1.10.0 - Mobile UI Optimization

Status: Ready for Deployment

📱 New Feature: Mobile-First Responsive Design

Touch-Optimized Interface: Created dedicated mobile.css stylesheet with comprehensive mobile optimizations.
iOS Zoom Prevention: All form inputs now use 16px minimum font size to prevent unwanted zoom behavior on iOS devices.
Touch Target Compliance: All interactive elements (buttons, inputs, checkboxes) meet the 44px minimum size recommended by Apple and Google accessibility guidelines.
Responsive Typography: Font sizes and spacing scale appropriately across mobile, tablet, and desktop viewports.
Enhanced Table Display: Journey details table cards are optimized for mobile with improved touch targets for claim buttons.
Reduced Padding: Dashboard cards and hero elements use responsive padding to maximize screen real estate on smaller devices.

v1.9.0 - Direct Claim Integration

Status: Ready for Deployment

🔗 New Feature: Direct "Claim" Links

Actionable Insights: The results table now includes a "Claim" column.
Smart Linking: Automatically detects the Train Operating Company (TOC) for delayed journeys and provides a direct link to their specific Delay Repay claim form.
Eligibility Logic: The "Claim" button only appears for journeys that meet the compensation threshold (15+ minute delay or cancellation).
Fallback Search: For smaller operators without a direct mapped URL, the system generates a targeted Google Search link to help users find the right form instantly.

v1.8.0 - Marketing Overhaul & Refund Estimator

Status: Deployed

🚀 New Feature: Instant Refund Estimator

Interactive Hero Tool: Replaced static buttons on the splash page with a dynamic calculator.
Statistical Engine: Estimates potential annual refunds instantly using station geolocation (Haversine formula) and national performance heuristics.

🎨 UI & Layout Refinements

Desktop Optimization: Increased the Dashboard container width (max-w-5xl) to provide breathing room for data tables on larger screens.
Conversion Flow: Moved the email subscription form to a dedicated "Call to Action" section at the bottom of the landing page.

v1.7.2 - UI Standardization & Layout Fixes

Status: Deployed

🖥️ Dashboard UX & Fixes

Table Layout Fix: Corrected column alignment in the results table.
Terminology: Renamed "TOC" column to "Rail Operator" for clarity.
Visual Consistency: Standardized the Header (Navigation) and Footer across all pages.

v1.7.0 - Subscription Management & Persistence

Status: Deployed

📧 Feature: Subscription Manager

Self-Service Portal: Added a dedicated "Manage Subscriptions" page (/manage).
View Alerts: Users can now log in via email to see all their active route alerts.
Delete Control: Added the ability for users to delete specific route subscriptions instantly.

⚙️ Backend & Architecture

Dual Redis Strategy: Split the Redis connection into two distinct clients (Cache vs. Database).
Upstash TLS Auto-Fix: Added logic to automatically upgrade connection strings to rediss://.