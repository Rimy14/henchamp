/**
 * Point of Sale functionality
 */

// Force reload of categories if needed
window.reloadCategories = loadCategories;

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import messageModal from './message-modal.js';
import SearchableDropdown from './searchable-dropdown.js';

// State
let products = [];
let customers = [];
let cart = [];
let payments = []; // Array of { method, amount, reference }
let categories = []; // Added missing definition
let currentCategory = 'all'; // Added missing definition
let operators = []; // NEW: Available operators
let selectedOperators = []; // NEW: Selected operators for current sale

let isSaleProcessing = false;
let currentSaleRequestId = 0;

let customerDropdown = null; // Searchable dropdown instance for customers
let productPage = 1;
let productLimit = 20;
let hasMoreProducts = true;
let isProductSearching = false;
let productSearchTimer = null;
let currentSearchTerm = '';



// Named event handler for global keydown to prevent duplicates
function handleGlobalKeydown(e) {
    if (e.key === 'Escape') {
        const pModal = document.getElementById('paymentModal');
        const dModal = document.getElementById('discountModal');

        if (pModal && pModal.style.display === 'flex') {
            closePaymentModal();
        }
        if (dModal && dModal.style.display === 'flex') {
            closeDiscountModal();
        }
    }

    // Focus search with '/'
    const searchInput = document.getElementById('searchInput');
    if (e.key === '/' && searchInput && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
    }
}

export async function initPOS() {
    console.log('Initializing POS...');

    // Check authentication
    const isAuth = await auth.requireAuth();
    if (!isAuth) return;

    // Clean up any open modals from previous session
    const modalsToClose = ['messageModal', 'receiptPreviewModal', 'paymentModal', 'discountModal', 'confirmationModal', 'quickCustomerModal'];
    modalsToClose.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('show');
        }
    });

    // Load initial data with safety timeout
    try {
        // Race between actual loading and 10-second safety timeout
        await Promise.race([
            Promise.all([
                loadCategories(),
                loadProducts(),
                loadCustomers(),
                loadOperators(), // NEW: Load operators

            ]),
            new Promise((resolve) => setTimeout(() => {
                console.warn('POS initialization timeout - continuing anyway');
                resolve();
            }, 10000)) // 10 second safety net
        ]);
        await loadCartFromDB();
    } catch (err) {
        console.error('POS Init Error:', err);
        toast.error('Error initializing POS');
    }

    // Attach Event listeners
    attachListeners();



    // Load User Info into Top Bar
    loadUserInfo();

    // Global Keydown (deduplicated by reference)
    document.addEventListener('keydown', handleGlobalKeydown);
}



function loadUserInfo() {
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');

    if (auth.currentUser) {
        if (userNameEl) userNameEl.textContent = auth.currentUser.name || auth.currentUser.username;
        if (userRoleEl) userRoleEl.textContent = auth.currentUser.role;
    }
}

function attachListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', handleSearch);

    // POS product search
    const productSearch = document.getElementById('productSearch');
    if (productSearch) productSearch.addEventListener('input', handleProductSearch);

    const productsGrid = document.getElementById('productsGrid');
    if (productsGrid) {
        productsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card) {
                const id = card.dataset.id;
                if (id) addToCart(parseInt(id));
            }
        });
    }

    const taxInput = document.getElementById('taxInput');
    if (taxInput) taxInput.addEventListener('input', updateTotals);

    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckoutBtnClick);

    const clearCartBtn = document.getElementById('clearCartBtn');
    if (clearCartBtn) clearCartBtn.addEventListener('click', clearCart);

    // NEW: Activate Scan Button


    const customerSelect = document.getElementById('customerSelect');
    if (customerSelect) {
        customerSelect.addEventListener('change', (e) => {
            // Optional: Handle customer selection change specifically if needed
        });
    }

    setupPaymentModalListeners();
    setupDiscountModalListeners();
    setupGlobalDiscountModalListeners();
    setupQuickCustomerListeners();
}



function setupGlobalDiscountModalListeners() {
    const modal = document.getElementById('globalDiscountModal');
    const openBtn = document.getElementById('openGlobalDiscountBtn');

    const applyBtn = document.getElementById('applyGlobalDiscountBtn');
    const clearBtn = document.getElementById('clearGlobalDiscountBtn');
    const amountInput = document.getElementById('discountAmount');
    const percentInput = document.getElementById('discountPercent');

    // Open modal
    if (openBtn && modal) {
        openBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            setTimeout(() => amountInput?.focus(), 50);
        });
    }

    // Mutual exclusivity: entering flat amount clears percentage
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            if (amountInput.value && parseFloat(amountInput.value) > 0) {
                if (percentInput) percentInput.value = '';
            }
            updateTotals();
        });
    }

    // Mutual exclusivity: entering percentage clears flat amount
    if (percentInput) {
        percentInput.addEventListener('input', () => {
            if (percentInput.value && parseFloat(percentInput.value) > 0) {
                if (amountInput) amountInput.value = '';
            }
            updateTotals();
        });
    }

    // Apply button — close modal and save cart
    if (applyBtn && modal) {
        applyBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            saveCartToDB();
        });
    }

    // Clear discount button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (amountInput) amountInput.value = '';
            if (percentInput) percentInput.value = '';
            updateTotals();
            modal.style.display = 'none';
            saveCartToDB();
        });
    }

    // Close on backdrop click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    // Attach Logout Listener (Top Bar)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await auth.logout();
        });
    }
}

function setupPaymentModalListeners() {
    const paymentModal = document.getElementById('paymentModal');
    // Close on backdrop
    if (paymentModal) {
        paymentModal.addEventListener('click', (e) => {
            if (e.target.id === 'paymentModal') closePaymentModal();
        });
    }

    document.getElementById('modalAddPaymentBtn')?.addEventListener('click', handleModalAddPayment);
    document.getElementById('modalExactPaymentBtn')?.addEventListener('click', fillExactPayment);
    document.getElementById('modalPaymentAmount')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleModalAddPayment();
    });
}

function setupDiscountModalListeners() {
    const discountModal = document.getElementById('discountModal');
    // Close on backdrop
    if (discountModal) {
        discountModal.addEventListener('click', (e) => {
            if (e.target.id === 'discountModal') closeDiscountModal();
        });
    }

    document.getElementById('applyDiscountBtn')?.addEventListener('click', applyItemDiscount);
    document.getElementById('removeDiscountBtn')?.addEventListener('click', removeItemDiscount);
    document.getElementById('discountAmountInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyItemDiscount();
    });
}


