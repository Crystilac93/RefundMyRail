# Changelog

All notable changes to RefundMyRail will be documented in this file.

## [0.1.3] - 2025-11-21

### 🎨 UI/UX Improvements
- **Email Preview Modal**
  - Implemented a new "See Example Email" modal on the landing page.
  - Modal is now fully responsive with a max-width of 800px and max-height of 90vh.
  - Added a dark overlay backdrop that prevents page scrolling when the modal is open.
  - Removed the close button in favor of clicking the overlay or pressing Escape to close.
  - Improved modal styling with cleaner padding and shadow effects.

- **Email Template**
  - Refined the HTML structure of the email preview for better readability.
  - Updated the "Potential Refund" KPI card styling.
  - Cleaned up the table layout for delay reports.

## [0.1.2] - 2025-11-21

### 🔧 Backend Improvements
- **Email Worker Enhancement**
  - Enhanced email worker reliability and error handling
  - Improved duplicate entry handling in weekly delay processing
  - Fixed double-assignment issue in journey results compilation
  - Optimized worker connection management for Redis instances
  - Better separation between cache and database connections

### 📊 Technical Updates
- Refined `email-worker.mjs` for more robust subscription processing
- Improved data structure handling in journey results array
- Enhanced error logging for better diagnostics

## [0.1.1] - 2025-11-21

### 🎨 Dashboard UI Improvements
- **Autocomplete System Rebuild**
  - Completely rebuilt Dashboard autocomplete functionality
  - Implemented clean, maintainable autocomplete matching system from `index.html`
  - Fixed station search reliability issues
  - Enhanced user experience with consistent autocomplete behavior across all pages
  
- **Code Structure**
  - Cleaned up Dashboard codebase for better maintainability
  - Standardized autocomplete implementation across the application
  - Retained all existing journey search, KPI, and results functionality

### 🐛 Bug Fixes
- Fixed autocomplete dropdown positioning and visibility
- Resolved station code matching inconsistencies
- Improved input field validation and user feedback

## [0.0.1] - Pre‑authentication development
## [0.1.0] - 2025-11-21

### 🔐 Authentication System (NEW)
- **Added complete user authentication system**
  - User registration with email/password
  - Secure login with bcrypt password hashing
  - Session-based authentication using Express sessions
  - Rate limiting on login attempts (5 attempts per 15 minutes)
  - Password validation requirements (8+ chars, uppercase, lowercase, number)
  - Email format validation
  
- **Authentication API Endpoints**
  - `POST /api/auth/register` - Create new user account
  - `POST /api/auth/login` - User login
  - `POST /api/auth/logout` - Session cleanup
  - `GET /api/auth/me` - Check authentication status

- **New Authentication Module** (`auth.mjs`)
  - Password hashing and comparison utilities
  - Email and password validation
  - Authentication middleware for protected routes

### 🎨 UI/UX Improvements
- **Renamed Dashboard Page**
  - `DelayRepayChecker.html` → `Dashboard.html`
  - Updated all navigation links to use `/app` route
  
- **Consistent Navigation Across All Pages**
  - Standardized header with logo and navigation links
  - Dynamic user menu showing login status
  - Login/Logout buttons that update based on auth state
  - Consistent footer across all pages
  
- **New Shared Authentication UI** (`auth-ui.js`)
  - Centralized authentication state management
  - Dynamic navigation updates based on login status
  - Automatic route protection for authenticated pages
  - Shared logout functionality

### 🔒 Route Protection
- **Client-Side Route Guards**
  - Dashboard (`/app`) requires authentication
  - ManageSubscriptions (`/manage`) requires authentication
  - Automatic redirect to login with return URL
  - Protected routes redirect unauthenticated users

### 🏗️ Backend Architecture
- **Enhanced Server Configuration**
  - Separate Redis instances for cache and user data
  - Session management with MemoryStore (development)
  - CORS configured for credentials
  - Trust proxy enabled for proper IP detection
  
- **Server Route Mappings**
  - `GET /` → `index.html`
  - `GET /app` → `Dashboard.html`
  - `GET /manage` → `ManageSubscriptions.html`
  - `GET /login` → `login.html`

- **User Data Storage**
  - User accounts stored in Redis (`user:email`)
  - User ID mapping (`userId:id`)
  - Passwords hashed with bcrypt (12 rounds)
  - Subscriptions linked to user accounts

### 📝 Updated Pages
- **index.html** - Integrated auth-ui.js, updated navigation
- **Dashboard.html** - Added route protection, updated navigation
- **ManageSubscriptions.html** - Added route protection, updated navigation
- **login.html** - New dual-mode login/register page with tab interface

### 🔧 Technical Details
- **Session Configuration**
  - 7-day session expiry
  - HttpOnly cookies for security
  - Secure cookies in production
  - SameSite policy configured by environment

- **Redis Data Organization**
  - User data: `user:{email}`, `userId:{id}`
  - Subscriptions: `subscription:{id}`, `user_subs:{email}`, `subscriptions:all`
  - Cache data: Hashed keys for API responses

### ⚠️ Known Issues
- Sessions use MemoryStore (lost on server restart)
  - RedisStore has compatibility issues with Upstash Redis
  - Production deployment will need alternative session storage solution

### 🔄 Migration Notes
- Existing subscriptions remain compatible
- Users need to register/create accounts
- No data migration required for existing subscriptions

## Previous Release
- Marketing overhaul & refund estimator improvements
- (Previous changelog entries preserved)

---

## Version Naming Convention
- **Major.Minor.Patch**
  - Major: Breaking changes or major feature additions
  - Minor: New features, backwards compatible
  - Patch: Bug fixes and minor improvements
