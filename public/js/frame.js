/**
 * Frame - Manages the Application Layout (Sidebar & Topbar)
 */

export default class Frame {
    constructor() {
        this.sidebarElement = null;
        this.topBarElement = null;
        this.overlayElement = null;

        // Default to collapsed on mobile/tablet if no preference exists
        const storedCollapse = localStorage.getItem('sidebarCollapsed');
        if (storedCollapse === null) {
            this.isSidebarCollapsed = window.innerWidth < 1024;
        } else {
            this.isSidebarCollapsed = storedCollapse === 'true';
        }
    }

    /**
     * Render the application frame
     * @param {HTMLElement} container - The container to render into (usually .dashboard)
     * @param {Object} user - The current user object
     * @param {Function} onLogout - Logout callback
     */
    render(container, user, onLogout) {
        if (!container) return;
        this.user = user;

        // Create and append Sidebar
        this.sidebarElement = document.createElement('aside');
        this.sidebarElement.id = 'sidebar';
        this.sidebarElement.className = 'sidebar';


        this.sidebarElement.innerHTML = this.getSidebarHTML(user);
        container.insertBefore(this.sidebarElement, container.firstChild); // Insert as first child

        // Create and append Overlay (for mobile)
        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'sidebar-overlay';
        container.appendChild(this.overlayElement);

        // Create and append Topbar (into main-content if possible, or create structure)
        // Check if main-content exists
        let mainContent = container.querySelector('.main-content');
        if (!mainContent) {
            mainContent = document.createElement('main');
            mainContent.className = 'main-content';
            container.appendChild(mainContent);
        }

        this.topBarElement = document.createElement('div');
        this.topBarElement.id = 'top-bar';
        this.topBarElement.className = 'top-bar';
        this.topBarElement.innerHTML = this.getTopBarHTML(user);

        // Initialize sidebar state
        if (this.isSidebarCollapsed) {
            document.body.classList.add('sidebar-collapsed');
        } else {
            document.body.classList.remove('sidebar-collapsed');
        }

        mainContent.insertBefore(this.topBarElement, mainContent.firstChild);

        // Add event listeners
        document.getElementById('logoutBtn')?.addEventListener('click', onLogout);
        document.getElementById('sidebarToggle')?.addEventListener('click', () => this.toggleSidebar());
        document.getElementById('fullScreenToggle')?.addEventListener('click', () => this.toggleFullScreen());
        this.overlayElement.addEventListener('click', () => this.toggleSidebar());

        // Auto-close sidebar on mobile when a nav link is clicked
        this.sidebarElement.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 1024 && !this.isSidebarCollapsed) {
                    this.toggleSidebar();
                }
            });
        });

        // Listen for fullscreen change to update icon
        document.addEventListener('fullscreenchange', () => {
            const icon = document.querySelector('#fullScreenToggle i');
            if (icon) {
                if (document.fullscreenElement) {
                    icon.classList.remove('fa-expand');
                    icon.classList.add('fa-compress');
                } else {
                    icon.classList.remove('fa-compress');
                    icon.classList.add('fa-expand');
                }
            }
        });
    }

    hasPermission(permission, defaultRoles = []) {
        if (!this.user) return false;
        if (this.user.role === 'Admin') return true;

        if (this.user.permissions && Array.isArray(this.user.permissions)) {
            const isAllowed = this.user.permissions.some(p => {
                if (p === '*' || p === permission) return true;
                const [resource, action] = (p || '').split(':');
                const [reqResource, reqAction] = (permission || '').split(':');
                if (resource === reqResource && (action === '*' || action === reqAction || reqAction === 'read')) return true;
                return false;
            });
            if (isAllowed) return true;
        }

        return defaultRoles.includes(this.user.role);
    }

    getSidebarHTML(user) {
        const canViewInventory = this.hasPermission('items:read', ['Admin', 'Coordinator']);
        const canViewPO = this.hasPermission('po:read', ['Admin', 'Coordinator', 'Cashier']) || this.hasPermission('po:create', ['Admin', 'Coordinator', 'Cashier']);
        const canViewGRN = this.hasPermission('grn:read', ['Admin', 'Coordinator', 'Cashier']) || this.hasPermission('grn:create', ['Admin', 'Coordinator', 'Cashier']);
        const canViewContacts = this.hasPermission('customers:read', ['Admin', 'Coordinator']) || this.hasPermission('suppliers:read', ['Admin', 'Coordinator']);
        const canViewReports = this.hasPermission('reports:sales', ['Admin', 'Coordinator']) || this.hasPermission('reports:inventory', ['Admin', 'Coordinator']);
        const canViewSystem = this.hasPermission('users:read', ['Admin']);

        return `
            <div class="sidebar-header" style="padding: 1rem 0.5rem; text-align: center;">
                <img src="/img/logo-white.png" alt="HenChamp Supply Hub" style="max-height: 42px; width: auto; display: block; margin: 0 auto;">
            </div>
            <nav class="sidebar-nav">
                <div class="nav-section">
                    <div class="nav-section-title">Main</div>
                    <a href="#/" class="nav-link" data-route="/" data-tooltip="Dashboard">
                        <span class="nav-icon"><i class="fas fa-chart-line"></i></span>
                        <span>Dashboard</span>
                    </a>
                    <a href="#/pos" class="nav-link" data-route="/pos" data-tooltip="Point of Sale">
                        <span class="nav-icon"><i class="fas fa-cash-register"></i></span>
                        <span>Point of Sale</span>
                    </a>
                    <a href="#/invoices" class="nav-link" data-route="/invoices" data-tooltip="Invoices">
                        <span class="nav-icon"><i class="fas fa-file-invoice"></i></span>
                        <span>Invoices</span>
                    </a>
                    <a href="#/petty-cash" class="nav-link" data-route="/petty-cash" data-tooltip="Petty Cash">
                        <span class="nav-icon"><i class="fas fa-coins"></i></span>
                        <span>Petty Cash</span>
                    </a>
                </div>

                ${canViewInventory ? `
                <div class="nav-section">
                    <div class="nav-section-title">Inventory</div>
                    <a href="#/items" class="nav-link" data-route="/items" data-tooltip="Items/Products">
                        <span class="nav-icon"><i class="fas fa-box"></i></span>
                        <span>Items/Products</span>
                    </a>
                    <a href="#/categories" class="nav-link" data-route="/categories" data-tooltip="Categories">
                        <span class="nav-icon"><i class="fas fa-tags"></i></span>
                        <span>Categories</span>
                    </a>
                    <a href="#/batches" class="nav-link" data-route="/batches" data-tooltip="Batches / Lots">
                         <span class="nav-icon"><i class="fas fa-layer-group"></i></span>
                         <span>Batches / Lots</span>
                    </a>
                  
                    <a href="#/stock-adjustments" class="nav-link" data-route="/stock-adjustments" data-tooltip="Stock Adjustments">
                         <span class="nav-icon"><i class="fas fa-adjust"></i></span>
                         <span>Stock Adjustments</span>
                    </a>
                </div>
                ` : ''}

                <div class="nav-section">
                    <div class="nav-section-title">Purchase</div>
                    ${canViewPO ? `
                    <a href="#/purchase-orders" class="nav-link" data-route="/purchase-orders" data-tooltip="Purchase Orders">
                        <span class="nav-icon"><i class="fas fa-file-contract"></i></span>
                        <span>Purchase Orders</span>
                    </a>
                    <a href="#/po-payments" class="nav-link" data-route="/po-payments" data-tooltip="PO Payments">
                        <span class="nav-icon"><i class="fas fa-credit-card"></i></span>
                        <span>PO Payments</span>
                    </a>
                    ` : ''}
                    ${canViewGRN ? `
                    <a href="#/grn" class="nav-link" data-route="/grn" data-tooltip="Goods Received">
                        <span class="nav-icon"><i class="fas fa-truck-loading"></i></span>
                        <span>Goods Received</span>
                    </a>
                    ` : ''}
                    <a href="#/quotations" class="nav-link" data-route="/quotations" data-tooltip="Quotations">
                        <span class="nav-icon"><i class="fas fa-file-alt"></i></span>
                        <span>Quotations</span>
                    </a>
                </div>

                ${canViewContacts ? `
                <div class="nav-section">
                    <div class="nav-section-title">Customers</div>
                    <a href="#/customers" class="nav-link" data-route="/customers" data-tooltip="Customers">
                        <span class="nav-icon"><i class="fas fa-users"></i></span>
                        <span>Customers</span>
                    </a>
                    <a href="#/suppliers" class="nav-link" data-route="/suppliers" data-tooltip="Suppliers">
                        <span class="nav-icon"><i class="fas fa-truck"></i></span>
                        <span>Suppliers</span>
                    </a>
                </div>
                ` : ''}

                ${canViewReports ? `
                <div class="nav-section">
                    <div class="nav-section-title">Reports</div>
                    <a href="#/reports" class="nav-link" data-route="/reports" data-tooltip="Sales Reports">
                        <span class="nav-icon"><i class="fas fa-chart-bar"></i></span>
                        <span>Sales Reports</span>
                    </a>
                    <a href="#/inventory-reports" class="nav-link" data-route="/inventory-reports" data-tooltip="Inventory Reports">
                        <span class="nav-icon"><i class="fas fa-boxes"></i></span>
                        <span>Inventory Reports</span>
                    </a>
                    <a href="#/monthly-costs" class="nav-link" data-route="/monthly-costs" data-tooltip="Monthly Costs">
                        <span class="nav-icon"><i class="fas fa-file-invoice-dollar"></i></span>
                        <span>Monthly Costs</span>
                    </a>
                    ${user.role === 'Admin' ? `
                    <a href="#/invoice-reports" class="nav-link" data-route="/invoice-reports" data-tooltip="Invoice Reports">
                        <span class="nav-icon"><i class="fas fa-file-invoice-dollar"></i></span>
                        <span>Invoice Reports</span>
                    </a>
                    ` : ''}
                </div>
                ` : ''}

                ${this.hasPermission('isp:read', ['Admin', 'Coordinator', 'Cashier']) ? `
                <div class="nav-section">
                    <div class="nav-section-title">ISP</div>
                    <a href="#/isp" class="nav-link" data-route="/isp" data-tooltip="ISP Dashboard">
                        <span class="nav-icon"><i class="fas fa-wifi"></i></span>
                        <span>ISP Dashboard</span>
                    </a>
                    <a href="#/isp/subscribers" class="nav-link" data-route="/isp/subscribers" data-tooltip="Subscribers">
                        <span class="nav-icon"><i class="fas fa-network-wired"></i></span>
                        <span>Subscribers</span>
                    </a>
                    <a href="#/isp/vouchers" class="nav-link" data-route="/isp/vouchers" data-tooltip="Hotspot Vouchers">
                        <span class="nav-icon"><i class="fas fa-ticket-alt"></i></span>
                        <span>Vouchers</span>
                    </a>
                    <a href="#/isp/sessions" class="nav-link" data-route="/isp/sessions" data-tooltip="Live Sessions">
                        <span class="nav-icon"><i class="fas fa-satellite-dish"></i></span>
                        <span>Live Sessions</span>
                    </a>
                </div>
                ` : ''}

                ${canViewSystem ? `
                <div class="nav-section">
                    <div class="nav-section-title">System</div>
                    <a href="#/users" class="nav-link" data-route="/users" data-tooltip="Users">
                        <span class="nav-icon"><i class="fas fa-users-cog"></i></span>
                        <span>Users</span>
                    </a>
                    <a href="#/roles" class="nav-link" data-route="/roles" data-tooltip="Roles">
                        <span class="nav-icon"><i class="fas fa-shield-alt"></i></span>
                        <span>Roles</span>
                    </a>
                </div>
                ` : ''}
            </nav>
        `;
    }

    getTopBarHTML(user) {
        return `
            <div class="flex-center" style="gap: 1rem;">
                <button id="sidebarToggle" class="btn btn-icon" style="background:none;border:none;cursor:pointer;color:var(--gray-600);font-size:1.25rem;">
                    <i class="fas fa-bars"></i>
                </button>
                <h1 class="page-title" id="page-title">Dashboard</h1>
            </div>
            <div class="user-menu">
                <div class="notification-wrapper">
                    <button id="notificationToggle" class="btn btn-icon" title="Notifications" style="background:none;border:none;cursor:pointer;color:var(--gray-600);font-size:1.25rem;">
                        <i class="fas fa-bell"></i>
                        <span id="notificationBadge" class="notification-badge" style="display: none;">0</span>
                    </button>
                    <div id="notificationDropdown" class="notification-dropdown">
                        <div class="notification-header">
                            <h3>Notifications</h3>
                            <button id="markAllRead" class="btn-text">Clear All</button>
                        </div>
                        <div id="notificationList" class="notification-list">
                            <div class="notification-empty">No new notifications</div>
                        </div>
                    </div>
                </div>
                <button id="fullScreenToggle" class="btn btn-icon" style="background:none;border:none;cursor:pointer;color:var(--gray-600);font-size:1.25rem;margin-right:1rem;">
                    <i class="fas fa-expand"></i>
                </button>
                <div class="user-info">
                    <div class="user-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="user-tooltip">
                        <div class="user-tooltip-name">${user.username}</div>
                        <div class="user-tooltip-role">${user.role}</div>
                    </div>
                </div>
                <button id="logoutBtn" class="btn-icon-logout" title="Logout">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>
        `;
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((e) => {
                console.error(`Error attempting to enable full-screen mode: ${e.message} (${e.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    toggleSidebar() {
        this.isSidebarCollapsed = !this.isSidebarCollapsed;

        // Update DOM
        if (this.isSidebarCollapsed) {
            document.body.classList.add('sidebar-collapsed');
        } else {
            document.body.classList.remove('sidebar-collapsed');
        }

        // Persist state
        localStorage.setItem('sidebarCollapsed', this.isSidebarCollapsed);
    }

    updateActiveNav(path) {
        // Remove active class from all links
        const links = document.querySelectorAll('.nav-link');
        links.forEach(link => link.classList.remove('active'));

        // Add active class to current link
        const activeLink = document.querySelector(`.nav-link[data-route="${path}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
        // Update page title if element exists (handled by router/frame)
        const pageTitle = document.getElementById('page-title');
        // We rely on router to set the title text, but frame provides the element
    }

    // Helper to update title text
    setTitle(title) {
        const pageTitle = document.getElementById('page-title');
        if (pageTitle) {
            pageTitle.textContent = title;
        }
    }
}
