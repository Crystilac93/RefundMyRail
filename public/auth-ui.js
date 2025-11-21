// auth-ui.js - Shared authentication UI utilities

// Check auth status and update UI accordingly
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/me', {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            return { isAuthenticated: true, user: data.user };
        } else {
            return { isAuthenticated: false, user: null };
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        return { isAuthenticated: false, user: null };
    }
}

// Update navigation based on auth state
function updateNavigation(authState) {
    const navLinks = document.getElementById('nav-links');
    const userMenu = document.getElementById('user-menu');

    if (!navLinks || !userMenu) return;

    if (authState.isAuthenticated) {
        // Hide login/register, show user menu
        navLinks.innerHTML = `
            <a href="/app" class="text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors">Dashboard</a>
            <a href="/manage" class="hidden sm:block text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors">Manage Alerts</a>
        `;
        userMenu.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-sm text-slate-600 hidden sm:inline">${authState.user.email}</span>
                <button onclick="handleLogout()" class="text-sm font-bold text-slate-600 hover:text-red-600 transition-colors">
                    Logout
                </button>
            </div>
        `;
    } else {
        // Show login/register
        navLinks.innerHTML = `
            <a href="/app" class="text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors">Dashboard</a>
            <a href="/manage" class="hidden sm:block text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors">Alerts</a>
        `;
        userMenu.innerHTML = `
            <a href="/login" class="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors">
                Login
            </a>
        `;
    }
}

// Handle logout
async function handleLogout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            window.location.href = '/';
        } else {
            alert('Logout failed. Please try again.');
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('Logout failed. Please try again.');
    }
}

// Initialize auth UI on page load
async function initAuthUI() {
    const authState = await checkAuthStatus();
    updateNavigation(authState);
    return authState;
}

// Protect route - redirect to login if not authenticated
async function requireAuth(redirectTo = '/login') {
    const authState = await checkAuthStatus();
    if (!authState.isAuthenticated) {
        const currentPath = window.location.pathname;
        window.location.href = `${redirectTo}?redirect=${encodeURIComponent(currentPath)}`;
        return false;
    }
    return true;
}
