/**
 * Quotations Management Page
 * Handles quotation creation, viewing, approval, and printing
 */

import api from './api.js';
import toast from './toast.js';
import SearchableDropdown from './searchable-dropdown.js';
import loadingScreen from './loading-screen.js'; // Added
import messageModal from './message-modal.js'; // Added

// State
let currentQuotation = null;
let quotationItems = [];
let currentPage = 1;
let customerDropdown = null;
let editingQuotationId = null; // Track if we are editing
// Global state for items
let items = [];
let itemDropdown = null;
let currentUser = null;
let confirmationCallback = null;

// Global state for categories (Added)
let allCategories = [];
let baseCategories = [];
let subCategories = [];
let uoms = [];

/**
 * Initialize page
 */
export async function initQuotations() {
    setupEventListeners();

    // Load data in parallel
    // Load data in parallel
    await loadCurrentUser();
    loadQuotations();
    loadCustomers();
    loadItems();
    loadUOMs();

    // Set default date to today
    const dateInput = document.getElementById('quoteDate');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Create quotation button
    const createBtn = document.getElementById('createQuotationBtn');
    if (createBtn) {
        createBtn.addEventListener('click', showCreateQuotationModal);
    }

    // Form submission
    const form = document.getElementById('quotationForm');
    if (form) {
        form.addEventListener('submit', handleCreateQuotation);
    }

    // Cancel button
    const cancelBtn = document.getElementById('cancelQuotationBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideQuotationModal);
    }

    // Add item button
    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', addItemToQuotation);
    }

    // Filter button
    const filterBtn = document.getElementById('applyFiltersBtn');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            currentPage = 1;
            loadQuotations();
        });
    }

    // Status filter - Auto-apply on change
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => {
            currentPage = 1;
            loadQuotations();
        });
    }

    // Tax percentage change
    const taxInput = document.getElementById('taxPercentage');
    if (taxInput) {
        taxInput.addEventListener('input', calculateTotals);
    }

    // Discount percentage change
    const discountInput = document.getElementById('discountPercentage');
    if (discountInput) {
        discountInput.addEventListener('input', calculateTotals);
    }

    // Customer select change
    const custSelect = document.getElementById('customerSelect');
    if (custSelect) {
        custSelect.addEventListener('change', handleCustomerSelect);
    }

    // Item select change
    const itemSelect = document.getElementById('itemSelect');
    if (itemSelect) {
        itemSelect.addEventListener('change', handleItemSelect);
    }

    // Print button
    const printBtn = document.getElementById('printQuotationBtn');
    if (printBtn) {
        printBtn.addEventListener('click', handlePrintQuotation);
    }

    // Approve/Reject buttons (Modal)
    const approveBtn = document.getElementById('approveQuotationBtn');
    if (approveBtn) {
        approveBtn.addEventListener('click', () => {
            if (currentQuotation) handleUpdateStatus('Approved', currentQuotation.id);
        });
    }

    const rejectBtn = document.getElementById('rejectQuotationBtn');
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            if (currentQuotation) handleUpdateStatus('Rejected', currentQuotation.id);
        });
    }

    // Confirmation Modal Yes Button
    const confirmActionBtn = document.getElementById('confirmActionBtn');
    if (confirmActionBtn) {
        confirmActionBtn.addEventListener('click', () => {
            if (confirmationCallback) {
                confirmationCallback();
                closeConfirmationModal();
            }
        });
    }

    // New Item Modal Event Listeners (Added)
    const createNewItemBtn = document.getElementById('createNewItemBtn');
    if (createNewItemBtn) {
        createNewItemBtn.addEventListener('click', showAddItemModal);
    }

    const itemBaseCategory = document.getElementById('itemBaseCategory');
    if (itemBaseCategory) {
        itemBaseCategory.addEventListener('change', (e) => {
            const baseId = e.target.value;
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption) {
                const type = selectedOption.dataset.type;
                renderSubCategorySelect(baseId);
                updateSellingPriceFieldVisibility(type);
                updateReorderFieldVisibility(type);
            }
        });
    }

    const itemForm = document.getElementById('itemForm');
    if (itemForm) itemForm.addEventListener('submit', handleItemSubmit);

    // Inline UOM Creation Logic
    const addUomBtn = document.getElementById('addUomBtn');
    if (addUomBtn) addUomBtn.addEventListener('click', showUomModal);

    const closeUomModal = document.getElementById('closeUomModal');
    if (closeUomModal) closeUomModal.addEventListener('click', hideUomModal);

    const cancelUomBtn = document.getElementById('cancelUomBtn');
    if (cancelUomBtn) cancelUomBtn.addEventListener('click', hideUomModal);

    const uomCreationForm = document.getElementById('uomCreationForm');
    if (uomCreationForm) uomCreationForm.addEventListener('submit', handleUomSubmit);
}

