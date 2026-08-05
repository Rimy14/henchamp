/**
 * HenChamp Customer Storefront & Order Portal JS
 */

import toast from './toast.js';

document.addEventListener('DOMContentLoaded', () => {
    // State
    let catalogItems = [];
    let cart = [];
    let activeCategory = 'all';

    // DOM Elements
    const catalogGrid = document.getElementById('catalogGrid');
    const storeSearchInput = document.getElementById('storeSearchInput');
    const categoryFilterBar = document.getElementById('categoryFilterBar');
    
    // Cart Drawer Elements
    const openCartBtn = document.getElementById('openCartBtn');
    const closeCartBtn = document.getElementById('closeCartBtn');
    const cartDrawerOverlay = document.getElementById('cartDrawerOverlay');
    const cartDrawerBody = document.getElementById('cartDrawerBody');
    const cartGrandTotal = document.getElementById('cartGrandTotal');
    const cartCountBadge = document.getElementById('cartCountBadge');
    const checkoutProceedBtn = document.getElementById('checkoutProceedBtn');

    // Checkout Modal Elements
    const checkoutModal = document.getElementById('checkoutModal');
    const closeCheckoutBtn = document.getElementById('closeCheckoutBtn');
    const cancelCheckoutBtn = document.getElementById('cancelCheckoutBtn');
    const checkoutForm = document.getElementById('checkoutForm');
    const submitOrderBtn = document.getElementById('submitOrderBtn');

    // Success Invoice Modal Elements
    const invoiceSuccessModal = document.getElementById('invoiceSuccessModal');
    const closeInvoiceSuccessBtn = document.getElementById('closeInvoiceSuccessBtn');
    const printInvoiceBtn = document.getElementById('printInvoiceBtn');

    // Icon map per category
    const categoryIcons = {
        'PKG': 'fa-box-open',
        'TBM': 'fa-scroll',
        'STP': 'fa-tape',
        'INK': 'fa-fill-drip',
        'LOG': 'fa-truck-ramp-box'
    };

    // Initialize
    loadCatalog();
    setupEventListeners();

    async function loadCatalog() {
        try {
            const res = await fetch('/api/config/public-items');
            const data = await res.json();


            if (data.success && Array.isArray(data.data)) {
                catalogItems = data.data;
                renderCatalog();
            } else {
                showError('Failed to load products.');
            }
        } catch (err) {
            console.error('Error loading catalog:', err);
            showError('Unable to connect to server API.');
        }
    }

    function renderCatalog() {
        const query = storeSearchInput.value.trim().toLowerCase();

        const filtered = catalogItems.filter(item => {
            const matchesCat = activeCategory === 'all' || (item.code && item.code.startsWith(activeCategory));
            const matchesQuery = !query || 
                (item.name && item.name.toLowerCase().includes(query)) ||
                (item.code && item.code.toLowerCase().includes(query)) ||
                (item.description && item.description.toLowerCase().includes(query));
            return matchesCat && matchesQuery;
        });

        if (filtered.length === 0) {
            catalogGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: #64748b;">
                    <i class="fas fa-search" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                    <h3 style="margin: 0 0 0.5rem 0; color: #1e293b;">No matching products found</h3>
                    <p style="margin: 0; font-size: 0.9rem;">Try selecting a different category or adjusting your search term.</p>
                </div>
            `;
            return;
        }

        catalogGrid.innerHTML = filtered.map(item => {
            const catPrefix = item.code ? item.code.split('-')[0] : 'PKG';
            const iconClass = categoryIcons[catPrefix] || 'fa-box-open';
            const price = parseFloat(item.selling_price || item.selling_price_incl_tax || 0);

            return `
                <div class="product-card">
                    <div class="card-image-box">
                        <i class="fas ${iconClass}"></i>
                        <span class="card-category-badge">${item.category_name || catPrefix}</span>
                        <span class="card-stock-badge">In Stock</span>
                    </div>
                    <div class="card-content">
                        <div class="card-item-code">${item.code || 'ITEM'}</div>
                        <h3 class="card-item-title">${escapeHtml(item.name)}</h3>
                        <p class="card-item-desc">${escapeHtml(item.description || 'HenChamp certified industrial supply.')}</p>
                        <div class="card-footer">
                            <div>
                                <div class="card-price">Rs ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div class="card-price-tax">VAT Inclusive</div>
                            </div>
                            <button class="btn-add-cart" data-id="${item.id}">
                                <i class="fas fa-plus"></i> Add
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach event listeners to Add to Cart buttons
        catalogGrid.querySelectorAll('.btn-add-cart').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = parseInt(e.currentTarget.dataset.id);
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
            const price = parseFloat(item.selling_price || item.selling_price_incl_tax || 0);
            cart.push({
                id: item.id,
                code: item.code,
                name: item.name,
                price: price,
                qty: 1
            });
        }

        updateCartUI();
        toast.success(`Added "${item.name}" to cart`);
    }

    function updateCartUI() {
        const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
        const grandTotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

        cartCountBadge.textContent = totalItems;
        cartGrandTotal.textContent = `Rs ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (cart.length === 0) {
            cartDrawerBody.innerHTML = `
                <p style="text-align: center; color: #94a3b8; padding: 3rem 0;">Your cart is currently empty.</p>
            `;
            checkoutProceedBtn.disabled = true;
            return;
        }

        checkoutProceedBtn.disabled = false;
        cartDrawerBody.innerHTML = cart.map((item, index) => `
            <div class="cart-item-row">
                <div class="cart-item-info">
                    <h4>${escapeHtml(item.name)}</h4>
                    <p>Rs ${item.price.toLocaleString()} x ${item.qty}</p>
                </div>
                <div class="cart-qty-ctrl">
                    <button class="cart-qty-btn decrease-qty" data-index="${index}">-</button>
                    <span style="font-weight: 700; font-size: 0.85rem; padding: 0 0.2rem;">${item.qty}</span>
                    <button class="cart-qty-btn increase-qty" data-index="${index}">+</button>
                </div>
            </div>
        `).join('');

        // Attach listeners for qty controls inside drawer
        cartDrawerBody.querySelectorAll('.decrease-qty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
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
                const idx = parseInt(e.target.dataset.index);
                cart[idx].qty += 1;
                updateCartUI();
            });
        });
    }

    function setupEventListeners() {
        // Search
        storeSearchInput.addEventListener('input', renderCatalog);

        // Category Filter Pills
        categoryFilterBar.querySelectorAll('.cat-filter-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                categoryFilterBar.querySelectorAll('.cat-filter-pill').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                activeCategory = e.target.dataset.cat;
                renderCatalog();
            });
        });

        // Cart Drawer
        openCartBtn.addEventListener('click', () => {
            cartDrawerOverlay.classList.add('active');
        });

        closeCartBtn.addEventListener('click', () => {
            cartDrawerOverlay.classList.remove('active');
        });

        checkoutProceedBtn.addEventListener('click', () => {
            if (cart.length === 0) return;
            cartDrawerOverlay.classList.remove('active');
            checkoutModal.style.display = 'flex';
        });

        closeCheckoutBtn.addEventListener('click', () => checkoutModal.style.display = 'none');
        cancelCheckoutBtn.addEventListener('click', () => checkoutModal.style.display = 'none');

        // Checkout Form Submit
        checkoutForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const custName = document.getElementById('custName').value.trim();
            const custPhone = document.getElementById('custPhone').value.trim();
            const paymentMethod = document.getElementById('paymentMethod').value;

            if (cart.length === 0) {
                toast.error('Your cart is empty.');
                return;
            }

            const totalAmount = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

            // Prepare Sale Payload for /api/sales
            const salePayload = {
                customer_id: 1, // Default walk-in / online customer
                payment_method: paymentMethod === 'cash' ? 'Cash' : (paymentMethod === 'mpesa' ? 'M-Pesa' : 'Card'),
                payment_amount: totalAmount,
                discount_amount: 0,
                notes: `Online Order by ${custName} (${custPhone})`,
                items: cart.map(i => ({
                    item_id: i.id,
                    quantity: i.qty,
                    unit_price: i.price,
                    discount: 0
                }))
            };

            submitOrderBtn.disabled = true;
            submitOrderBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing & Creating ERP Invoice...';

            try {
                const res = await fetch('/api/sales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(salePayload)
                });

                const data = await res.json();

                if (data.success) {
                    checkoutModal.style.display = 'none';

                    // Show Invoice Success Modal
                    document.getElementById('succInvoiceNo').textContent = data.data.invoice_number || 'INV-2026-0001';
                    document.getElementById('succCustName').textContent = custName;
                    document.getElementById('succTotalAmt').textContent = `Rs ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                    
                    invoiceSuccessModal.style.display = 'flex';

                    // Clear Cart & Reset Form
                    cart = [];
                    updateCartUI();
                    checkoutForm.reset();
                    loadCatalog(); // Refresh live stock
                } else {
                    toast.error(data.message || 'Failed to submit order.');
                }
            } catch (err) {
                console.error('Checkout error:', err);
                toast.error('Server error during checkout.');
            } finally {
                submitOrderBtn.disabled = false;
                submitOrderBtn.innerHTML = '<i class="fas fa-file-invoice" style="margin-right: 0.4rem;"></i> Complete Order & Generate Invoice';
            }
        });

        // Close Invoice Success Modal
        closeInvoiceSuccessBtn.addEventListener('click', () => {
            invoiceSuccessModal.style.display = 'none';
        });

        printInvoiceBtn.addEventListener('click', () => {
            window.print();
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function showError(msg) {
        toast.error(msg);
    }
});
