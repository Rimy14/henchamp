/**
 * HenChamp Customer Portal JS (Unified Dashboard)
 */

import toast from '../../js/toast.js';

document.addEventListener('DOMContentLoaded', () => {
    // Portal State
    let catalogItems = [];
    let cart = [];
    let activeCategory = 'all';
    let customerInfo = null;

    // DOM Elements - Login
    const loginOverlay = document.getElementById('loginOverlay');
    const customerLoginForm = document.getElementById('customerLoginForm');
    const loginEmailInput = document.getElementById('loginEmail');
    const signInSubmitBtn = document.getElementById('signInSubmitBtn');

    // DOM Elements - Profile & Plan
    const portalCustomerName = document.getElementById('portalCustomerName');
    const planName = document.getElementById('planName');
    const planQuota = document.getElementById('planQuota');
    const planPrice = document.getElementById('planPrice');
    const planPeriod = document.getElementById('planPeriod');

    // DOM Elements - Invoices Table
    const portalInvoicesTableBody = document.getElementById('portalInvoicesTableBody');

    // DOM Elements - Catalog
    const catalogGrid = document.getElementById('catalogGrid');
    const storeSearchInput = document.getElementById('storeSearchInput');

    // DOM Elements - Navigation / Tabs
    const navItems = document.querySelectorAll('.nav-item[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabTitle = document.getElementById('tabTitle');
    const portalLogoutBtn = document.getElementById('portalLogoutBtn');

    // DOM Elements - Cart Drawer
    const openCartBtn = document.getElementById('openCartBtn');
    const closeCartBtn = document.getElementById('closeCartBtn');
    const cartDrawerOverlay = document.getElementById('cartDrawerOverlay');
    const cartDrawerBody = document.getElementById('cartDrawerBody');
    const cartGrandTotal = document.getElementById('cartGrandTotal');
    const cartCountBadge = document.getElementById('cartCountBadge');
    const checkoutProceedBtn = document.getElementById('checkoutProceedBtn');

    // DOM Elements - Checkout Modal
    const checkoutModal = document.getElementById('checkoutModal');
    const closeCheckoutBtn = document.getElementById('closeCheckoutBtn');
    const cancelCheckoutBtn = document.getElementById('cancelCheckoutBtn');
    const checkoutForm = document.getElementById('checkoutForm');
    const submitOrderBtn = document.getElementById('submitOrderBtn');

    // Category Icons Map
    const categoryIcons = {
        'PNS': 'fa-print',
        'OEQ': 'fa-desktop',
        'UNI': 'fa-tshirt',
        'BNE': 'fa-tools',
        'LNM': 'fa-microscope',
        'ICT': 'fa-laptop-code',
        'SEC': 'fa-shield-alt',
        'INT': 'fa-couch',
        'PNT': 'fa-paint-roller'
    };

    // Helper: Check Cookie Presence
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // Helper: Delete Cookie
    function deleteCookie(name) {
        document.cookie = `${name}=; Max-Age=-99999999; path=/;`;
    }

    // Helper: Escape HTML to prevent XSS
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Helper: Format Date
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB');
    }

    // Check Authentication state
    function checkAuth() {
        const customerToken = getCookie('customerToken');
        const savedCustomer = localStorage.getItem('customerInfo');

        if (customerToken && savedCustomer) {
            customerInfo = JSON.parse(savedCustomer);
            loginOverlay.classList.add('hidden');
            initPortalDashboard();
        } else {
            loginOverlay.classList.remove('hidden');
            portalCustomerName.textContent = 'Guest';
        }
    }

    // Initialize Dashboard data
    async function initPortalDashboard() {
        if (!customerInfo) return;
        
        portalCustomerName.textContent = customerInfo.name;
        
        // Fetch dynamic profile and billing logs in parallel
        loadCustomerProfile();
        loadCustomerInvoices();
        loadCatalog();
        setupEventListeners();
    }

    // 1. Fetch Profile & Package Subscription (C1)
    async function loadCustomerProfile() {
        try {
            const res = await fetch('/api/portal/profile');
            const data = await res.json();
            
            if (data.success && data.customer) {
                const cust = data.customer;
                portalCustomerName.textContent = cust.name;
                
                if (cust.plan) {
                    planName.textContent = cust.plan.plan_name;
                    planQuota.textContent = cust.plan.quota;
                    planPrice.textContent = cust.plan.price;
                    planPeriod.textContent = cust.plan.billing_frequency;
                }
            }
        } catch (err) {
            console.error('Error loading customer profile:', err);
            toast.error('Failed to load active package subscription details.');
        }
    }

    // 2. Fetch Invoice Payment History Logs (C1)
    async function loadCustomerInvoices() {
        try {
            const res = await fetch('/api/portal/invoices');
            const data = await res.json();
            
            if (data.success && Array.isArray(data.invoices)) {
                renderInvoicesTable(data.invoices);
            } else {
                portalInvoicesTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                            No invoices logs found for your account.
                        </td>
                    </tr>
                `;
            }
        } catch (err) {
            console.error('Error loading customer invoices:', err);
            portalInvoicesTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: #b23a3a; padding: 2rem;">
                        <i class="fas fa-exclamation-triangle"></i> Failed to retrieve payment logs.
                    </td>
                </tr>
            `;
        }
    }

    function renderInvoicesTable(invoices) {
        if (invoices.length === 0) {
            portalInvoicesTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                        No invoices logs found for your account.
                    </td>
                </tr>
            `;
            return;
        }

        portalInvoicesTableBody.innerHTML = invoices.map(inv => {
            const dateStr = formatDate(inv.sale_date);
            const subtotal = parseFloat(inv.subtotal).toFixed(2);
            const discount = parseFloat(inv.discount_amount || 0).toFixed(2);
            const total = parseFloat(inv.total_amount).toFixed(2);
            
            const isPaid = inv.payment_status.toLowerCase() === 'paid';
            const badgeClass = isPaid ? 'badge-paid' : 'badge-pending';
            
            return `
                <tr>
                    <td><strong>${inv.invoice_number}</strong></td>
                    <td>${dateStr}</td>
                    <td>KES ${subtotal}</td>
                    <td>KES ${discount}</td>
                    <td><strong>KES ${total}</strong></td>
                    <td>${inv.payment_method}</td>
                    <td><span class="badge ${badgeClass}">${inv.payment_status}</span></td>
                </tr>
            `;
        }).join('');
    }

    // 3. Fetch Catalog Storefront items (C2)
    async function loadCatalog() {
        try {
            const res = await fetch('/api/config/public-items');
            const data = await res.json();
            
            if (data.success && Array.isArray(data.data)) {
                catalogItems = data.data;
                renderCatalog();
            }
        } catch (err) {
            console.error('Error loading catalog:', err);
            catalogGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: #b23a3a; padding: 4rem 2rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; margin-bottom: 1rem; display: block;"></i>
                    Unable to load products catalog.
                </div>
            `;
        }
    }

    function renderCatalog() {
        const query = storeSearchInput.value.trim().toLowerCase();

        const filtered = catalogItems.filter(item => {
            const codePrefix = item.code ? item.code.split('-')[0] : '';
            const matchesQuery = !query || 
                (item.name && item.name.toLowerCase().includes(query)) ||
                (item.code && item.code.toLowerCase().includes(query)) ||
                (item.description && item.description.toLowerCase().includes(query));
            return matchesQuery;
        });

        if (filtered.length === 0) {
            catalogGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 2.5rem; margin-bottom: 1rem; display: block;"></i>
                    No matching products found.
                </div>
            `;
            return;
        }

        catalogGrid.innerHTML = filtered.map(item => {
            const catPrefix = item.code ? item.code.split('-')[0] : 'PKG';
            const iconClass = categoryIcons[catPrefix] || 'fa-box-open';
            const price = parseFloat(item.selling_price || 0);
            const stockQty = item.stock_quantity || 0;
            
            const isStockAvailable = stockQty > 0;
            const stockBadgeClass = isStockAvailable ? 'stock-badge stock-in' : 'stock-badge stock-out';
            const stockBadgeText = isStockAvailable ? `${stockQty} In Stock` : 'Out of Stock';

            return `
                <div class="product-card">
                    <div class="product-img">
                        <i class="fas ${iconClass}"></i>
                        <span class="${stockBadgeClass}">${stockBadgeText}</span>
                    </div>
                    <div class="product-info">
                        <h3>${escapeHtml(item.name)}</h3>
                        <p>${escapeHtml(item.description || 'HenChamp certified industrial supply.')}</p>
                        <div class="product-footer">
                            <span class="product-price">KES ${price.toFixed(2)}</span>
                            <button class="btn-add-cart" data-id="${item.id}" ${isStockAvailable ? '' : 'disabled'}>
                                <i class="fas fa-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners to card buttons
        catalogGrid.querySelectorAll('.btn-add-cart').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = parseInt(btn.dataset.id);
                addToCart(itemId);
            });
        });
    }

    function addToCart(itemId) {
        const item = catalogItems.find(i => i.id === itemId);
        if (!item) return;

        const existing = cart.find(c => c.id === itemId);
        if (existing) {
            existing.qty += 1;
        } else {
            cart.push({
                id: item.id,
                name: item.name,
                price: parseFloat(item.selling_price || 0),
                qty: 1
            });
        }

        updateCartUI();
        toast.success(`Added "${item.name}" to cart`);
    }

    function updateCartUI() {
        const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
        const grandTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

        cartCountBadge.textContent = totalQty;
        cartGrandTotal.textContent = `KES ${grandTotal.toFixed(2)}`;

        if (cart.length === 0) {
            cartDrawerBody.innerHTML = `
                <p style="text-align: center; color: var(--text-muted); padding: 3rem 0;">Your cart is empty.</p>
            `;
            checkoutProceedBtn.disabled = true;
            return;
        }

        checkoutProceedBtn.disabled = false;
        cartDrawerBody.innerHTML = cart.map((item, index) => `
            <div class="cart-item-row">
                <div class="cart-item-info">
                    <h4>${escapeHtml(item.name)}</h4>
                    <p>KES ${item.price.toFixed(2)}</p>
                </div>
                <div class="cart-qty-ctrl">
                    <button class="cart-qty-btn decrease-qty" data-index="${index}">-</button>
                    <span class="cart-qty-val">${item.qty}</span>
                    <button class="cart-qty-btn increase-qty" data-index="${index}">+</button>
                </div>
            </div>
        `).join('');

        // Attach listeners inside drawer
        cartDrawerBody.querySelectorAll('.decrease-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.index);
                if (cart[idx].qty > 1) {
                    cart[idx].qty -= 1;
                } else {
                    cart.splice(idx, 1);
                }
                updateCartUI();
            });
        });

        cartDrawerBody.querySelectorAll('.increase-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.index);
                cart[idx].qty += 1;
                updateCartUI();
            });
        });
    }

    // Setup Navigation & Button Event Listeners
    function setupEventListeners() {
        // Search bar
        storeSearchInput.addEventListener('input', renderCatalog);

        // Sidebar Tab Switcher
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tabId = item.dataset.tab;

                // Toggle sidebar active class
                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Toggle visible content
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');

                // Update Header Title
                if (tabId === 'planTab') tabTitle.textContent = 'Active Plan details';
                if (tabId === 'invoicesTab') tabTitle.textContent = 'Paid Logs Invoice History';
                if (tabId === 'orderTab') tabTitle.textContent = 'Place Direct Storefront Order';
            });
        });

        // Logout
        portalLogoutBtn.addEventListener('click', () => {
            deleteCookie('customerToken');
            localStorage.removeItem('customerInfo');
            cart = [];
            updateCartUI();
            checkAuth();
            toast.success('Logged out successfully.');
        });

        // Cart Drawer
        openCartBtn.addEventListener('click', () => cartDrawerOverlay.classList.add('active'));
        closeCartBtn.addEventListener('click', () => cartDrawerOverlay.classList.remove('active'));
        
        checkoutProceedBtn.addEventListener('click', () => {
            if (cart.length === 0) return;
            cartDrawerOverlay.classList.remove('active');
            checkoutModal.style.display = 'flex';
        });

        closeCheckoutBtn.addEventListener('click', () => checkoutModal.style.display = 'none');
        cancelCheckoutBtn.addEventListener('click', () => checkoutModal.style.display = 'none');
    }

    // Passwordless Customer Login Form Submission
    customerLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmailInput.value.trim();

        if (!email) return;

        signInSubmitBtn.disabled = true;
        signInSubmitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Authenticating...';

        try {
            const res = await fetch('/api/portal/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();

            if (data.success && data.customer) {
                localStorage.setItem('customerInfo', JSON.stringify(data.customer));
                customerInfo = data.customer;
                
                toast.success('Logged in successfully!');
                loginOverlay.classList.add('hidden');
                initPortalDashboard();
            } else {
                toast.error(data.message || 'Login failed. Please verify registered email.');
            }
        } catch (err) {
            console.error('Error submitting customer login:', err);
            toast.error('An error occurred. Check server API connection.');
        } finally {
            signInSubmitBtn.disabled = false;
            signInSubmitBtn.textContent = 'Sign In';
        }
    });

    // Storefront Direct Order Form Submission (C2)
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const custName = document.getElementById('custName').value.trim();
        const custPhone = document.getElementById('custPhone').value.trim();
        const paymentMethodVal = document.getElementById('paymentMethod').value;

        if (cart.length === 0) {
            toast.error('Cart is empty.');
            return;
        }

        let mappedPaymentMethod = 'Cash';
        let noteTag = '[Cash on Delivery]';
        if (paymentMethodVal === 'credit') {
            mappedPaymentMethod = 'Credit';
            noteTag = '[Credit Account Net 30]';
        } else if (paymentMethodVal === 'mpesa') {
            mappedPaymentMethod = 'Card';
            noteTag = '[M-Pesa Express Payment]';
        }

        const orderPayload = {
            payment_method: mappedPaymentMethod,
            notes: `${noteTag} Storefront Order by ${custName} (Phone: ${custPhone})`,
            items: cart.map(i => ({
                item_id: i.id,
                quantity: i.qty
            }))
        };

        submitOrderBtn.disabled = true;
        submitOrderBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Submitting Order...';

        try {
            const res = await fetch('/api/portal/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });
            const data = await res.json();

            if (data.success) {
                toast.success('Order placed successfully! Sales invoice generated.');
                checkoutModal.style.display = 'none';
                
                // Clear cart
                cart = [];
                updateCartUI();

                // Reload invoices tab log
                await loadCustomerInvoices();

                // Auto switch view to Invoices history
                document.querySelector('.nav-item[data-tab="invoicesTab"]').click();
            } else {
                toast.error(data.message || 'Failed to place order.');
            }
        } catch (err) {
            console.error('Error placing storefront order:', err);
            toast.error('An error occurred during order submission.');
        } finally {
            submitOrderBtn.disabled = false;
            submitOrderBtn.textContent = 'Place Order';
        }
    });

    // Run Auth Initializer
    checkAuth();
});