window.openQuickCustomerModal = function () {
    console.log('[DEBUG] openQuickCustomerModal called');
    const modal = document.getElementById('quickCustomerModal');
    if (modal) {
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        modal.style.cssText = 'display: flex !important; z-index: 10050;';
        modal.classList.add('show');
        setTimeout(() => {
            const nameInput = document.getElementById('quickCustomerName');
            if (nameInput) nameInput.focus();
        }, 50);
    } else {
        console.error('[ERROR] #quickCustomerModal element not found in DOM!');
    }
};

window.closeQuickCustomerModal = function () {
    const modal = document.getElementById('quickCustomerModal');
    const form = document.getElementById('quickCustomerForm');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    if (form) form.reset();
};

function setupQuickCustomerListeners() {
    const modal = document.getElementById('quickCustomerModal');
    const openBtn = document.getElementById('addQuickCustomerBtn');
    const closeBtn = document.getElementById('closeQuickCustomerModalBtn');
    const cancelBtn = document.getElementById('cancelQuickCustomerBtn');
    const form = document.getElementById('quickCustomerForm');

    if (openBtn) {
        // Clone button to ensure no duplicate event listeners persist across re-inits
        const newOpenBtn = openBtn.cloneNode(true);
        openBtn.parentNode.replaceChild(newOpenBtn, openBtn);

        newOpenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.openQuickCustomerModal();
        });
    }

    const closeModal = window.closeQuickCustomerModal;

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }


    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const customerData = {
                name: document.getElementById('quickCustomerName').value,
                phone: document.getElementById('quickCustomerPhone').value,
                email: null, // Default to null for quick add
                city: null,  // Default to null for quick add
                company: 'PRINTHUB',
                address: document.getElementById('quickCustomerAddress').value || null,
                credit_period: parseInt(document.getElementById('quickCustomerCreditPeriod').value) || 30
            };

            loadingScreen.show('Creating customer...');
            try {
                const response = await api.customers.create(customerData);
                if (response.success) {
                    messageModal.success('Customer created successfully!', 'Customer Added');
                    closeModal();

                    // The customer list in the state isn't strictly needed for the dropdown 
                    // since SearchableDropdown uses asyncSource, but we should update the UI.

                    // Re-render the customer select to include the new option and select it
                    const select = document.getElementById('customerSelect');
                    const newOption = new Option(
                        customerData.name,
                        response.data.id,
                        true,
                        true
                    );
                    select.add(newOption);

                    // Trigger change for any other listeners
                    select.dispatchEvent(new Event('change', { bubbles: true }));

                    // If SearchableDropdown instance exists, we might need to update its display
                    if (customerDropdown) {
                        const displayText = customerDropdown.wrapper.querySelector('.searchable-dropdown-text');
                        if (displayText) {
                            displayText.textContent = newOption.text;
                        }
                    }
                } else {
                    toast.error(response.message || 'Failed to create customer');
                }
            } catch (error) {
                console.error('Error creating customer:', error);
                toast.error('Failed to create customer');
            } finally {
                loadingScreen.hide();
            }
        });
    }
}

// Load categories from API
async function loadCategories() {
    try {
        const response = await api.get('/categories');
        if (response.success) {
            categories = response.data;
            renderCategories();
        }
    } catch (error) {
        console.error('Failed to load categories:', error);
        toast.error('Failed to load categories');
    }
}

