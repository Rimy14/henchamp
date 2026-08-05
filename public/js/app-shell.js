/**
 * App Shell - Manages sidebar, topbar, and routing
 */

import auth from './auth.js';
import router from './router.js';
import loadingScreen from './loading-screen.js';

import Frame from './frame.js';
import notificationManager from './notifications.js';

class AppShell {
    constructor() {
        this.user = null;
        this.frame = new Frame();
    }

    /**
     * Initialize the app shell
     */
    async init() {
        loadingScreen.show('Initializing application...');

        try {
            // Check authentication
            const isAuthenticated = await auth.checkAuth();
            if (!isAuthenticated) {
                console.warn('User not authenticated, redirecting to login');
                await loadingScreen.hide();
                // Redirect to login page with message
                window.location.href = '/?expired=true';
                return;
            }

            // Get current user
            this.user = auth.getCurrentUser();

            if (!this.user) {
                console.error('No user data available');
                await loadingScreen.hide();
                window.location.href = '/';
                return;
            }

            // Render Frame (Sidebar & Topbar)
            const dashboardContainer = document.querySelector('.dashboard');
            this.frame.render(dashboardContainer, this.user, () => auth.logout());

            // Setup routes
            this.setupRoutes();

            // Initialize router
            router.beforeNavigate = (route) => this.checkPermission(route);
            router.afterNavigate = (path) => this.updateActiveNav(path);
            router.init();

            // Initialize Notifications
            notificationManager.init();

        } catch (error) {
            console.error('Error initializing app shell:', error);
            alert('Error initializing app shell: ' + error.message);
            await loadingScreen.hide();
        } finally {
            await loadingScreen.hide();
        }
    }

    updateActiveNav(path) {
        this.frame.updateActiveNav(path);

        // Update page title
        const route = router.routes.get(path);
        if (route) {
            this.frame.setTitle(route.title);
        }
    }


