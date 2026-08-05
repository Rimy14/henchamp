/**
 * HenChamp Customer Portal JS (Modular)
 */

import toast from '../../js/toast.js';

document.addEventListener('DOMContentLoaded', () => {
    // State
    let catalogItems = [];
    let cart = [];
    let activeCategory = 'all';
    let lastCreatedSaleId = null;


    // DOM Elements
    const catalogGrid = document.getElementById('catalogGrid');
    const storeSearchInput = document.getElementById('storeSearchInput');
    // Dropdown filter elements
    const catDropdownWrapper  = document.getElementById('catDropdownWrapper');
    const catDropdownTrigger  = document.getElementById('catDropdownTrigger');
    const catDropdownMenu     = document.getElementById('catDropdownMenu');
    const catTriggerLabel     = document.getElementById('catTriggerLabel');
    const catTriggerIcon      = catDropdownTrigger ? catDropdownTrigger.querySelector('.cat-trigger-icon') : null;
    const catResultsCount     = document.getElementById('catResultsCount');
    
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
            const codePrefix = item.code ? item.code.split('-')[0] : (item.code_prefix || '');
            const matchesCat = activeCategory === 'all' || 
                               codePrefix === activeCategory || 
                               (item.code && item.code.startsWith(activeCategory)) ||
                               (item.category_name && item.category_name.toLowerCase().includes(activeCategory.toLowerCase()));
            
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
            if (catResultsCount) catResultsCount.textContent = '0 results';
            return;
        }

        if (catResultsCount) catResultsCount.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;

        catalogGrid.innerHTML = filtered.map(item => {
            const catPrefix = item.code ? item.code.split('-')[0] : 'PKG';
            const iconClass = categoryIcons[catPrefix] || 'fa-box-open';
            const price = parseFloat(item.selling_price || item.selling_price_incl_tax || 0);
            const stockQty = item.stock_quantity || 0;
            const stockBadgeClass = stockQty > 0 ? 'card-stock-badge' : 'card-stock-badge out-of-stock';
            const stockBadgeText = stockQty > 0 ? `${stockQty} In Stock` : 'Out of Stock';

            return `
                <div class="product-card">
                    <div class="card-image-box">
                        <i class="fas ${iconClass}"></i>
                        <span class="card-category-badge">${item.category_name || catPrefix}</span>
                        <span class="${stockBadgeClass}">${stockBadgeText}</span>
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
                <div class="cart-empty-state">
                    <div class="cart-empty-icon"><i class="fas fa-shopping-bag"></i></div>
                    <p>Your cart is empty</p>
                    <small>Add items from the catalog to get started</small>
                </div>
            `;
            checkoutProceedBtn.disabled = true;
            return;
        }

        checkoutProceedBtn.disabled = false;
        cartDrawerBody.innerHTML = cart.map((item, index) => {
            const catPrefix = item.code ? item.code.split('-')[0] : 'PKG';
            const iconClass = categoryIcons[catPrefix] || 'fa-box-open';
            const lineSubtotal = (item.price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return `
                <div class="cart-item-row">
                    <div class="cart-item-icon"><i class="fas ${iconClass}"></i></div>
                    <div class="cart-item-info">
                        <h4>${escapeHtml(item.name)}</h4>
                        <p>KES ${item.price.toLocaleString()} / unit</p>
                    </div>
                    <div class="cart-qty-ctrl">
                        <button class="cart-qty-btn decrease-qty" data-index="${index}">-</button>
                        <span style="font-weight:700;font-size:0.85rem;padding:0 0.5rem;min-width:22px;text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;line-height:30px;">${item.qty}</span>
                        <button class="cart-qty-btn increase-qty" data-index="${index}">+</button>
                    </div>
                </div>
            `;
        }).join('');

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

    function selectCategory(cat) {
        activeCategory = cat;

        // Update dropdown options — mark active
        if (catDropdownMenu) {
            catDropdownMenu.querySelectorAll('.cat-dropdown-option').forEach(opt => {
                const isActive = opt.dataset.cat === cat;
                opt.classList.toggle('active', isActive);
                opt.setAttribute('aria-selected', isActive ? 'true' : 'false');

                // Sync trigger icon + label from the active option
                if (isActive) {
                    const icon  = opt.querySelector('.cat-option-icon').innerHTML;
                    const label = opt.querySelector('.cat-option-text').textContent;
                    if (catTriggerLabel) catTriggerLabel.textContent = label;
                    if (catTriggerIcon)  catTriggerIcon.innerHTML = icon;
                }
            });
        }

        // Close dropdown
        if (catDropdownWrapper) catDropdownWrapper.classList.remove('open');
        if (catDropdownTrigger) catDropdownTrigger.setAttribute('aria-expanded', 'false');

        renderCatalog();
    }

    function setupEventListeners() {
        // Search
        storeSearchInput.addEventListener('input', renderCatalog);

        // ── Custom Dropdown ──────────────────────────────────────────────────
        if (catDropdownTrigger) {
            catDropdownTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = catDropdownWrapper.classList.toggle('open');
                catDropdownTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            });
        }

        if (catDropdownMenu) {
            catDropdownMenu.querySelectorAll('.cat-dropdown-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    selectCategory(opt.dataset.cat);
                });
            });
        }

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (catDropdownWrapper && !catDropdownWrapper.contains(e.target)) {
                catDropdownWrapper.classList.remove('open');
                if (catDropdownTrigger) catDropdownTrigger.setAttribute('aria-expanded', 'false');
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && catDropdownWrapper) {
                catDropdownWrapper.classList.remove('open');
                if (catDropdownTrigger) catDropdownTrigger.setAttribute('aria-expanded', 'false');
            }
        });
        // ────────────────────────────────────────────────────────────────────

        // Footer Category Links
        document.querySelectorAll('.footer-category-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const cat = e.currentTarget.dataset.cat;
                selectCategory(cat);
                const catalogEl = document.getElementById('catalogGrid');
                if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
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

            let mappedPaymentMethod = 'Cash';
            let mappedPaymentStatus = 'Paid';
            let noteTag = '[Cash on Delivery]';

            if (paymentMethod === 'cash') {
                mappedPaymentMethod = 'Cash';
                mappedPaymentStatus = 'Pending';
                noteTag = '[Cash on Delivery]';
            } else if (paymentMethod === 'credit') {
                mappedPaymentMethod = 'Credit';
                mappedPaymentStatus = 'Pending';
                noteTag = '[Credit Account Net 30]';
            } else if (paymentMethod === 'mpesa') {
                mappedPaymentMethod = 'Card';
                mappedPaymentStatus = 'Paid';
                noteTag = '[M-Pesa Express]';
            } else {
                mappedPaymentMethod = 'Card';
                mappedPaymentStatus = 'Paid';
                noteTag = '[Credit/Debit Card]';
            }

            const actualPaymentAmount = (paymentMethod === 'cash' || paymentMethod === 'credit') ? 0 : totalAmount;

            // Prepare Sale Payload for /api/sales
            const salePayload = {
                customer_id: 1, // Default customer
                payment_method: mappedPaymentMethod,
                payment_status: mappedPaymentStatus,
                payment_amount: actualPaymentAmount,
                discount_amount: 0,
                notes: `${noteTag} Online Order by ${custName} (${custPhone})`,
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

                    lastCreatedSaleId = data.data.id || data.data.sale_id;

                    // Show Invoice Success Modal
                    document.getElementById('succInvoiceNo').textContent = data.data.invoice_number || 'INV-2026-0001';
                    document.getElementById('succCustName').textContent = custName;
                    document.getElementById('succTotalAmt').textContent = `KES ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                    
                    invoiceSuccessModal.style.display = 'flex';

                    // Clear Cart & Reset Form
                    cart = [];
                    updateCartUI();
                    checkoutForm.reset();
                    loadCatalog(); // Refresh live stock
                } else {
                    let userMsg = data.message || 'Failed to submit order.';
                    if (userMsg.includes('Insufficient stock')) {
                        userMsg = 'One or more items in your cart are currently on backorder. Our sales team will contact you shortly to confirm fulfillment.';
                    }
                    toast.error(userMsg);
                }

            } catch (err) {
                console.error('Checkout error:', err);
                toast.error('Server error during checkout.');
            } finally {
                submitOrderBtn.disabled = false;
                submitOrderBtn.innerHTML = '<i class="fas fa-file-invoice" style="margin-right: 0.4rem;"></i> Complete Order & Generate Invoice';
            }
        });

        // Close Invoice Success Modal & Continue Shopping
        const continueShoppingBtn = document.getElementById('continueShoppingBtn');
        if (continueShoppingBtn) {
            continueShoppingBtn.addEventListener('click', () => {
                invoiceSuccessModal.style.display = 'none';
            });
        }

        closeInvoiceSuccessBtn.addEventListener('click', () => {
            invoiceSuccessModal.style.display = 'none';
        });

        const printInvoiceBtn = document.getElementById('printInvoiceBtn');
        if (printInvoiceBtn) {
            printInvoiceBtn.addEventListener('click', () => {
                if (lastCreatedSaleId) {
                    // Print seamlessly via hidden iframe without redirecting or opening new tabs
                    const iframeId = 'portal-invoice-print-frame';
                    let iframe = document.getElementById(iframeId);
                    if (iframe) {
                        document.body.removeChild(iframe);
                    }
                    iframe = document.createElement('iframe');
                    iframe.id = iframeId;
                    iframe.style.position = 'fixed';
                    iframe.style.right = '0';
                    iframe.style.bottom = '0';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    iframe.style.border = '0';

                    iframe.src = `/pages/print-invoice.html?id=${lastCreatedSaleId}`;
                    document.body.appendChild(iframe);
                } else {
                    toast.error('Invoice details not found.');
                }
            });
        }



    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function showError(msg) {
        toast.error(msg);
    }
});