// Render category filter
function renderCategories() {
    const filterContainer = document.getElementById('categoryFilter');
    if (!filterContainer) return;

    // Keep "All Items" button
    filterContainer.innerHTML = `
        <button class="category-pill ${currentCategory === 'all' ? 'active' : ''}" data-id="all">All Items</button>
    `;

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-pill ${currentCategory == cat.id ? 'active' : ''}`;
        btn.dataset.id = cat.id;
        btn.textContent = cat.name;
        filterContainer.appendChild(btn);
    });

    // Add event listeners
    filterContainer.querySelectorAll('.category-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            filterContainer.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
            // Add active class to clicked
            btn.classList.add('active');

            currentCategory = btn.dataset.id;
            loadProducts(); // Load from server based on new category
        });
    });
}

async function loadProducts(append = false) {
    if (!append) {
        productPage = 1;
        hasMoreProducts = true;
    }

    try {
        const loadingGrid = document.getElementById('productsGrid');
        if (!append && loadingGrid) loadingGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        let response = await api.items.getAll({
            type: 'Finished Goods',
            category_id: currentCategory !== 'all' ? currentCategory : undefined,
            search: currentSearchTerm,
            page: productPage,
            limit: productLimit
        });

        // Fallback: If no Finished Goods type is returned, fetch all active items
        if (response.success && (!response.data || response.data.length === 0) && currentCategory === 'all' && !currentSearchTerm) {
            response = await api.items.getAll({
                category_id: undefined,
                page: productPage,
                limit: productLimit
            });
        }

        if (response.success) {
            const newProducts = response.data;
            if (append) {
                products = [...products, ...newProducts];
            } else {
                products = newProducts;
            }

            hasMoreProducts = newProducts.length === productLimit;
            renderProducts(products);
        } else {
            toast.error('Failed to fetch products');
        }

    } catch (error) {
        console.error('Error loading products:', error);
        toast.error('Failed to load products');
    }
}

async function loadCustomers() {
    try {
        // Fetch only first few customers initially
        const response = await api.customers.getAll({ limit: 10 });
        if (response.success) {
            customers = response.data;
            renderCustomerSelect();
        }
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

// NEW: Load operators from API
async function loadOperators() {
    try {
        const response = await api.get('/operators');
        if (response.success) {
            operators = response.data;
        }
    } catch (error) {
        console.error('Error loading operators:', error);
        toast.error('Failed to load operators');
    }
}



function renderProducts(productsToShow) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    if (!productsToShow || productsToShow.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--gray-500);">No products found</div>';
        return;
    }

    let html = productsToShow.map(product => `
        <div class="product-card" data-id="${product.id}">
            <h4>${product.name}</h4>
            <div class="product-price">KSh ${(parseFloat(product.selling_price_incl_tax) || parseFloat(product.selling_price) || 0).toFixed(2)}</div>
            <div class="product-stock" style="font-size: 0.85rem; color: #666; margin-top: 4px;">
                Stock: <strong>${product.shop_stock || 0}</strong>
            </div>
        </div>
    `).join('');

    if (hasMoreProducts) {
        html += `
            <div id="loadMoreContainer" style="grid-column: 1/-1; text-align: center; padding: 1rem;">
                <button id="loadMoreProductsBtn" class="btn btn-secondary btn-sm" style="width: 200px;">
                    Load More...
                </button>
            </div>
        `;
    }

    grid.innerHTML = html;

    // Attach load more listener
    document.getElementById('loadMoreProductsBtn')?.addEventListener('click', () => {
        productPage++;
        loadProducts(true);
    });
}

function handleProductSearch(e) {
    currentSearchTerm = e.target.value.toLowerCase().trim();

    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => {
        loadProducts();
    }, 300);
}

// Global addToCart no longer needed for window, but keep function for internal use.
// window.addToCart = addToCart; // Removing to keep module clean.

function renderCustomerSelect() {
    const select = document.getElementById('customerSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Select Customer (Optional)</option>' +
        customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    // Initialize searchable dropdown with async search
    if (customerDropdown) {
        customerDropdown.destroy();
    }

    customerDropdown = new SearchableDropdown(select, {
        asyncSource: async (term) => {
            try {
                const response = await api.customers.getAll({ search: term, limit: 10 });
                if (response.success) {
                    return response.data.map(c => ({
                        text: c.name,
                        value: c.id
                    }));
                }
                return [];
            } catch (error) {
                console.error('Search error:', error);
                return [];
            }
        },
        minLength: 1
    });
}

function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    const filtered = products.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.includes(term))
    );
    renderProducts(filtered);
}

function addToCart(productId) {
    // Use loose equality to handle string/number ID mismatch
    const product = products.find(p => p.id == productId);

    if (!product) {
        console.error(`Product not found for ID: ${productId}`);
        return;
    }

    const existingItem = cart.find(item => item.product_id == productId);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            product_id: product.id,
            name: product.name,
            barcode: product.barcode,
            price: parseFloat(product.selling_price_excl_tax || product.selling_price || 0),
            price_incl: parseFloat(product.selling_price_incl_tax || product.selling_price || 0),
            tax_rate: parseFloat(product.tax_rate) || 0,
            original_tax_rate: parseFloat(product.tax_rate) || 0,
            is_tax_exempt: false,
            quantity: 1,
            discount_amount: 0,
            discount_percentage: 0
        });
    }

    renderCart(); // This calls updateTotals
    toast.success('Added to cart');
    saveCartToDB(); // Auto-save
}

// Expose other needed functions to window if used in HTML Attributes (unlikely now, but safety)
// But renderCart uses listeners for buttons inside it.

function renderCart() {
    console.log('[DEBUG] renderCart called, cart length:', cart.length);
    console.log('[DEBUG] cart contents:', JSON.stringify(cart, null, 2));

    const container = document.getElementById('cartItems');
    console.log('[DEBUG] container element:', container);

    if (!container) {
        console.error('[ERROR] cartItems container not found!');
        return;
    }

    if (cart.length === 0) {
        console.log('[DEBUG] Cart is empty, showing empty message');
        container.innerHTML = `
            <div class="empty-cart-message" style="text-align: center; padding: 2rem; color: var(--gray-500);">
                <i class="fas fa-shopping-cart fa-3x" style="opacity: 0.3; margin-bottom: 1rem;"></i>
                <p>Cart is empty</p>
                <p style="font-size: 0.875rem;">Scan barcode or search products to add</p>
            </div>
        `;
        updateTotals();
        return;
    }

    console.log('[DEBUG] Rendering', cart.length, 'items');

    try {
        const html = cart.map((item, index) => {
            console.log(`[DEBUG] Rendering item ${index}:`, item);
            const isExempt = item.is_tax_exempt;
            const displayPrice = isExempt ? item.price : (item.price_incl || item.price);
            
            return `
        <div class="cart-item">
            <div class="cart-item-header">
                <div class="cart-item-title">
                    <span class="cart-item-name">${item.name}</span>
                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                        <span class="cart-item-price">KSh ${(parseFloat(displayPrice) || 0).toFixed(2)}</span>
                        ${(!isExempt && item.tax_rate > 0) ? `<small style="font-size: 0.65rem; color: var(--gray-500);">Excl: KSh ${(parseFloat(item.price) || 0).toFixed(2)} + ${item.tax_rate}% Tax</small>` : (isExempt ? `<small style="font-size: 0.65rem; color: var(--warning); font-weight: bold;">Tax Exempt</small>` : '')}
                    </div>
                </div>
            </div>
            
            <div class="cart-item-controls">
                <div class="qty-control">
                    <button class="btn-qty" onclick="window.updateQty(${index}, -1)">
                        <i class="fas fa-minus"></i>
                    </button>
                    <input type="number" class="qty-input" value="${item.quantity}" 
                        onchange="window.setQty(${index}, this.value)" min="1">
                    <button class="btn-qty" onclick="window.updateQty(${index}, 1)">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                
                <div class="item-actions">
                    <button class="btn-discount ${(parseFloat(item.discount_amount) || 0) > 0 ? 'active' : ''}" 
                        onclick="window.openDiscountModal(${index})"
                        title="${(parseFloat(item.discount_amount) || 0) > 0 ? `KSh ${(parseFloat(item.discount_amount) || 0).toFixed(2)} off` : 'Add Discount'}">
                        <i class="fas fa-percent"></i>
                    </button>
                    ${(item.original_tax_rate > 0) ? `
                    <button class="btn-tax ${item.is_tax_exempt ? 'exempt' : 'active'}" 
                        onclick="window.toggleItemTax(${index})"
                        title="${item.is_tax_exempt ? 'Tax Exempt' : 'Tax Applied'}"
                        style="${item.is_tax_exempt ? 'color: var(--gray-400);' : 'color: var(--success);'} background: none; border: none; cursor: pointer; margin-right: 0.2rem; font-size: 0.9rem;">
                        <i class="fas fa-file-invoice-dollar"></i>
                    </button>
                    ` : ''}
                    <button class="btn-remove" onclick="window.removeFromCart(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
             ${(parseFloat(item.discount_amount) || 0) > 0 ? `
                <div class="item-discount-info">
                    <small>Discount: -KSh ${(parseFloat(item.discount_amount) || 0).toFixed(2)}</small>
                </div>
            ` : ''}
        </div>
    `;
        }).join('');

        console.log('[DEBUG] Generated HTML length:', html.length);
        console.log('[DEBUG] HTML preview:', html.substring(0, 200));

        container.innerHTML = html;
        console.log('[DEBUG] HTML set successfully');
    } catch (error) {
        console.error('[ERROR] Error rendering cart:', error);
        console.error('[ERROR] Stack:', error.stack);
    }

    updateTotals();
    console.log('[DEBUG] renderCart complete');
}

window.updateQty = updateQty;
window.setQty = setQty;
window.removeFromCart = removeFromCart;
window.toggleItemTax = toggleItemTax;
window.openDiscountModal = openDiscountModal;
window.openGlobalDiscountModal = function() {
    const modal = document.getElementById('globalDiscountModal');
    if (modal) modal.style.display = 'flex';
};
window.closePaymentModal = closePaymentModal;
window.closeDiscountModal = closeDiscountModal;
window.applyItemDiscount = applyItemDiscount;
window.removeItemDiscount = removeItemDiscount;



function clearTransientSaleMessages() {
    messageModal.close();
    
    if (typeof toast.clearAll === 'function') {
        toast.clearAll();
    }
}

// Confirmation Modal Logic
let confirmCallback = null;

window.closeConfirmModal = function () {
    const modal = document.getElementById('confirmationModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
        confirmCallback = null;
    }
};

function showConfirm(title, message, callback) {
    const modal = document.getElementById('confirmationModal');
    const titleEl = document.getElementById('confirmTitle');
    const contentEl = document.getElementById('confirmContent');
    const confirmBtn = document.getElementById('confirmActionBtn');

    if (!modal) return;

    titleEl.textContent = title;
    contentEl.textContent = message;
    confirmCallback = callback;

    // Reset button listener to avoid stacking
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    document.getElementById('confirmActionBtn').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        window.closeConfirmModal();
    });

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    document.getElementById('confirmActionBtn').focus();
}

function updateQty(index, change) {
    const item = cart[index];
    const newQty = item.quantity + change;

    if (newQty < 1) return;

    // Prevent reducing quantity if payments exist
    if (change < 0 && hasPartialPayments()) {
        warnAboutPayments('reduce quantity');
        return;
    }

    item.quantity = newQty;
    renderCart();
    saveCartToDB(); // Auto-save
}

function setQty(index, value) {
    const qty = parseInt(value);
    const item = cart[index];

    if (isNaN(qty) || qty < 1) {
        renderCart();
        return;
    }

    // Prevent reducing quantity if payments exist
    if (qty < item.quantity && hasPartialPayments()) {
        warnAboutPayments('reduce quantity');
        renderCart(); // Reset to current quantity
        return;
    }

    if (qty > item.max_quantity) {
        toast.error(`Only ${item.max_quantity} in stock`);
        item.quantity = item.max_quantity;
    } else {
        item.quantity = qty;
    }
    renderCart();
    saveCartToDB(); // Auto-save
}

function removeFromCart(index) {
    // Prevent deletion if payments exist
    if (hasPartialPayments()) {
        warnAboutPayments('delete items');
        return;
    }

    cart.splice(index, 1);
    renderCart();
    saveCartToDB(); // Auto-save
}

function toggleItemTax(index) {
    // Prevent modifying tax if payments exist
    if (hasPartialPayments()) {
        warnAboutPayments('modify tax');
        return;
    }

    const item = cart[index];
    if (item.is_tax_exempt) {
        item.is_tax_exempt = false;
        item.tax_rate = item.original_tax_rate;
    } else {
        item.is_tax_exempt = true;
        item.tax_rate = 0;
        // If tax is exempt, we should recalculate the base discount amount if there is a discount?
        // Actually, if we apply discount while exempt, it's against the exempt price, which is exclusive price.
        // It's a small edge case. Let's just reset the discount if tax exemption is toggled to avoid confusion.
        if (item.discount_amount > 0) {
            item.discount_amount = 0;
            item.discount_percentage = 0;
            toast.info('Item discount removed due to tax change');
        }
    }
    
    renderCart();
    saveCartToDB();
    toast.success(item.is_tax_exempt ? 'Item tax removed' : 'Item tax applied');
}

function clearCart() {
    // Prevent clearing if payments exist
    if (hasPartialPayments()) {
        warnAboutPayments('clear cart');
        return;
    }

    cart = [];
    payments = [];
    selectedOperators = []; // NEW: Reset operators
    document.getElementById('taxInput').value = 0;
    // Reset invoice discount
    const discountAmountEl = document.getElementById('discountAmount');
    const discountPercentEl = document.getElementById('discountPercent');
    if (discountAmountEl) discountAmountEl.value = '';
    if (discountPercentEl) discountPercentEl.value = '';
    renderCart();
    saveCartToDB(); // Auto-save
}

// Discount Logic
let currentDiscountItemIndex = -1;

function openDiscountModal(index) {
    currentDiscountItemIndex = index;
    const item = cart[index];
    const displayPrice = item.price_incl || item.price;
    const total = displayPrice * item.quantity;

    document.getElementById('discountItemName').textContent = item.name;
    document.getElementById('discountItemTotal').textContent = `KSh ${total.toFixed(2)}`;
    document.getElementById('discountAmountInput').value = item.discount_amount || '';

    // Assuming we might have percentage field later, for now just amount
    // document.getElementById('discountPercentInput').value = item.discount_percentage || '';

    document.getElementById('discountModal').style.display = 'flex';
}

function closeDiscountModal() {
    document.getElementById('discountModal').style.display = 'none';
    currentDiscountItemIndex = -1;
}

function applyItemDiscount() {
    if (currentDiscountItemIndex === -1) return;

    const amount = parseFloat(document.getElementById('discountAmountInput').value) || 0;
    const percent = parseFloat(document.getElementById('discountPercentInput').value) || 0;

    const item = cart[currentDiscountItemIndex];
    
    // In retail POS, discounts are typically applied against the final (inclusive) price.
    // However, our backend tax computation expects the discount to be off the base (exclusive) price.
    // If we deduct 100 KSh from a 1000 KSh (Incl) item (10% tax), the new Incl price is 900.
    // New Excl price = 900 / 1.1 = 818.18. Original Excl = 909.09. Excl Discount = 909.09 - 818.18 = 90.91.
    // So base discount = amount / (1 + tax_rate/100).
    const taxRateMultiplier = 1 + (item.tax_rate / 100);
    const baseAmount = amount / taxRateMultiplier;

    const itemTotalExcl = item.price * item.quantity;
    const itemTotalIncl = (item.price_incl || item.price) * item.quantity;

    // Validation
    if (amount < 0 || amount > itemTotalIncl) {
        messageModal.error(`Discount amount cannot be negative or exceed the item total of KSh ${itemTotalIncl.toFixed(2)}.`, 'Invalid Discount');
        return;
    }

    // We store the base discount amount since our calculateTotals uses it against item.price
    item.discount_amount = baseAmount;
    item.discount_percentage = percent; // Store if we use it

    closeDiscountModal();
    renderCart();
    toast.success('Discount applied');
}

function removeItemDiscount() {
    if (currentDiscountItemIndex === -1) return;

    cart[currentDiscountItemIndex].discount_amount = 0;
    cart[currentDiscountItemIndex].discount_percentage = 0;

    closeDiscountModal();
    renderCart();
}


// Helper to calculate totals object using Decimal.js for precision
function calculateTotals() {
    // Use Decimal.js for precise currency calculations
    let subtotal = new Decimal(0);
    let itemDiscount = new Decimal(0);
    let totalTaxAmount = new Decimal(0);

    for (const item of cart) {
        const qty = new Decimal(item.quantity);
        const pExcl = new Decimal(item.price); // price is excl tax base
        const itemSubtotal = pExcl.times(qty);
        subtotal = subtotal.plus(itemSubtotal);

        const disc = new Decimal(item.discount_amount || 0);
        itemDiscount = itemDiscount.plus(disc);
        
        // Tax calculation: (price * qty - item_discount) * tax_rate / 100
        const itemTaxable = Decimal.max(0, itemSubtotal.minus(disc));
        const taxRate = new Decimal(item.tax_rate || 0);
        const itemTax = itemTaxable.times(taxRate).div(100);
        totalTaxAmount = totalTaxAmount.plus(itemTax);
    }

    // Invoice-level discount (mutually exclusive: flat amount takes priority)
    const invoiceDiscountAmount = parseFloat(document.getElementById('discountAmount')?.value) || 0;
    const invoiceDiscountPercent = parseFloat(document.getElementById('discountPercent')?.value) || 0;
    const afterItemDiscount = subtotal.minus(itemDiscount);

    let invoiceDiscount;
    if (invoiceDiscountAmount > 0) {
        invoiceDiscount = new Decimal(invoiceDiscountAmount);
    } else if (invoiceDiscountPercent > 0) {
        invoiceDiscount = afterItemDiscount.times(invoiceDiscountPercent).div(100);
    } else {
        invoiceDiscount = new Decimal(0);
    }
    // Guard: invoice discount cannot exceed after-item subtotal
    invoiceDiscount = Decimal.min(invoiceDiscount, Decimal.max(0, afterItemDiscount));

    const totalDiscount = itemDiscount.plus(invoiceDiscount);
    
    // Proportionally reduce total tax if there is an invoice discount applied across the cart
    let finalTaxAmount = totalTaxAmount;
    if (invoiceDiscount.greaterThan(0) && afterItemDiscount.greaterThan(0)) {
        const discountRatio = invoiceDiscount.div(afterItemDiscount);
        finalTaxAmount = totalTaxAmount.times(new Decimal(1).minus(discountRatio));
    }

    const taxableAmount = subtotal.minus(totalDiscount);
    const total = Decimal.max(0, taxableAmount.plus(finalTaxAmount));

    return {
        subtotal: subtotal.toDecimalPlaces(2).toNumber(),
        itemDiscount: itemDiscount.toDecimalPlaces(2).toNumber(),
        invoiceDiscount: invoiceDiscount.toDecimalPlaces(2).toNumber(),
        discount: totalDiscount.toDecimalPlaces(2).toNumber(),
        taxAmount: finalTaxAmount.toDecimalPlaces(2).toNumber(),
        total: total.toDecimalPlaces(2).toNumber()
    };
}

// Helper for Grand Total (used by payments)
function calculateGrandTotal() {
    return calculateTotals().total;
}

// Helper for Total Paid
function calculateTotalPaid() {
    return payments.reduce((sum, p) => sum + p.amount, 0);
}

// Helper to check if payments exist
function hasPartialPayments() {
    return payments.length > 0;
}

// Warning message for cart modifications when payments exist
function warnAboutPayments(action) {
    const totalPaid = calculateTotalPaid();
    messageModal.warning(
        'Modifying the cart will automatically remove all current payments to ensure the totals match.',
        'Payments Will Be Cleared'
    );
}

// Validate void password with backend
async function validateVoidPassword(password) {
    try {
        const response = await fetch('/api/void/validate-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error validating void password:', error);
        return false;
    }
}

// Totals Calculation & UI Update
function updateTotals() {
    const { subtotal, itemDiscount, invoiceDiscount, discount, taxAmount, total } = calculateTotals();

    document.getElementById('subtotalAmount').textContent = `KSh ${subtotal.toFixed(2)}`;
    document.getElementById('taxAmount').textContent = `KSh ${taxAmount.toFixed(2)}`;
    document.getElementById('totalAmount').textContent = `KSh ${total.toFixed(2)}`;

    // Item discounts row — only show when there are item discounts
    const itemDiscountRow = document.getElementById('itemDiscountRow');
    const discountAmountDisplay = document.getElementById('discountAmountDisplay');
    if (itemDiscount > 0) {
        if (itemDiscountRow) itemDiscountRow.style.display = 'flex';
        if (discountAmountDisplay) discountAmountDisplay.textContent = `-KSh ${itemDiscount.toFixed(2)}`;
    } else {
        if (itemDiscountRow) itemDiscountRow.style.display = 'none';
    }

    // Invoice discount row — only show when there is an invoice discount
    const invoiceDiscountRow = document.getElementById('invoiceDiscountRow');
    const invoiceDiscountDisplay = document.getElementById('invoiceDiscountDisplay');
    const invoiceDiscountBadge = document.getElementById('invoiceDiscountBadge');
    const openGlobalDiscountBtn = document.getElementById('openGlobalDiscountBtn');
    if (invoiceDiscount > 0) {
        if (invoiceDiscountRow) invoiceDiscountRow.style.display = 'flex';
        if (invoiceDiscountDisplay) invoiceDiscountDisplay.textContent = `-KSh ${invoiceDiscount.toFixed(2)}`;
        if (invoiceDiscountBadge) { invoiceDiscountBadge.textContent = `-KSh ${invoiceDiscount.toFixed(2)}`; invoiceDiscountBadge.style.display = 'inline'; }
        if (openGlobalDiscountBtn) openGlobalDiscountBtn.classList.add('has-discount');
    } else {
        if (invoiceDiscountRow) invoiceDiscountRow.style.display = 'none';
        if (invoiceDiscountBadge) invoiceDiscountBadge.style.display = 'none';
        if (openGlobalDiscountBtn) openGlobalDiscountBtn.classList.remove('has-discount');
    }

    // Enable/Disable checkout
    document.getElementById('checkoutBtn').disabled = cart.length === 0;

    // Update compact summary if visible
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    const balance = total - paid;
    document.getElementById('balanceCompact').textContent = `KSh ${balance.toFixed(2)}`;
    document.getElementById('paidAmountCompact').textContent = `KSh ${paid.toFixed(2)}`;

    if (balance <= 0 && cart.length > 0) {
        document.getElementById('checkoutBtn').textContent = 'Complete Sale';
    } else {
        document.getElementById('checkoutBtn').textContent = 'Process Payment';
    }
}


// Payment & Checkout Logic

function handleCheckoutBtnClick() {
    clearTransientSaleMessages();

    const total = parseFloat(document.getElementById('totalAmount').textContent.replace('KSh ', '')) || 0;
    if (cart.length === 0) return;


    // Customer selection is now optional for initial checkout
    // Validation will happen at payment/completion stage if credit/partial payment is involved

    // Check if fully paid
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    if (paid >= total) {
        handleCompleteSale();
        return;
    }

    openPaymentModal();
}

function openPaymentModal() {
    clearTransientSaleMessages();

    const modal = document.getElementById('paymentModal');
    updateModalSummary();

    // Admin-only Backdated Sale Date Selector
    const user = auth.getCurrentUser();
    const dateGroup = document.getElementById('posSaleDateGroup');
    const dateInput = document.getElementById('posSaleDate');

    if (dateGroup && dateInput) {
        if (user && user.role === 'Admin') {
            dateGroup.style.display = 'block';
            const todayStr = new Date().toISOString().split('T')[0];
            if (!dateInput.value) dateInput.value = todayStr;
            dateInput.max = todayStr;
        } else {
            dateGroup.style.display = 'none';
            dateInput.value = '';
        }
    }

    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
        document.getElementById('modalPaymentAmount').focus();
    }, 10);
}

// Close payment modal
function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);

    // Clear modal inputs
    document.getElementById('modalPaymentMethod').value = '';
    document.getElementById('modalPaymentAmount').value = '';
}


// Fill amount field with exact balance
function fillExactPayment() {
    const total = calculateGrandTotal();
    const totalPaid = calculateTotalPaid();
    const balance = total - totalPaid;

    if (balance <= 0) {
        toast.info('Payment is already complete');
        return;
    }

    // Fill the amount field with balance
    document.getElementById('modalPaymentAmount').value = balance.toFixed(2);

    // Focus on payment method if not selected
    const methodSelect = document.getElementById('modalPaymentMethod');
    if (!methodSelect.value) {
        methodSelect.focus();
    } else {
        // If method is selected, focus on Add Payment button
        document.getElementById('modalAddPaymentBtn').focus();
    }
}

// Update modal summary (simplified)
function updateModalSummary() {
    const total = calculateGrandTotal();
    const totalPaid = calculateTotalPaid();
    const balance = total - totalPaid;

    document.getElementById('modalTotal').textContent = `KSh ${total.toFixed(2)}`;
    document.getElementById('modalBalanceSimple').textContent = `KSh ${balance.toFixed(2)}`;

    // Color code balance
    const balanceEl = document.getElementById('modalBalanceSimple');
    balanceEl.style.color = balance <= 0.01 ? 'var(--success)' : 'var(--danger)';

    // Render payment list
    const listContainer = document.getElementById('modalPaymentList');
    if (payments.length > 0) {
        listContainer.style.display = 'block';
        listContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 0.5rem;">Added Payments:</div>' +
            payments.map((p, index) => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.9rem;">
                <span>${p.method}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span>KSh ${p.amount.toFixed(2)}</span>
                    <button onclick="voidPayment(${index})" 
                            style="background:var(--danger); border:none; color:white; cursor:pointer; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;"
                            title="Void payment (requires admin password)">
                        Void
                    </button>
                </div>
            </div>
        `).join('');
    } else {
        listContainer.style.display = 'none';
        listContainer.innerHTML = '';
    }
}


