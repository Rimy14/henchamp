/**
 * Simple Hash-Based Router for SPA Navigation
 */

class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.beforeNavigate = null;
        this.afterNavigate = null;
    }

    /**
     * Register a route
     */
    addRoute(path, config) {
        this.routes.set(path, {
            title: config.title || 'Page',
            view: config.view,
            script: config.script,
            allowedRoles: config.allowedRoles || ['Admin', 'Coordinator', 'Cashier'],
            init: config.init
        });
    }

    /**
     * Initialize router
     */
    init() {
        // Listen for hash changes
        window.addEventListener('hashchange', () => this.handleRoute());

        // Handle initial load
        this.handleRoute();
    }

    /**
     * Navigate to a route
     */
    async navigate(path) {
        window.location.hash = path;
    }

    /**
     * Handle route change
     */
    async handleRoute() {
        // Get current hash or default to '/'
        let path = window.location.hash.slice(1) || '/';

        // Remove query params if any
        path = path.split('?')[0];

        const route = this.routes.get(path);

        if (!route) {
            console.warn(`Route not found: ${path}`);
            this.navigate('/');
            return;
        }

        // Check if user has permission
        if (this.beforeNavigate) {
            const canNavigate = await this.beforeNavigate(route);
            if (!canNavigate) {
                console.warn('Navigation blocked by beforeNavigate hook');
                return;
            }
        }

        // Load the page
        await this.loadPage(path, route);

        // After navigation hook
        if (this.afterNavigate) {
            this.afterNavigate(path, route);
        }

        this.currentRoute = path;
    }

    /**
     * Load page content and script
     */
    async loadPage(path, route) {
        const contentArea = document.getElementById('content-area');

        if (!contentArea) {
            console.error('Content area not found');
            return;
        }

        try {
            // If no view specified, redirect to old page (fallback during migration)
            if (!route.view) {
                const pageName = path.substring(1) || 'dashboard';
                window.location.href = `/pages/${pageName}.html`;
                return;
            }

            // Show loading state
            contentArea.innerHTML = '<div style="padding: 2rem; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

            // Update page title
            document.title = `${route.title} - Digital POS`;

            // Load HTML content if view is specified
            if (route.view) {
                const response = await fetch(route.view);
                if (!response.ok) throw new Error(`Failed to load view: ${route.view}`);
                const html = await response.text();
                contentArea.innerHTML = html;
            }

            // Load and execute page script if specified
            if (route.script) {
                const module = await import(route.script);
                if (module.default) {
                    await module.default();
                } else if (route.init && module[route.init]) {
                    await module[route.init]();
                }
            }

        } catch (error) {
            console.error('Error loading page:', error);
            contentArea.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading page: ${error.message}</p>
                    <button class="btn btn-primary" onclick="location.reload()">Reload</button>
                </div>
            `;
        }
    }

    /**
     * Get current route path
     */
    getCurrentPath() {
        return this.currentRoute;
    }
}

export default new Router();