/**
 * Load quotations with filters and pagination
 */
async function loadQuotations(page = 1) {
    try {
        const tbody = document.getElementById('quotationsTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderQuotationsSkeleton();

        const statusEl = document.getElementById('statusFilter');
        const startDateEl = document.getElementById('startDateFilter');
        const endDateEl = document.getElementById('endDateFilter');

        const params = new URLSearchParams({
            page: page.toString(),
            limit: '20'
        });

        if (statusEl && statusEl.value) params.append('status', statusEl.value);
        if (startDateEl && startDateEl.value) params.append('startDate', startDateEl.value);
        if (endDateEl && endDateEl.value) params.append('endDate', endDateEl.value);

        const response = await api.get(`/quotations?${params.toString()}`);

        if (response.success) {
            displayQuotations(response.data);
            updatePagination(response.pagination);
            currentPage = page;
        } else {
            toast.error(response.message || 'Failed to load quotations');
        }
    } catch (error) {
        console.error('Error loading quotations:', error);
        const tbody = document.getElementById('quotationsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        Failed to load quotations: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderQuotationsSkeleton() {
    const tableBody = document.getElementById('quotationsTableBody');
    if (!tableBody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                        <div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                        <div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                    </div>
                </td>
            </tr>
        `);
    }

    tableBody.innerHTML = skeletons.join('');
}

/**
 * Display quotations in table
 */
function displayQuotations(quotations) {
    const tbody = document.getElementById('quotationsTableBody');
    if (!tbody) return;

    if (quotations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: var(--gray-500);">
                    No quotations found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = quotations.map(quote => {
        let statusClass = 'secondary';
        switch (quote.status) {
            case 'Approved': statusClass = 'success'; break;
            case 'Pending': statusClass = 'warning'; break;
            case 'Rejected': statusClass = 'danger'; break;
            case 'Cancelled': statusClass = 'danger'; break;
            case 'Draft': statusClass = 'secondary'; break;
            default: statusClass = 'secondary';
        }

        return `
        <tr>
            <td>${quote.quote_number}</td>
            <td>${quote.customer_name}</td>
            <td>${formatDate(quote.quote_date)}</td>
            <td>${quote.validity_days} days</td>
            <td>${quote.item_count} item(s)</td>
            <td>KSh ${parseFloat(quote.total_amount).toFixed(2)}</td>
            <td><span class="badge badge-${statusClass}">${quote.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-info" onclick="window.viewQuotation(${quote.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="window.printQuotation(${quote.id})" title="Print">
                        <i class="fas fa-print"></i>
                    </button>
                    ${(currentUser && currentUser.role === 'Admin') ? `
                        ${(quote.status === 'Draft' || quote.status === 'Pending' || quote.status === 'Approved') ? `
                            <button class="btn btn-sm btn-primary" onclick="window.editQuotation(${quote.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${(quote.status === 'Draft' || quote.status === 'Pending') ? `
                            <button class="btn btn-sm btn-success" onclick="window.handleUpdateStatus('Approved', ${quote.id})" title="Approve">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                        ${(quote.status !== 'Cancelled' && quote.status !== 'Rejected' && quote.status !== 'Approved') ? `
                            <button class="btn btn-sm btn-danger" onclick="window.handleUpdateStatus('Cancelled', ${quote.id})" title="Cancel">
                                <i class="fas fa-ban"></i>
                            </button>
                        ` : ''}
                    ` : ''}
                </div>
            </td>
        </tr>
    `}).join('');
}

/**
 * Update pagination
 */
function updatePagination(pagination) {
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    if (pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';

    // Previous button
    if (pagination.page > 1) {
        html += `<button class="btn btn-sm" onclick="window.loadQuotationsPage(${pagination.page - 1})">Previous</button>`;
    }

    // Page info
    html += `<span>Page ${pagination.page} of ${pagination.totalPages}</span>`;

    // Next button
    if (pagination.page < pagination.totalPages) {
        html += `<button class="btn btn-sm" onclick="window.loadQuotationsPage(${pagination.page + 1})">Next</button>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Load items
 */
async function loadItems() {
    try {
        console.log('Loading items (Finished Goods)...');
        const response = await api.items.getAll({
            type: 'Finished Goods',
            limit: 1000
        });

        if (response.success) {
            console.log(`Loaded ${response.data.length} items`);
            items = response.data;
            renderItemSelect();
        } else {
            console.error('Failed to load items:', response);
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

/**
 * Load current user
 */
async function loadCurrentUser() {
    try {
        const response = await api.auth.getMe();
        if (response.success) {
            currentUser = response.user; // Ensure api.auth.getMe returns { success: true, user: ... }
        }
    } catch (error) {
        console.error('Error loading current user:', error);
    }
}

/**
 * Render item select options
 */
function renderItemSelect() {
    const select = document.getElementById('itemSelect');
    select.innerHTML = '<option value="">Select item...</option>';

    // Using simple string concatenation for performance, matching PO style
    const options = items.map(item => {
        const price = item.selling_price || 0;
        return `<option value="${item.id}" data-price="${price}" data-name="${item.name}" data-uom="${item.unit_of_measure}">${item.name} (${item.code || 'N/A'})</option>`;
    }).join('');

    select.innerHTML += options;

    // Initialize searchable dropdown
    if (itemDropdown) {
        itemDropdown.destroy();
    }
    itemDropdown = new SearchableDropdown(select);

    // PATCH: Ensure dropdown is on top of everything in the modal
    if (itemDropdown.dropdownContainer) {
        itemDropdown.dropdownContainer.style.zIndex = '10000';
    }
}


/**
 * Load customers
 */
async function loadCustomers() {
    try {
        console.log('Loading customers...');
        const response = await api.customers.getAll({ limit: 1000 });
        if (response.success) {
            console.log(`Loaded ${response.data.length} customers`);
            const select = document.getElementById('customerSelect');
            select.innerHTML = '<option value="">Select a customer...</option>';

            response.data.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.id;
                option.textContent = `${customer.name} - ${customer.phone || customer.email || ''}`;
                option.dataset.name = customer.name;
                option.dataset.contact = customer.phone || customer.email || '';
                option.dataset.address = customer.address || '';
                select.appendChild(option);
            });

            // Initialize searchable dropdown
            if (customerDropdown) {
                customerDropdown.destroy();
            }
            customerDropdown = new SearchableDropdown(select);

            // PATCH: Ensure dropdown is on top of everything in the modal
            if (customerDropdown.dropdownContainer) {
                customerDropdown.dropdownContainer.style.zIndex = '10000';
            }
        } else {
            console.error('Failed to load customers:', response);
            toast.error('Failed to load customers');
        }
    } catch (error) {
        console.error('Error loading customers:', error);
        toast.error('Error loading customers');
    }
}



/**
 * Handle customer selection
 */
function handleCustomerSelect(e) {
    const select = e.target;
    const option = select.options[select.selectedIndex];

    if (option && option.value) {
        document.getElementById('customerName').value = option.dataset.name || '';
        document.getElementById('customerContact').value = option.dataset.contact || '';
        document.getElementById('customerAddress').value = option.dataset.address || '';
    }
}

/**
 * Handle item selection
 */
function handleItemSelect(e) {
    const select = e.target;
    const option = select.options[select.selectedIndex];

    if (option && option.value) {
        const price = parseFloat(option.dataset.price) || 0;
        document.getElementById('itemUnitPrice').value = price.toFixed(2);
    }
}

/**
 * Show create quotation modal
 */
function showCreateQuotationModal() {
    quotationItems = [];
    editingQuotationId = null; // Reset editing state
    document.getElementById('quotationModalTitle').textContent = 'Create New Quotation'; // Reset title
    document.getElementById('saveQuotationBtn').textContent = 'Create Quotation'; // Reset button text
    document.getElementById('quotationForm').reset();
    document.getElementById('quoteDate').valueAsDate = new Date();
    document.getElementById('validityDays').value = 7;
    document.getElementById('taxPercentage').value = 0;
    document.getElementById('discountPercentage').value = 0;

    // Set default payment terms
    document.getElementById('paymentTerms').value = "Payment Terms: 70% In Advance, balance After Completion. We will be happy to supply any further information you may need and trust that you call on us to fill your order, which will receive our prompt and careful attention.";

    updateItemsTable();
    calculateTotals();
    document.getElementById('quotationModal').classList.add('active');
}

/**
 * Edit quotation
 */
async function editQuotation(id) {
    try {
        const response = await api.get(`/quotations/${id}`);

        if (response.success) {
            const quotation = response.data;
            editingQuotationId = quotation.id;

            // Populate form
            document.getElementById('quotationModalTitle').textContent = 'Edit Quotation';
            document.getElementById('saveQuotationBtn').textContent = 'Update Quotation';

            // Set customer
            const customerSelect = document.getElementById('customerSelect');
            if (customerSelect) {
                // Determine if we need to add the option manually if it's not loaded yet or searchable
                // For now, assume searchable dropdown handles it or we set value
                customerSelect.value = quotation.customer_id;
                // Trigger change to populate details if needed, but we have details in quotation object
                // Let's populate details directly
                document.getElementById('customerName').value = quotation.customer_name;
                document.getElementById('customerContact').value = quotation.customer_contact || '';
                document.getElementById('customerAddress').value = quotation.customer_address || '';

                // Refresh dropdown UI if exists
                if (customerDropdown) {
                    // Start by selecting the value
                    customerDropdown.select.value = quotation.customer_id;
                    // If the dropdown needs a UI refresh or search input update
                    const option = customerSelect.querySelector(`option[value="${quotation.customer_id}"]`);
                    if (option) {
                        const searchInput = customerDropdown.dropdownContainer.querySelector('.searchable-dropdown-input');
                        if (searchInput) searchInput.value = option.text;
                    }
                }
            }

            document.getElementById('quoteDate').value = new Date(quotation.quote_date).toISOString().split('T')[0];
            document.getElementById('validityDays').value = quotation.validity_days;
            document.getElementById('paymentTerms').value = quotation.payment_terms || '';
            document.getElementById('taxPercentage').value = quotation.tax_percentage;
            document.getElementById('discountPercentage').value = quotation.discount_percentage || 0;
            document.getElementById('quotationNotes').value = quotation.notes || '';

            // Populate items
            quotationItems = quotation.items.map(item => ({
                item_id: item.item_id,
                description: item.description || item.item_name, // fallback
                uom: item.unit_of_measure || item.uom, // fallback
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price
            }));

            updateItemsTable();
            calculateTotals();

            document.getElementById('quotationModal').classList.add('active');
        } else {
            toast.error(response.message || 'Failed to load quotation details');
        }
    } catch (error) {
        console.error('Error loading quotation for edit:', error);
        toast.error('Failed to load quotation for edit');
    }
}
window.editQuotation = editQuotation;

/**
 * Hide quotation modal
 */
function hideQuotationModal() {
    document.getElementById('quotationModal').classList.remove('active');
}

window.hideQuotationModal = hideQuotationModal;

/**
 * Add item to quotation
 */
function addItemToQuotation() {
    const itemSelect = document.getElementById('itemSelect');
    const quantity = parseInt(document.getElementById('itemQuantity').value);
    const unitPrice = parseFloat(document.getElementById('itemUnitPrice').value);

    if (!itemSelect.value) {
        toast.error('Please select an item');
        return;
    }

    if (quantity <= 0) {
        toast.error('Quantity must be greater than 0');
        return;
    }

    if (unitPrice < 0) {
        toast.error('Unit price cannot be negative');
        return;
    }

    const option = itemSelect.options[itemSelect.selectedIndex];
    const item = {
        item_id: parseInt(itemSelect.value),
        description: option.dataset.name,
        uom: option.dataset.uom,
        quantity: quantity,
        unit_price: unitPrice,
        total_price: quantity * unitPrice
    };

    quotationItems.push(item);
    updateItemsTable();
    calculateTotals();

    // Reset item inputs
    itemSelect.value = '';
    document.getElementById('itemQuantity').value = 1;
    document.getElementById('itemUnitPrice').value = '';

    // Refresh dropdown
    if (itemDropdown) {
        itemDropdown.refresh();
    }
}

/**
 * Remove item from quotation
 */
function removeItem(index) {
    quotationItems.splice(index, 1);
    updateItemsTable();
    calculateTotals();
}

window.removeItem = removeItem;

/**
 * Update items table
 */
function updateItemsTable() {
    const tbody = document.getElementById('quotationItemsTable');

    if (quotationItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--gray-500);">
                    No items added yet
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = quotationItems.map((item, index) => `
        <tr>
            <td>${item.description}</td>
            <td>${item.uom || 'N/A'}</td>
            <td>${item.quantity}</td>
            <td>KSh ${parseFloat(item.unit_price).toFixed(2)}</td>
            <td>KSh ${parseFloat(item.total_price).toFixed(2)}</td>
            <td>
                <button type="button" class="btn btn-sm btn-danger" onclick="window.removeItem(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Calculate totals
 */
function calculateTotals() {
    const subtotal = quotationItems.reduce((sum, item) => sum + parseFloat(item.total_price), 0);
    const taxPercentage = parseFloat(document.getElementById('taxPercentage').value) || 0;
    const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;

    const taxAmount = (subtotal * taxPercentage) / 100;
    const discountAmount = (subtotal * discountPercentage) / 100;
    const total = subtotal + taxAmount - discountAmount;

    document.getElementById('quotationSubtotal').textContent = `KSh ${subtotal.toFixed(2)}`;
    document.getElementById('quotationTax').textContent = `KSh ${taxAmount.toFixed(2)}`;
    document.getElementById('quotationDiscount').textContent = `KSh ${discountAmount.toFixed(2)}`;
    document.getElementById('quotationTotal').textContent = `KSh ${total.toFixed(2)}`;
}

/**
 * Handle create quotation
 */
async function handleCreateQuotation(e) {
    e.preventDefault();

    if (quotationItems.length === 0) {
        toast.error('Please add at least one item');
        return;
    }

    const customerSelect = document.getElementById('customerSelect');
    const data = {
        customer_id: customerSelect.value || null,
        customer_name: document.getElementById('customerName').value,
        customer_contact: document.getElementById('customerContact').value || null,
        customer_address: document.getElementById('customerAddress').value || null,
        quote_date: document.getElementById('quoteDate').value,
        validity_days: parseInt(document.getElementById('validityDays').value),
        payment_terms: document.getElementById('paymentTerms').value || null,
        tax_percentage: parseFloat(document.getElementById('taxPercentage').value) || 0,
        discount_percentage: parseFloat(document.getElementById('discountPercentage').value) || 0,
        notes: document.getElementById('quotationNotes').value || null,
        items: quotationItems
    };

    try {
        let response;
        if (editingQuotationId) {
            response = await api.put(`/quotations/${editingQuotationId}`, data);
        } else {
            response = await api.post('/quotations', data);
        }

        if (response.success) {
            toast.success(editingQuotationId ? 'Quotation updated successfully' : 'Quotation created successfully');
            hideQuotationModal();
            loadQuotations(currentPage);
        } else {
            toast.error(response.message || 'Failed to save quotation');
        }
    } catch (error) {
        console.error('Error saving quotation:', error);
        toast.error('Failed to save quotation');
    }
}

/**
 * View quotation details
 */
async function viewQuotation(id) {
    try {
        const response = await api.get(`/quotations/${id}`);

        if (response.success) {
            currentQuotation = response.data;
            displayQuotationDetails(response.data);
            document.getElementById('viewQuotationModal').classList.add('active');
        } else {
            toast.error(response.message || 'Failed to load quotation');
        }
    } catch (error) {
        console.error('Error loading quotation:', error);
        toast.error('Failed to load quotation');
    }
}

window.viewQuotation = viewQuotation;

/**
 * Display quotation details
 */
function displayQuotationDetails(quotation) {
    const content = document.getElementById('viewQuotationContent');

    let statusClass = 'secondary';
    switch (quotation.status) {
        case 'Approved': statusClass = 'success'; break;
        case 'Pending': statusClass = 'warning'; break;
        case 'Rejected': statusClass = 'danger'; break;
        case 'Cancelled': statusClass = 'danger'; break;
        case 'Draft': statusClass = 'secondary'; break;
        default: statusClass = 'secondary';
    }

    content.innerHTML = `
        <div class="quotation-details">
            <div class="detail-section">
                <h3>Quotation Information</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Quote Number:</label>
                        <span>${quotation.quote_number}</span>
                    </div>
                    <div class="detail-item">
                        <label>Date:</label>
                        <span>${formatDate(quotation.quote_date)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Validity:</label>
                        <span>${quotation.validity_days} days</span>
                    </div>
                    <div class="detail-item">
                        <label>Status:</label>
                        <span class="badge badge-${statusClass}">${quotation.status}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Customer Information</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Name:</label>
                        <span>${quotation.customer_name}</span>
                    </div>
                    <div class="detail-item">
                        <label>Contact:</label>
                        <span>${quotation.customer_contact || 'N/A'}</span>
                    </div>
                    <div class="detail-item" style="grid-column: 1 / -1;">
                        <label>Address:</label>
                        <span>${quotation.customer_address || 'N/A'}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Items</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>UOM</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${quotation.items.map(item => `
                            <tr>
                                <td>${item.description}</td>
                                <td>${item.unit_of_measure || 'N/A'}</td>
                                <td>${item.quantity}</td>
                                <td>KSh ${parseFloat(item.unit_price).toFixed(2)}</td>
                                <td>KSh ${parseFloat(item.total_price).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4" style="text-align: right;"><strong>Subtotal:</strong></td>
                            <td><strong>KSh ${parseFloat(quotation.subtotal).toFixed(2)}</strong></td>
                        </tr>
                        <tr>
                            <td colspan="4" style="text-align: right;">Tax (${quotation.tax_percentage}%):</td>
                            <td>KSh ${parseFloat(quotation.tax_amount).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colspan="4" style="text-align: right;">Discount (${quotation.discount_percentage}%):</td>
                            <td>KSh ${parseFloat(quotation.discount_amount).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colspan="4" style="text-align: right;"><strong>Total:</strong></td>
                            <td><strong>KSh ${parseFloat(quotation.total_amount).toFixed(2)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            ${quotation.payment_terms ? `
                <div class="detail-section">
                    <h3>Payment Terms</h3>
                    <p>${quotation.payment_terms}</p>
                </div>
            ` : ''}

            ${quotation.notes ? `
                <div class="detail-section">
                    <h3>Notes</h3>
                    <p>${quotation.notes}</p>
                </div>
            ` : ''}

            <div class="detail-section">
                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Created By:</label>
                        <span>${quotation.created_by_name}</span>
                    </div>
                    <div class="detail-item">
                        <label>Created At:</label>
                        <span>${formatDateTime(quotation.created_at)}</span>
                    </div>
                    ${quotation.approved_by_name ? `
                        <div class="detail-item">
                            <label>Approved By:</label>
                            <span>${quotation.approved_by_name}</span>
                        </div>
                        <div class="detail-item">
                            <label>Approved At:</label>
                            <span>${formatDateTime(quotation.approved_at)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    // Show/hide approve/reject buttons based on status and role
    const userRole = localStorage.getItem('userRole');
    const approveBtn = document.getElementById('approveQuotationBtn');
    const rejectBtn = document.getElementById('rejectQuotationBtn');

    if (userRole === 'Admin' && (quotation.status === 'Draft' || quotation.status === 'Pending')) {
        approveBtn.style.display = 'inline-block';
        rejectBtn.style.display = 'inline-block';
    } else {
        approveBtn.style.display = 'none';
        rejectBtn.style.display = 'none';
    }
}

/**
 * Hide view quotation modal
 */
function hideViewQuotationModal() {
    document.getElementById('viewQuotationModal').classList.remove('active');
    currentQuotation = null;
}

window.hideViewQuotationModal = hideViewQuotationModal;



/**
 * Handle update quotation status
 */
function handleUpdateStatus(status, id) {
    if (!id) return;

    const actionText = status === 'Approved' ? 'approve' : 'reject';

    showConfirmationModal(
        `Confirm ${status}`,
        `Are you sure you want to ${actionText} this quotation?`,
        async () => {
            try {
                const response = await api.put(`/quotations/${id}/status`, { status });

                if (response.success) {
                    toast.success(`Quotation ${status.toLowerCase()} successfully`);

                    // If modal is open and matching ID, hide it
                    if (currentQuotation && currentQuotation.id === id) {
                        hideViewQuotationModal();
                    }

                    loadQuotations(currentPage);
                } else {
                    toast.error(response.message || `Failed to ${status.toLowerCase()} quotation`);
                }
            } catch (error) {
                console.error('Error updating quotation status:', error);
                toast.error(`Failed to ${status.toLowerCase()} quotation`);
            }
        }
    );
}

window.handleUpdateStatus = handleUpdateStatus;

/**
 * Show confirmation modal
 */
function showConfirmationModal(title, message, onConfirm) {
    document.getElementById('confirmationTitle').textContent = title;
    document.getElementById('confirmationMessage').textContent = message;
    confirmationCallback = onConfirm;
    document.getElementById('confirmationModal').classList.add('active');
}

/**
 * Close confirmation modal
 */
function closeConfirmationModal() {
    document.getElementById('confirmationModal').classList.remove('active');
    confirmationCallback = null;
}

window.closeConfirmationModal = closeConfirmationModal;




/**
 * Handle print quotation
 */
function handlePrintQuotation(id) {
    const quotationId = typeof id === 'number' ? id : (currentQuotation ? currentQuotation.id : null);

    if (!quotationId) return;

    // Use hidden iframe for printing to avoid opening new window
    let printFrame = document.getElementById('printFrame');
    if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'printFrame';
        printFrame.style.display = 'none';
        document.body.appendChild(printFrame);
    }

    printFrame.src = `/pages/print-quotation.html?id=${quotationId}`;
}

window.printQuotation = handlePrintQuotation;



/**
 * Load quotations page
 */
function loadQuotationsPage(page) {
    loadQuotations(page);
}

window.loadQuotationsPage = loadQuotationsPage;


/**
 * Item Creation Logic for Quotations
 */

async function showAddItemModal() {
    try {
        await loadCategories();
        await loadSuppliersForItemModal();
        await loadUOMs();

        document.getElementById('modalTitle').textContent = 'Add New Item'; // Changed title
        document.getElementById('itemForm').reset();
        document.getElementById('itemSubCategory').innerHTML = '<option value="">Select base category first</option>';
        document.getElementById('itemSubCategory').disabled = true;

        // Removed hardcoded category type calls, category type will be handled by change event on itemBaseCategory
        updateReorderFieldVisibility('');
        updateSellingPriceFieldVisibility('');

        document.getElementById('itemModal').style.display = 'block';
    } catch (error) {
        console.error('Error showing item modal:', error);
        toast.error('Failed to load required data');
    }
}

function hideItemModal() {
    document.getElementById('itemModal').style.display = 'none';
    document.getElementById('itemForm').reset();
}

window.hideItemModal = hideItemModal;

async function loadCategories() {
    try {
        const response = await api.categories.getAll();
        if (response.success) {
            allCategories = response.data;
            baseCategories = response.data.filter(c => !c.parent_id);
            subCategories = response.data.filter(c => c.parent_id);
            renderBaseCategorySelect();
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function loadSuppliersForItemModal() {
    try {
        const response = await api.suppliers.getAll();
        if (response.success) {
            const select = document.getElementById('itemSupplier');
            const options = response.data.map(sup =>
                `<option value="${sup.id}">${sup.name}</option>`
            ).join('');
            select.innerHTML = '<option value="">Select supplier...</option>' + options;
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

async function loadUOMs() {
    try {
        const response = await api.uom.getAll();
        if (response.success) {
            uoms = response.data;
            renderUOMSelect();
        }
    } catch (error) {
        console.error('Error loading UOMs:', error);
    }
}

function renderUOMSelect() {
    const select = document.getElementById('itemUnit');
    if (!select) return;
    const options = uoms.map(uom =>
        `<option value="${uom.short_name}">${uom.name} (${uom.short_name})</option>`
    ).join('');
    select.innerHTML = '<option value="">Select unit...</option>' + options;
}

function renderBaseCategorySelect() {
    const select = document.getElementById('itemBaseCategory');
    const options = baseCategories.map(cat =>
        `<option value="${cat.id}" data-type="${cat.type}">${cat.name}</option>`
    ).join('');
    select.innerHTML = '<option value="">Select base category...</option>' + options;
}

function renderSubCategorySelect(baseCategoryId) {
    const select = document.getElementById('itemSubCategory');
    const filteredSubs = subCategories.filter(sub => sub.parent_id == baseCategoryId);

    if (filteredSubs.length === 0) {
        select.innerHTML = '<option value="">No sub-categories available</option>';
        select.disabled = true;
        return;
    }

    const options = filteredSubs.map(cat =>
        `<option value="${cat.id}">${cat.name}</option>`
    ).join('');
    select.innerHTML = '<option value="">Select sub-category...</option>' + options;
    select.disabled = false;
}

function updateReorderFieldVisibility(categoryType) {
    const reorderInput = document.getElementById('itemReorder');
    const reorderGroup = document.getElementById('reorderLevelGroup');

    if (categoryType === 'Raw Materials') {
        reorderGroup.style.display = 'block';
        reorderInput.required = true;
    } else {
        reorderGroup.style.display = 'none';
        reorderInput.required = false;
        reorderInput.value = '0';
    }
}

function updateSellingPriceFieldVisibility(categoryType) {
    const sellingPriceGroup = document.getElementById('sellingPriceGroup');
    const sellingPriceInput = document.getElementById('itemSellingPrice');
    const sellingPriceLabel = document.getElementById('sellingPriceLabel');

    if (categoryType === 'Finished Goods') {
        sellingPriceGroup.style.display = 'block';
        sellingPriceInput.required = true;
        sellingPriceLabel.innerHTML = 'Selling Price *';
    } else {
        sellingPriceGroup.style.display = 'none';
        sellingPriceInput.required = false;
        if (!sellingPriceInput.value) sellingPriceInput.value = '0';
    }
}

async function handleItemSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const baseCategoryId = parseInt(document.getElementById('itemBaseCategory').value);
    const subCategoryId = parseInt(document.getElementById('itemSubCategory').value);

    if (!baseCategoryId || !subCategoryId) {
        messageModal.warning('Please select both base category and sub-category', 'Category Required');
        return;
    }

    const itemData = {
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDescription').value,
        category_id: subCategoryId,
        unit_of_measure: document.getElementById('itemUnit').value,
        selling_price: parseFloat(document.getElementById('itemSellingPrice').value) || 0,
        reorder_level: parseInt(document.getElementById('itemReorder').value) || 0,
        supplier_id: document.getElementById('itemSupplier').value || null
    };

    if (submitBtn) submitBtn.disabled = true;
    loadingScreen.show('Saving item...');
    try {
        const response = await api.items.create(itemData);

        if (response.success) {
            toast.success('Item created successfully!');
            hideItemModal();

            // Refresh items list in Quotation dropdown
            await loadItems();

            // Select the new item
            const itemSelect = document.getElementById('itemSelect');
            if (itemSelect) {
                itemSelect.value = response.data.id;
                // Trigger change to update searchable dropdown and price
                const event = new Event('change');
                itemSelect.dispatchEvent(event);
            }
        } else {
            messageModal.error(response.message || 'Failed to create item', 'Creation Failed');
        }
    } catch (error) {
        console.error('Error creating item:', error);
        messageModal.error('An error occurred while creating the item', 'Error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        loadingScreen.hide();
    }
}

// Inline UOM Modal Functions
function showUomModal() {
    document.getElementById('uomCreationForm').reset();
    document.getElementById('uomCreationModal').style.display = 'flex';
}

function hideUomModal() {
    document.getElementById('uomCreationModal').style.display = 'none';
}

async function handleUomSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('saveUomBtn');
    const toast = (await import('./toast.js')).default;

    const uomData = {
        name: document.getElementById('newUomName').value,
        short_name: document.getElementById('newUomShortName').value,
        description: document.getElementById('newUomDescription').value
    };

    if (submitBtn) submitBtn.disabled = true;
    try {
        const response = await api.uom.create(uomData);
        if (response.success) {
            toast.success('Unit of Measure created successfully!');
            hideUomModal();
            // Reload UOMs and select the new one
            await loadUOMs();
            document.getElementById('itemUnit').value = uomData.short_name;
        }
    } catch (error) {
        messageModal.error('Failed to create unit: ' + error.message, 'Create Failed');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Close item modal when clicking outside
document.addEventListener('click', (e) => {
    const itemModal = document.getElementById('itemModal');
    if (e.target === itemModal) {
        hideItemModal();
    }
});

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
}

/**
 * Format date time
 */
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-GB');
}