// Add payment from modal
function handleModalAddPayment() {
    const method = document.getElementById('modalPaymentMethod').value;
    const amount = parseFloat(document.getElementById('modalPaymentAmount').value);

    if (!method) {
        toast.warning('Please select a payment method');
        return;
    }

    // For all payment methods including CREDIT, require amount
    if (!amount || amount <= 0) {
        toast.warning('Please enter a valid amount');
        return;
    }

    // For CREDIT partial payments, customer is required
    if (method === 'CREDIT') {
        const customerId = document.getElementById('customerSelect').value;
        if (!customerId) {
            showMessage('error', 'Customer Required', 'Customer must be selected for credit payments.');
            return;
        }
    }

    const total = calculateGrandTotal();
    const totalPaid = calculateTotalPaid();
    const balance = total - totalPaid;

    if (amount > balance + 0.01) {
        showConfirm(
            'Confirm Overpayment',
            `Payment amount (KSh ${amount.toFixed(2)}) exceeds balance (KSh ${balance.toFixed(2)}). Continue anyway?`,
            () => {
                addPaymentToCart(method, amount);
                updateModalAfterPayment();
            }
        );
        return;
    }

    addPaymentToCart(method, amount);
    updateModalAfterPayment();
    saveCartToDB(); // Auto-save
}