    /**
     * Setup application routes
     */
    setupRoutes() {
        // Initialize routes

        router.addRoute('/', {
            title: 'Dashboard',
            view: '/pages/dashboard.html',
            script: '/js/dashboard.js'
        });

        // Temporary fallback routes to existing pages
        // These will be gradually converted to app shell views

        router.addRoute('/pos', {
            title: 'Point of Sale',
            view: '/pages/pos.html',
            script: '/js/pos.js',
            init: 'initPOS',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/invoices', {
            title: 'Invoices',
            view: '/pages/invoices.html',
            script: '/js/invoices.js',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/items', {
            title: 'Items & Products',
            view: '/pages/items.html',
            script: '/js/items.js',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/batches', {
            title: 'Inventory Batches',
            view: '/pages/inventory-batches.html',
            script: '/js/inventory-batches.js',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/categories', {
            title: 'Categories',
            view: '/pages/categories.html',
            script: '/js/categories.js',
            allowedRoles: ['Admin', 'Coordinator']
        });

        router.addRoute('/purchase-orders', {
            title: 'Purchase Orders',
            view: '/pages/purchase-orders.html',
            script: '/js/purchase-orders.js',
            requiredPermission: 'po:read',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/po-payments', {
            title: 'PO Payments',
            view: '/pages/po-payments.html',
            script: '/js/po-payments.js',
            requiredPermission: 'po:read',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/grn', {
            title: 'Goods Received',
            view: '/pages/grn.html',
            script: '/js/grn.js',
            requiredPermission: 'grn:read',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/quotations', {
            title: 'Quotations',
            view: '/pages/quotations.html',
            script: '/js/quotations.js',
            init: 'initQuotations',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

      /*  router.addRoute('/bom', {
            title: 'Bill of Materials',
            view: '/pages/bom.html',
            script: '/js/bom.js',
            allowedRoles: ['Admin', 'Coordinator']
        });*/

       /* router.addRoute('/stock-transfers', {
            title: 'Stock Transfers',
            view: '/pages/stock-transfers.html',
            script: '/js/stock-transfers.js',
            allowedRoles: ['Admin', 'Manager', 'Store Keeper', 'Coordinator']
        });*/

        router.addRoute('/stock-adjustments', {
            title: 'Stock Adjustments',
            view: '/pages/stock-adjustments.html',
            script: '/js/stock-adjustments.js',
            allowedRoles: ['Admin', 'Coordinator']
        });

       /* router.addRoute('/production', {
            title: 'Production',
            view: '/pages/production.html',
            script: '/js/production.js',
            allowedRoles: ['Admin', 'Manager', 'Store Keeper', 'Coordinator']
        });*/

        router.addRoute('/customers', {
            title: 'Customers',
            view: '/pages/customers.html',
            script: '/js/customers.js',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });

        router.addRoute('/users', {
            title: 'User Management',
            view: '/pages/users.html',
            script: '/js/users.js',
            allowedRoles: ['Admin']
        });

        router.addRoute('/roles', {
            title: 'Role Management',
            view: '/pages/roles.html',
            script: '/js/roles.js',
            init: 'init',
            allowedRoles: ['Admin']
        });

        router.addRoute('/suppliers', {
            title: 'Suppliers',
            view: '/pages/suppliers.html',
            script: '/js/suppliers.js',
            allowedRoles: ['Admin', 'Coordinator']
        });

        router.addRoute('/reports', {
            title: 'Sales Reports',
            view: '/pages/reports.html',
            script: '/js/reports.js',
            init: 'init',
            allowedRoles: ['Admin', 'Coordinator']
        });

        router.addRoute('/inventory-reports', {
            title: 'Inventory Reports',
            view: '/pages/inventory-reports.html',
            script: '/js/inventory-reports.js',
            init: 'init',
            allowedRoles: ['Admin', 'Coordinator']
        });

        router.addRoute('/invoice-reports', {
            title: 'Invoice Reports',
            view: '/pages/invoice-reports.html',
            script: '/js/invoice-reports.js',
            init: 'init',
            allowedRoles: ['Admin']
        });

        router.addRoute('/monthly-costs', {
            title: 'Monthly Costs',
            view: '/pages/monthly-costs.html',
            script: '/js/monthly-costs.js',
            init: 'init',
            allowedRoles: ['Admin', 'Coordinator']
        });

        router.addRoute('/petty-cash', {
            title: 'Petty Cash',
            view: '/pages/petty-cash.html',
            script: '/js/petty-cash.js',
            init: 'init',
            allowedRoles: ['Admin', 'Coordinator', 'Cashier']
        });
    }

    /**
     * Check if user has permission for route
     */
    checkPermission(route) {
        if (!this.user) return false;
        if (this.user.role === 'Admin') return true;

        if (route.requiredPermission && this.user.permissions && Array.isArray(this.user.permissions)) {
            const hasPerm = this.user.permissions.some(p => {
                if (p === '*' || p === route.requiredPermission) return true;
                const [resource, action] = (p || '').split(':');
                const [reqResource, reqAction] = (route.requiredPermission || '').split(':');
                if (resource === reqResource && (action === '*' || action === reqAction || reqAction === 'read')) return true;
                return false;
            });
            if (hasPerm) return true;
        }

        if (!route.allowedRoles) return true;
        return route.allowedRoles.includes(this.user.role);
    }

    /**
     * Update active navigation link
     */
    updateActiveNav(path) {
        // Remove active class from all links
        const links = document.querySelectorAll('.nav-link');
        links.forEach(link => link.classList.remove('active'));

        // Add active class to current link
        const activeLink = document.querySelector(`.nav-link[data-route="${path}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        // Update page title in top bar
        const route = router.routes.get(path);
        if (route) {
            const pageTitle = document.getElementById('page-title');
            if (pageTitle) {
                pageTitle.textContent = route.title;
            }

            // Apply content padding for pages other than Dashboard and POS
            const contentArea = document.getElementById('content-area');
            if (contentArea) {
                if (path === '/' || path === '/pos') {
                    contentArea.classList.remove('app-content-padding');
                } else {
                    contentArea.classList.add('app-content-padding');
                }
            }
        }
    }
}

// Initialize app shell on DOM ready
const appShell = new AppShell();

export default appShell;