// Update modal and compact summary after adding payment
function updateModalAfterPayment() {
    // Clear modal inputs
    document.getElementById('modalPaymentMethod').value = '';
    document.getElementById('modalPaymentAmount').value = '';

    // Update compact summary
    updateCompactSummary();
    updateCheckoutButton();

    // Check if payment is complete
    const total = calculateGrandTotal();
    const totalPaid = calculateTotalPaid();
    const balance = total - totalPaid;

    if (balance <= 0.01) {
        // Payment complete, close modal and trigger checkout
        closePaymentModal();
        toast.success('Payment complete! Sale will be processed.');
        // Prevent duplicate sale submits when user clicks again
        setTimeout(() => {
            if (!isSaleProcessing) {
                handleCompleteSale();
            }
        }, 500);
    } else {
        // Still have balance, update modal display
        updateModalSummary();
    }
}

// Helper function to add payment to cart
function addPaymentToCart(method, amount) {
    payments.push({
        method,
        amount,
        reference: null
    });
}

// Void payment with admin password
window.voidPayment = async function (index) {
    const payment = payments[index];

    // Import admin password modal
    const adminPasswordModal = (await import('./admin-password-modal.js')).default;

    // Show admin password modal
    const password = await adminPasswordModal.show(
        'Void Payment Authorization',
        `Enter admin password to void KSh ${payment.amount.toFixed(2)} ${payment.method} payment.`
    );

    if (!password) {
        return; // User cancelled
    }

    // Show loading
    loadingScreen.show('Validating password...');

    try {
        // Validate password with backend
        const isValid = await validateVoidPassword(password);

        if (isValid) {
            // Remove the payment
            payments.splice(index, 1);
            toast.success(`Payment voided successfully`);
            updateModalAfterPayment();
            saveCartToDB(); // Auto-save
        } else {
            toast.error('Invalid admin password');
        }
    } catch (error) {
        console.error('Error voiding payment:', error);
        toast.error('Failed to void payment');
    } finally {
        await loadingScreen.hide();
    }
};

// Update compact payment summary
function updateCompactSummary() {
    const summaryDiv = document.getElementById('paymentSummaryCompact');
    const totalPaid = calculateTotalPaid();
    const total = calculateGrandTotal();
    const balance = total - totalPaid;

    if (payments.length > 0) {
        summaryDiv.style.display = 'block';
        document.getElementById('paymentsCount').textContent = payments.length;
        document.getElementById('totalPaidCompact').textContent = `KSh ${totalPaid.toFixed(2)}`;
        document.getElementById('balanceCompact').textContent = `KSh ${balance.toFixed(2)}`;

        // Color code balance
        const balanceEl = document.getElementById('balanceCompact');
        balanceEl.style.color = balance <= 0.01 ? 'var(--success)' : 'var(--danger)';
    } else {
        summaryDiv.style.display = 'none';
    }
}

// Update checkout button text and color
function updateCheckoutButton() {
    const btn = document.getElementById('checkoutBtn');
    const total = calculateGrandTotal();
    const totalPaid = calculateTotalPaid();
    const balance = total - totalPaid;

    if (cart.length === 0) {
        btn.disabled = true;
        btn.textContent = 'Add Payment';
        btn.className = 'btn btn-primary btn-block btn-lg';
        return;
    }

    if (balance > 0.01) {
        btn.disabled = false;
        btn.textContent = 'Add Payment';
        btn.className = 'btn btn-primary btn-block btn-lg';
    } else {
        btn.disabled = false;
        btn.textContent = 'Complete Sale';
        btn.className = 'btn btn-success btn-block btn-lg';
    }
}

// Complete sale (renamed from handleCheckout)
async function handleCompleteSale() {
    if (cart.length === 0) {
        return;
    }

    const total = calculateGrandTotal();

    if (payments.length === 0 && total > 0) {
        messageModal.warning('Please add at least one payment method to proceed.', 'No Payment');
        openPaymentModal();
        return;
    }

    // For 0 total sales (100% discount / promo), default to a free cash payment if empty
    let finalPayments = payments;
    if (total === 0 && payments.length === 0) {
        finalPayments = [{ method: 'Cash', amount: 0 }];
    }


    // Prevent duplicate sale submission
    if (isSaleProcessing) {
        console.warn('Sale already processing, ignoring duplicate submit');
        return;
    }

    // Check if customer is selected (required for partial, credit payments, or credit sales)
    const customerId = document.getElementById('customerSelect').value || null;
    const totalPaid = calculateTotalPaid();
    const isPartialPayment = totalPaid < total - 0.01;


    // Check if any payment method is CREDIT
    const isCreditPayment = payments.some(p => p.method === 'CREDIT');

    if ((isPartialPayment || isCreditPayment) && !customerId) {
        messageModal.error('Customer must be selected for partial or credit payments.', 'Customer Required');
        return;
    }

    // Close modal if open
    closePaymentModal();

    // Customer is optional for fully paid non-credit sales

    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;
    const taxPercent = parseFloat(document.getElementById('taxInput').value) || 0;

    const items = cart.map(item => ({
        item_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.price,
        discount_amount: item.discount_amount || 0,
        tax_rate: item.tax_rate || 0,
        barcode: item.barcode // Send barcode to backend
    }));

    const saleData = {
        customer_id: customerId,
        items: items,
        discount_percentage: discountPercent,
        discount_amount: discountAmount,
        tax_percentage: taxPercent, // Header tax (fallback)
        tax_amount: calculateTotals().taxAmount, // Explicit aggregated tax
        payments: finalPayments,

        operators: selectedOperators,  // NEW: Include operators
    };

    const dateInput = document.getElementById('posSaleDate');
    if (dateInput && dateInput.value && auth.getCurrentUser()?.role === 'Admin') {
        saleData.sale_date = dateInput.value;
    }

    currentSaleRequestId += 1;
    const requestId = currentSaleRequestId;
    isSaleProcessing = true;

    loadingScreen.show('Processing sale...');
    try {
        const response = await api.sales.create(saleData);

        if (requestId !== currentSaleRequestId) {
            console.warn('Stale sale response ignored for request', requestId);
            return;
        }

        if (response.success) {
            const { invoice_number, total, payments: paymentBreakdown } = response.data;
            const paymentSummary = paymentBreakdown.map(p => `${p.method}: KSh ${p.amount.toFixed(2)}`).join('\\n');

            // Show success message
            const message = `<strong>Sale Completed!</strong><br><br>
                Invoice: <strong>${invoice_number}</strong><br>
                Total: <strong>KSh ${total.toFixed(2)}</strong><br><br>
                <strong>Payments:</strong><br>
                ${paymentSummary.replace(/\\n/g, '<br>')}`;

            await loadingScreen.hide();
            clearTransientSaleMessages();
            messageModal.success(message, 'Sale Completed!');
            toast.success('Sale completed. Please review the invoice details.', 6000);

            // Clear cart, payments and reload products
            cart = [];
            payments = [];
            selectedOperators = []; // Clear selected operators
            // selectedSalesPersonId = null; // REMOVED
            document.getElementById('discountPercent').value = '';
            document.getElementById('discountAmount').value = '';

            // Clear all dropdown selections
            const customerSelect = document.getElementById('customerSelect');
            if (customerSelect) {
                customerSelect.value = '';
            }

            const operatorSelect = document.getElementById('operatorSelect');
            if (operatorSelect) {
                operatorSelect.value = '';
            }



            renderCart();
            updateCompactSummary();
            updateTotals();
            updateCheckoutButton();

            // Show the user success first, then start print after the UI updates.
            setTimeout(async () => {
                try {
                    console.log('🔍 Fetching print config...');
                    const configResponse = await fetch('/api/config/client-config');
                    const configData = await configResponse.json();
                    console.log('📋 Config response:', configData);
                    console.log('🖨️  showPrintPreview:', configData.config?.showPrintPreview);

                    if (configData.success && configData.config.showPrintPreview) {
                        console.log('✅ Showing print preview modal');
                        printReceipt(response.data);
                    } else {
                        console.log('🚀 Auto-printing directly');
                        await printReceiptDirectly(response.data);
                    }
                } catch (error) {
                    console.error('Error checking print config:', error);
                    printReceipt(response.data);
                }

                await loadProducts();
                // Clear cart from database to prevent restoration on reload
                await clearCartInDB();
            }, 800);
        }
    } catch (error) {
        if (requestId !== currentSaleRequestId) {
            console.warn('Stale sale error ignored for request', requestId);
            return;
        }

        // Auto-clear payments to unlock cart when sale fails validation
        // This prevents users from being stuck with a locked cart requiring admin password
        const hadPayments = payments.length > 0;
        const clearedPaymentAmount = calculateTotalPaid();

        // Clear payments array to unlock cart for modifications
        payments = [];

        // Update all UI components to reflect cleared payments
        updateCompactSummary();
        updateCheckoutButton();
        updateTotals();

        // If payment modal is open, update it as well
        if (document.getElementById('paymentModal').style.display === 'flex') {
            updateModalSummary();
        }

        // Save cleared state to database
        saveCartToDB();

        // Show informative error message
        let errorDetails = error.message;
        let additionalInfo = '';

        if (hadPayments) {
            additionalInfo = `\u003cbr\u003e\u003cbr\u003e\u003cstrong\u003ePayments Cleared:\u003c/strong\u003e KSh ${clearedPaymentAmount.toFixed(2)} in payments have been automatically removed so you can modify the cart.\u003cbr\u003e\u003cbr\u003e\u003cem\u003eYou can now remove or adjust items, then re-add payments.\u003c/em\u003e`;
        }

        clearTransientSaleMessages();
        messageModal.error(`Failed to complete sale: ${errorDetails}${additionalInfo}`, 'Sale Failed');
        toast.error('Sale failed. Please review the cart and try again.', 6000);
    } finally {
        if (requestId === currentSaleRequestId) {
            isSaleProcessing = false;
        }
        await loadingScreen.hide();
    }
}

function printReceipt(saleData) {
    console.log('📄 printReceipt() called with sale data:', saleData);
    // Open A4 invoice print dialog directly using hidden iframe
    const saleId = saleData.id || saleData.sale_id; // Use ID or sale_id
    if (saleId) {
        // Create or reuse hidden iframe
        const iframeId = 'invoice-print-frame';
        let iframe = document.getElementById(iframeId);

        if (iframe) {
            document.body.removeChild(iframe);
        }

        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        // Hide iframe but keep it part of DOM for chrome to print
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';

        iframe.src = `/pages/print-invoice.html?id=${saleId}`;
        document.body.appendChild(iframe);

        console.log('✅ Invoice print triggered via hidden iframe');
    } else {
        console.error('❌ Sale ID missing for A4 print:', saleData);
        alert('Could not print invoice: Sale ID missing.');
    }
}

// Auto-print to specific POS printer if available
async function tryAutoPrintToPosPrinter(saleData) {
    // Deprecated for now - A4 Print enforced
}

// Auto-print receipt directly without preview modal
async function printReceiptDirectly(saleData) {
    printReceipt(saleData);
}

// ==========================================
// PERSISTENT CART FUNCTIONS
// ==========================================

let saveCartTimer = null;


function setSyncStatus(status) {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;

    const textEl = statusEl.querySelector('.status-text');
    const iconEl = statusEl.querySelector('i');

    switch (status) {
        case 'saving':
            textEl.textContent = 'Saving...';
            statusEl.style.color = 'var(--warning)';
            iconEl.className = 'fas fa-spinner fa-spin';
            break;
        case 'saved':
            textEl.textContent = 'Saved';
            statusEl.style.color = 'var(--success)';
            iconEl.className = 'fas fa-check-circle';
            break;
        case 'error':
            textEl.textContent = 'Sync Failed';
            statusEl.style.color = 'var(--danger)';
            iconEl.className = 'fas fa-exclamation-circle';
            break;
    }
}

async function saveCartToDB() {
    // Debounce save to avoid too many requests
    if (saveCartTimer) clearTimeout(saveCartTimer);

    setSyncStatus('saving');

    saveCartTimer = setTimeout(async () => {
        try {
            const customerSelect = document.getElementById('customerSelect');
            const discountPercent = document.getElementById('discountPercent');

            const cartData = {
                items: cart,
                payments: payments,
                customer_id: customerSelect ? customerSelect.value : null,
                discount_percent: discountPercent ? parseFloat(discountPercent.value) : 0
            };

            await fetch('/api/cart', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(cartData)
            });
            setSyncStatus('saved');
        } catch (error) {
            console.error('Failed to auto-save cart:', error);
            setSyncStatus('error');
        }
    }, 1000); // 1 second debounce
}

async function loadCartFromDB() {
    try {
        const response = await fetch('/api/cart', {
            credentials: 'include'
        });

        const data = await response.json();
        if (data.success && data.cart) {
            // Restore state
            cart = data.cart.items || [];
            payments = data.cart.payments || [];

            // Restore customer
            const customerSelect = document.getElementById('customerSelect');
            if (customerSelect && data.cart.customer_id) {
                customerSelect.value = data.cart.customer_id;
            }

            // Restore discount
            if (data.cart.discount_percent) {
                const discInput = document.getElementById('discountPercent');
                if (discInput) discInput.value = data.cart.discount_percent;
            }

            // Update UI
            renderCart(); // This handles UI updates
            updateModalAfterPayment(); // Updates payment list and totals
        }
    } catch (error) {
        console.error('Failed to load cart:', error);
    }
}

/* ==========================================================================
   SALES PERSON FUNCTIONS
   ========================================================================== */



async function clearCartInDB() {
    try {
        await fetch('/api/cart', {
            method: 'DELETE',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Failed to clear cart in DB:', error);
    }
}



