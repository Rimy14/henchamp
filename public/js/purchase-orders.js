/**
 * Purchase Orders Management
 */

import auth from './auth.js';
import api from './api.js';
import Pagination from './pagination.js';
import messageModal from './message-modal.js';
import SearchableDropdown from './searchable-dropdown.js';

let pos = [];
let suppliers = [];
let items = [];
let poItems = [];
let pagination = null;
let currentUser = null;
let itemDropdown = null; // Searchable dropdown instance
let supplierDropdown = null; // Searchable dropdown instance
let templateSupplierDropdown = null; // Searchable dropdown instance for bulk modal
let allCategories = [];

let uoms = [];
let finishedGoodsCategoryId = null;

// Export init function for Router
export default async function init() {
    // Reset state
    pos = [];
    suppliers = [];
    items = [];
    poItems = [];
    pagination = null;
    currentUser = null;

    // Check authentication
    if (!(await auth.requireAuth())) {
        return;
    }

    currentUser = auth.getCurrentUser();

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadPOs(page);
        }
    });

    // Load data
    try {
        await loadSuppliers();
        await loadPOItems();
        await loadUOMs();
        await loadPOs(1);
    } catch (err) {
        console.error("Error loading PO page data:", err);
    }

    // Event listeners
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.addEventListener('change', handleFilterChange);

    const createBtn = document.getElementById('createPOBtn');
    if (createBtn) createBtn.addEventListener('click', showCreateModal);

    const cancelBtn = document.getElementById('cancelPOBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);

    const addBtn = document.getElementById('addItemBtn');
    if (addBtn) addBtn.addEventListener('click', addItemToPO);

    const form = document.getElementById('poForm');
    if (form) form.addEventListener('submit', handleSubmit);

    // Initialize Bulk Upload CSV listeners
    initBulkPOUpload();


    const itemSelect = document.getElementById('itemSelect');
    if (itemSelect) itemSelect.addEventListener('change', handleItemSelect);

    const taxInput = document.getElementById('poTaxPercent');
    if (taxInput) taxInput.addEventListener('input', updatePOTotals);

    const createNewItemBtn = document.getElementById('createNewItemBtn');
    if (createNewItemBtn) createNewItemBtn.addEventListener('click', showAddItemModal);

    const itemSubCategory = document.getElementById('itemSubCategory'); // Now acts as the main category select
    if (itemSubCategory) {
        itemSubCategory.addEventListener('change', (e) => {
            const selectedCategoryId = e.target.value;
            const selectedCategory = allCategories.find(c => c.id == selectedCategoryId);
            const categoryType = selectedCategory ? selectedCategory.type : null;
            updateSellingPriceFieldVisibility(categoryType);
            updateReorderFieldVisibility(categoryType);
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

    // Set today's date as default
    const dateInput = document.getElementById('poOrderDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }


}

async function loadPOs(page = 1) {
    try {
        const tbody = document.getElementById('poTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderPOsSkeleton();

        const statusFilterEl = document.getElementById('statusFilter');
        const statusFilter = statusFilterEl ? statusFilterEl.value : '';
        const { limit } = pagination ? pagination.getState() : { limit: 10 };

        const params = {
            page: page,
            limit: limit
        };

        if (statusFilter) {
            params.status = statusFilter;
        }

        const queryString = new URLSearchParams(params).toString();
        const response = await api.get(`/purchase-orders${queryString ? '?' + queryString : ''}`);
        if (response.success) {
            pos = response.data;
            renderPOs(pos);

            if (pagination && response.pagination) {
                pagination.update({
                    page: response.pagination.page,
                    limit: response.pagination.limit,
                    total: response.pagination.totalItems,
                    totalPages: response.pagination.totalPages
                });
            }
        }
    } catch (error) {
        console.error('Error loading POs:', error);
        const tbody = document.getElementById('poTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        Failed to load purchase orders: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderPOsSkeleton() {
    const tableBody = document.getElementById('poTableBody');
    if (!tableBody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 40px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 70px; border-radius: 12px;"></div></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <div class="skeleton skeleton-text" style="width: 40px; height: 32px; border-radius: 4px;"></div>
                        <div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                    </div>
                </td>
            </tr>
        `);
    }

    tableBody.innerHTML = skeletons.join('');
}

async function loadSuppliers() {
    try {
        const response = await api.suppliers.getAll();
        if (response.success) {
            suppliers = response.data;
            renderSupplierSelect();
        }
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

async function loadPOItems() {
    try {
        const response = await api.items.getAll({ limit: 50 });
        if (response.success) {
            const newItems = response.data;
            newItems.forEach(newItem => {
                const existingIndex = items.findIndex(existingItem => existingItem.id === newItem.id);
                if (existingIndex >= 0) {
                    items[existingIndex] = newItem;
                } else {
                    items.push(newItem);
                }
            });
            renderItemSelect();
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

function renderPOs(posToShow) {
    const tbody = document.getElementById('poTableBody');

    if (posToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No purchase orders found</td></tr>';
        return;
    }

    tbody.innerHTML = posToShow.map(po => {
        const statusClass = {
            'Draft': 'secondary',
            'Pending': 'warning',
            'Approved': 'info',
            'Received': 'success',
            'Cancelled': 'danger',
            'Rejected': 'danger'
        }[po.status] || 'secondary';

        const paymentStatusClass = {
            'unpaid': 'danger',
            'partial': 'warning',
            'paid': 'success'
        }[po.payment_status || 'unpaid'] || 'danger';

        const paymentStatusText = {
            'unpaid': 'Unpaid',
            'partial': 'Partially Paid',
            'paid': 'Paid'
        }[po.payment_status || 'unpaid'] || 'Unpaid';

        return `
            <tr>
                <td><strong>${po.po_number || 'N/A'}</strong></td>
                <td>${po.supplier_name}</td>
                <td>${formatDate(po.order_date)}</td>
                <td>${po.item_count || 0}</td>
                <td><strong>KSh ${parseFloat(po.total_amount || 0).toFixed(2)}</strong></td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span class="badge badge-${paymentStatusClass}">${paymentStatusText}</span>
                        <span style="font-size: 0.75rem; color: var(--gray-500);">Paid: KSh ${parseFloat(po.paid_amount || 0).toFixed(2)}</span>
                    </div>
                </td>
                <td><span class="badge badge-${statusClass}">${po.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="window.viewPO(${po.id})">View</button>
                    <button class="btn btn-sm btn-info" onclick="window.printPO(${po.id})" title="Print PO">🖨️</button>
                    ${po.status === 'Draft' && currentUser && (currentUser.role === 'Admin' || (currentUser.permissions && (currentUser.permissions.includes('po:approve') || currentUser.permissions.includes('po:*')))) ? `<button class="btn btn-sm btn-primary" onclick="window.approvePO(${po.id})">Approve</button>` : ''}
                    ${currentUser && (currentUser.role === 'Admin' || (currentUser.permissions && (currentUser.permissions.includes('po:approve') || currentUser.permissions.includes('po:*')))) && !po.has_grn && po.status !== 'Cancelled' ? `<button class="btn btn-sm btn-warning" onclick="window.changePoStatus(${po.id}, '${po.status}')">Change Status</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function renderSupplierSelect() {
    const select = document.getElementById('poSupplier');
    const options = suppliers.map(sup =>
        `<option value="${sup.id}">${sup.name}</option>`
    ).join('');
    select.innerHTML = '<option value="">Select supplier...</option>' + options;

    // Initialize searchable dropdown
    if (supplierDropdown) {
        supplierDropdown.destroy();
    }

    supplierDropdown = new SearchableDropdown(select, {
        asyncSource: async (term) => {
            try {
                const response = await api.suppliers.getAll({
                    search: term,
                    limit: 50
                });
                if (response.success) {
                    return response.data.map(sup => ({
                        text: sup.name,
                        value: sup.id
                    }));
                }
                return [];
            } catch (error) {
                console.error('Supplier search error:', error);
                return [];
            }
        },
        minLength: 1
    });
}

function renderItemSelect() {
    const select = document.getElementById('itemSelect');
    const options = items.map(item =>
        `<option value="${item.id}" data-price="${item.cost_price}">${item.name} (${item.code || 'N/A'})</option>`
    ).join('');
    select.innerHTML = '<option value="">Select item...</option>' + options;

    // Initialize searchable dropdown with async search
    if (itemDropdown) {
        itemDropdown.destroy();
    }

    itemDropdown = new SearchableDropdown(select, {
        asyncSource: async (term) => {
            try {
                // Fetch both Finished Goods and Raw Materials with server-side pagination
                const response = await api.items.getAll({
                    search: term,
                    limit: 50 // Increased limit for better selection
                });
                if (response.success) {
                    return response.data.map(item => ({
                        text: `${item.name} (${item.code || 'N/A'})`,
                        value: item.id,
                        price: item.cost_price || 0,
                        name: item.name
                    }));
                }
                return [];
            } catch (error) {
                console.error('Item search error:', error);
                return [];
            }
        },
        minLength: 1
    });

    // Handle selection and data attributes
    const originalSelectOption = itemDropdown.selectOption.bind(itemDropdown);
    itemDropdown.selectOption = function (value, text) {
        const selected = this.filteredOptions.find(o => o.option.value == value);
        if (selected && selected.option) {
            let opt = Array.from(this.select.options).find(o => o.value == value);
            if (!opt) {
                opt = new Option(text, value);
                this.select.add(opt);
            }
            opt.dataset.price = selected.option.price || 0;
            opt.dataset.name = selected.option.name || '';
        }
        originalSelectOption(value, text);
    };
}

function handleFilterChange() {
    if (pagination) {
        pagination.reset(); // Reset to first page on filter change
    }
    loadPOs(1);
}

function showCreateModal() {
    poItems = [];
    document.getElementById('poForm').reset();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('poOrderDate').value = today;
    renderPOItems();
    if (supplierDropdown) {
        supplierDropdown.selectOption('', 'Select supplier...');
    }
    document.getElementById('poModal').style.display = 'block';
}

function hideModal() {
    document.getElementById('poModal').style.display = 'none';
    poItems = [];
}
window.hideModal = hideModal;

function handleItemSelect() {
    const select = document.getElementById('itemSelect');
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value) {
        const itemId = parseInt(selectedOption.value);
        const itemObj = items.find(i => i.id === itemId);
        
        let price = selectedOption.getAttribute('data-price');
        let taxRate = 0;

        if (itemObj) {
            price = itemObj.selling_price_excl_tax || itemObj.selling_price || price || 0;
            taxRate = itemObj.tax_rate || 0;
        }

        document.getElementById('itemPrice').value = price || '';
        const taxSelect = document.getElementById('itemTaxRate');
        if (taxSelect) taxSelect.value = taxRate;
    }
}

function addItemToPO() {
    const itemSelectElement = document.getElementById('itemSelect');
    const itemQuantityElement = document.getElementById('itemQuantity');
    const itemPriceElement = document.getElementById('itemPrice');
    const itemTaxRateElement = document.getElementById('itemTaxRate');

    const itemId = parseInt(itemSelectElement.value);
    const quantity = parseInt(itemQuantityElement.value);
    const unitPriceExcl = parseFloat(itemPriceElement.value);
    const taxRate = parseFloat(itemTaxRateElement ? itemTaxRateElement.value : 0) || 0;

    // Validate inputs
    if (isNaN(itemId) || itemId <= 0) {
        messageModal.warning('Please select an item.', 'Selection Required');
        return;
    }
    if (isNaN(quantity) || quantity <= 0) {
        messageModal.warning('Please enter a valid quantity greater than 0.', 'Invalid Quantity');
        return;
    }
    if (isNaN(unitPriceExcl) || unitPriceExcl < 0) {
        messageModal.warning('Please enter a valid unit price (non-negative).', 'Invalid Unit Price');
        return;
    }

    let item = items.find(i => i.id === itemId);

    if (!item) {
        const selectedOption = itemSelectElement.options[itemSelectElement.selectedIndex];
        if (selectedOption && parseInt(selectedOption.value) === itemId) {
            item = {
                id: itemId,
                name: selectedOption.dataset.name || selectedOption.text,
                code: selectedOption.dataset.code || '',
                cost_price: parseFloat(selectedOption.dataset.price) || 0
            };
        }
    }

    if (!item) {
        messageModal.error('Selected item details could not be found.', 'Item Error');
        return;
    }

    const lineExcl = quantity * unitPriceExcl;
    const lineTax = lineExcl * (taxRate / 100);
    const unitPriceIncl = unitPriceExcl * (1 + taxRate / 100);
    const lineIncl = quantity * unitPriceIncl;

    // Check if item already added
    const existingIndex = poItems.findIndex(i => i.item_id === itemId);
    if (existingIndex >= 0) {
        poItems[existingIndex].quantity += quantity;
        poItems[existingIndex].unit_price = unitPriceExcl;
        poItems[existingIndex].unit_price_excl_tax = unitPriceExcl;
        poItems[existingIndex].tax_rate = taxRate;
        poItems[existingIndex].tax_amount = poItems[existingIndex].quantity * unitPriceExcl * (taxRate / 100);
        poItems[existingIndex].unit_price_incl_tax = unitPriceIncl;
        poItems[existingIndex].total_price_excl_tax = poItems[existingIndex].quantity * unitPriceExcl;
        poItems[existingIndex].total_price_incl_tax = poItems[existingIndex].quantity * unitPriceIncl;
        poItems[existingIndex].total_price = poItems[existingIndex].quantity * unitPriceIncl;
    } else {
        poItems.push({
            item_id: itemId,
            item_name: item.name,
            quantity: quantity,
            unit_price: unitPriceExcl,
            unit_price_excl_tax: unitPriceExcl,
            tax_rate: taxRate,
            tax_amount: lineTax,
            unit_price_incl_tax: unitPriceIncl,
            total_price_excl_tax: lineExcl,
            total_price_incl_tax: lineIncl,
            total_price: lineIncl
        });
    }

    // Reset inputs
    itemSelectElement.value = '';
    itemQuantityElement.value = '1';
    itemPriceElement.value = '';
    if (itemTaxRateElement) itemTaxRateElement.value = '0';
    if (itemDropdown) {
        itemDropdown.selectOption('', 'Select item...');
    }

    renderPOItems();
}


function renderPOItems() {
    const tbody = document.getElementById('poItemsTable');

    if (poItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No items added</td></tr>`;
        updatePOTotals();
        return;
    }

    tbody.innerHTML = poItems.map((item, index) => {
        const unitExcl = item.unit_price_excl_tax || item.unit_price || 0;
        const taxRate = item.tax_rate || 0;
        const lineExcl = item.quantity * unitExcl;
        const lineTax = lineExcl * (taxRate / 100);
        const lineIncl = lineExcl + lineTax;

        return `
            <tr>
                <td><strong>${item.item_name}</strong></td>
                <td>${item.quantity}</td>
                <td>KSh ${unitExcl.toFixed(2)}</td>
                <td><span class="badge" style="background:#e0e7ff; color:#0e4a35; padding: 2px 6px; border-radius: 4px; font-weight:600;">${taxRate}%</span></td>
                <td>KSh ${lineTax.toFixed(2)}</td>
                <td><strong>KSh ${lineIncl.toFixed(2)}</strong></td>
                <td>
                    <button type="button" class="btn btn-sm btn-danger" onclick="window.removePOItem(${index})">Remove</button>
                </td>
            </tr>
        `;
    }).join('');

    updatePOTotals();
}

window.removePOItem = function (index) {
    poItems.splice(index, 1);
    renderPOItems();
};

function updatePOTotals() {
    const subtotalExcl = poItems.reduce((sum, item) => sum + (item.quantity * (item.unit_price_excl_tax || item.unit_price || 0)), 0);
    const totalTax = poItems.reduce((sum, item) => {
        const unitExcl = item.unit_price_excl_tax || item.unit_price || 0;
        const lineExcl = item.quantity * unitExcl;
        return sum + (lineExcl * ((item.tax_rate || 0) / 100));
    }, 0);
    const grandTotal = subtotalExcl + totalTax;

    const subtotalEl = document.getElementById('poSubtotal');
    const taxEl = document.getElementById('poTax');
    const totalEl = document.getElementById('poTotal');

    if (subtotalEl) subtotalEl.textContent = `KSh ${subtotalExcl.toFixed(2)}`;
    if (taxEl) taxEl.textContent = `KSh ${totalTax.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `KSh ${grandTotal.toFixed(2)}`;
}

async function handleSubmit(e) {
    e.preventDefault();

    if (poItems.length === 0) {
        messageModal.warning('Please add at least one item', 'Items Required');
        return;
    }

    const taxPercent = parseFloat(document.getElementById('poTaxPercent').value) || 0;

    const poData = {
        supplier_id: parseInt(document.getElementById('poSupplier').value),
        order_date: document.getElementById('poOrderDate').value,
        expected_delivery: document.getElementById('poExpectedDelivery').value || null,
        notes: document.getElementById('poNotes').value,
        tax_percentage: taxPercent,
        items: poItems
    };

    try {
        const response = await api.post('/purchase-orders', poData);

        if (response.success) {
            messageModal.success('Purchase order created successfully!', 'PO Created');
            hideModal();
            await loadPOs();
        }
    } catch (error) {
        messageModal.error('Failed to create purchase order: ' + error.message, 'Creation Failed');
    }
}

window.viewPO = async function (id) {
    try {
        const response = await api.get(`/purchase-orders/${id}`);
        if (response.success) {
            const po = response.data;
            const itemsHTML = po.items.map(item => {
                const uExcl = parseFloat(item.unit_price_excl_tax || item.unit_price || 0);
                const taxRate = parseFloat(item.tax_rate || 0);
                const lineTax = parseFloat(item.tax_amount || 0);
                const lineIncl = parseFloat(item.total_price_incl_tax || item.total_price || 0);

                return `
                    <tr>
                        <td><strong>${item.item_name}</strong></td>
                        <td>${item.quantity}</td>
                        <td>KSh ${uExcl.toFixed(2)}</td>
                        <td><span class="badge" style="background:#e0e7ff; color:#0e4a35; padding: 2px 6px;">${taxRate}%</span></td>
                        <td>KSh ${lineTax.toFixed(2)}</td>
                        <td><strong>KSh ${lineIncl.toFixed(2)}</strong></td>
                    </tr>
                `;
            }).join('');
            const statusClass = { 'Draft': 'secondary', 'Pending': 'warning', 'Approved': 'info', 'Received': 'success', 'Cancelled': 'danger', 'Rejected': 'danger' }[po.status] || 'secondary';
            const paymentStatusClass = { 'unpaid': 'danger', 'partial': 'warning', 'paid': 'success' }[po.payment_status || 'unpaid'] || 'danger';
            const paymentStatusText = { 'unpaid': 'Unpaid', 'partial': 'Partially Paid', 'paid': 'Paid' }[po.payment_status || 'unpaid'] || 'Unpaid';

            // Fetch payment history for this PO
            let paymentsHTML = '';
            try {
                const pmtRes = await api.get(`/purchase-orders/${id}/payments`);
                if (pmtRes.success && pmtRes.data && pmtRes.data.length > 0) {
                    const pmtRows = pmtRes.data.map(pmt => {
                        const isCancelled = pmt.is_cancelled == 1;
                        const rowStyle = isCancelled ? 'style="text-decoration: line-through; color: #94a3b8; background-color: #f8fafc;"' : '';
                        const statusBadge = isCancelled 
                            ? `<span class="badge badge-danger" title="Cancelled by ${pmt.cancelled_by_name || 'Admin'}">Cancelled</span>`
                            : `<span class="badge badge-success">Active</span>`;
                        
                        const canCancel = !isCancelled && currentUser && (currentUser.role === 'Admin' || (currentUser.permissions && (currentUser.permissions.includes('po:approve') || currentUser.permissions.includes('po:*'))));
                        const actionBtn = canCancel 
                            ? `<button class="btn btn-sm btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="window.cancelPOPayment(${id}, ${pmt.id}, ${pmt.amount})">Cancel</button>`
                            : (isCancelled ? `<span style="font-size:0.75rem; color:#94a3b8;">${pmt.cancel_reason || 'Cancelled'}</span>` : '-');

                        return `
                            <tr ${rowStyle}>
                                <td>${formatDate(pmt.paid_date)}</td>
                                <td>${pmt.payment_method || 'N/A'}</td>
                                <td>${pmt.reference_number || '-'}</td>
                                <td><strong>KSh ${parseFloat(pmt.amount).toFixed(2)}</strong></td>
                                <td>${pmt.created_by_name || 'N/A'}</td>
                                <td>${statusBadge}</td>
                                <td>${actionBtn}</td>
                            </tr>
                        `;
                    }).join('');

                    paymentsHTML = `
                        <h3 style="margin-top: 1.5rem; margin-bottom: 0.5rem;">Payment History</h3>
                        <div style="max-height: 180px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 1rem;">
                            <table class="data-table" style="margin: 0; font-size: 0.85rem;">
                                <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 1;">
                                    <tr>
                                        <th>Date</th>
                                        <th>Method</th>
                                        <th>Ref #</th>
                                        <th>Amount</th>
                                        <th>Recorded By</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>${pmtRows}</tbody>
                            </table>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error fetching PO payments:', e);
            }

            document.getElementById('viewPOContent').innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; background: #f8fafc; padding: 1.25rem; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <div>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #475569;"><strong style="color: #1e293b;">PO Number:</strong> <span style="font-family: monospace; font-weight: 700; color: #0e4a35; background: #dcfce7; padding: 0.15rem 0.5rem; border-radius: 6px;">${po.po_number}</span></p>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #475569;"><strong style="color: #1e293b;">Supplier:</strong> <span style="font-weight: 600; color: #0f172a;">${po.supplier_name}</span></p>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #475569;"><strong style="color: #1e293b;">Order Date:</strong> ${formatDate(po.order_date)}</p>
                        <p style="margin: 0; font-size: 0.9rem; color: #475569;"><strong style="color: #1e293b;">Due Date:</strong> ${po.due_date ? formatDate(po.due_date) : 'N/A'}</p>
                    </div>
                    <div>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #475569;"><strong style="color: #1e293b;">Status:</strong> <span class="badge badge-${statusClass}">${po.status}</span></p>
                        <p style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #475569;"><strong style="color: #1e293b;">Expected Delivery:</strong> ${po.expected_delivery ? formatDate(po.expected_delivery) : 'N/A'}</p>
                        <p style="margin: 0; font-size: 0.9rem; color: #475569;"><strong style="color: #1e293b;">Created By:</strong> ${po.created_by_name || 'N/A'}</p>
                    </div>
                </div>
                <div style="margin-bottom: 1.25rem; padding: 0.85rem 1.25rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <p style="margin: 0; font-size: 0.9rem; color: #166534;"><strong style="color: #14532d;">Payment Status:</strong> <span class="badge badge-${paymentStatusClass}">${paymentStatusText}</span></p>
                    <p style="margin: 0; font-size: 0.9rem; color: #166534;"><strong style="color: #14532d;">Paid Amount:</strong> <span style="font-weight: 700; color: #15803d;">KSh ${parseFloat(po.paid_amount || 0).toFixed(2)}</span></p>
                </div>
                ${po.notes ? `<div style="margin-bottom: 1.25rem; padding: 0.85rem 1rem; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; font-size: 0.875rem; color: #92400e;"><i class="fas fa-sticky-note" style="margin-right: 0.5rem;"></i><strong>Notes:</strong> ${po.notes}</div>` : ''}
                <h3 style="margin-top: 1.25rem; margin-bottom: 0.75rem; font-size: 1.05rem; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 0.5rem;"><i class="fas fa-boxes" style="color: #0e4a35;"></i> Order Items</h3>
                <div style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 1.25rem;">
                    <table class="data-table" style="margin: 0; font-size: 0.875rem;">
                        <thead style="background: #f8fafc;"><tr><th style="padding: 0.75rem 1rem;">Item</th><th style="padding: 0.75rem 1rem;">Qty</th><th style="padding: 0.75rem 1rem;">Unit Cost (Excl)</th><th style="padding: 0.75rem 1rem;">Tax (%)</th><th style="padding: 0.75rem 1rem;">Tax Amount</th><th style="padding: 0.75rem 1rem;">Total (Incl)</th></tr></thead>
                        <tbody>${itemsHTML}</tbody>
                    </table>
                </div>
                ${paymentsHTML}
                <div style="text-align: right; padding: 1.25rem; background: linear-gradient(135deg, #041710 0%, #0e4a35 100%); border-radius: 12px; color: #ffffff;">
                    <p style="margin-bottom: 0.35rem; font-size: 0.875rem; color: #cbd5e1;">Subtotal (Excl. Tax): <span style="font-weight: 600; color: #ffffff;">KSh ${parseFloat(po.subtotal || 0).toFixed(2)}</span></p>
                    <p style="margin-bottom: 0.35rem; font-size: 0.875rem; color: #cbd5e1;">Total Tax: <span style="font-weight: 600; color: #ffffff;">KSh ${parseFloat(po.tax_amount || 0).toFixed(2)}</span></p>
                    <p style="font-size: 1.25rem; font-weight: 800; color: #a3e635; margin: 0.5rem 0 0 0; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.15);">Grand Total: KSh ${parseFloat(po.total_amount).toFixed(2)}</p>
                </div>
            `;
            document.getElementById('printPOFromViewBtn').onclick = () => window.printPO(id);
            document.getElementById('viewPOModal').style.display = 'flex';
        }
    } catch (error) {
        messageModal.error('Error viewing PO: ' + error.message, 'View Failed');
    }
};

window.cancelPOPayment = async function (poId, paymentId, amount) {
    const adminPasswordModal = (await import('./admin-password-modal.js')).default;
    const toast = (await import('./toast.js')).default;
    const loadingScreen = (await import('./loading-screen.js')).default;

    const password = await adminPasswordModal.show(
        'Cancel Payment Authorization',
        `Enter admin password to cancel this payment of KSh ${parseFloat(amount).toFixed(2)}.`
    );

    if (!password) return;

    loadingScreen.show('Validating admin password & cancelling payment...');
    try {
        const response = await api.request(`/purchase-orders/${poId}/payments/${paymentId}/cancel`, {
            method: 'PATCH',
            body: { password, reason: 'Cancelled via PO View' }
        });

        if (response.success) {
            toast.success('Payment cancelled successfully!');
            await window.viewPO(poId);
            await loadPOs();
        } else {
            messageModal.error(response.message || 'Failed to cancel payment', 'Cancellation Failed');
        }
    } catch (error) {
        console.error('Error cancelling PO payment:', error);
        messageModal.error(error.message || 'Failed to cancel payment', 'Error');
    } finally {
        loadingScreen.hide();
    }
};

window.hideViewModal = function () {
    document.getElementById('viewPOModal').style.display = 'none';
};


window.approvePO = async function (id) {
    // Import confirm modal
    const confirmModal = (await import('./confirm-modal.js')).default;

    const confirmed = await confirmModal.show(
        'Approve Purchase Order',
        'Are you sure you want to approve this purchase order?',
        'Approve',
        'btn-primary'
    );

    if (!confirmed) return;

    try {
        const response = await api.request(`/purchase-orders/${id}/status`, {
            method: 'PATCH',
            body: { status: 'Approved' }
        });

        if (response.success) {
            messageModal.success('Purchase order approved!', 'PO Approved');
            await loadPOs();
        }
    } catch (error) {
        messageModal.error('Error approving PO: ' + error.message, 'Approval Failed');
    }
};



window.changePoStatus = async function (id, currentStatus) {
    const statuses = ['Draft', 'Approved', 'Cancelled', 'Rejected'];
    const availableStatuses = statuses.filter(s => s !== currentStatus);

    const statusOptions = availableStatuses
        .map(s => `<option value="${s}">${s}</option>`)
        .join('');

    // Create a custom modal for status selection
    const modalHTML = `
        <div id="statusChangeModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
            <div style="background: white; padding: 2rem; border-radius: 8px; min-width: 350px;">
                <h3 style="margin-top: 0;">Change PO Status</h3>
                <p>Current Status: <strong>${currentStatus}</strong></p>
                <div style="margin: 1rem 0;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">New Status:</label>
                    <select id="newStatusSelect" class="form-control" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="">Select new status...</option>
                        ${statusOptions}
                    </select>
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem;">
                    <button id="cancelStatusChange" class="btn btn-secondary">Cancel</button>
                    <button id="confirmStatusChange" class="btn btn-primary">Confirm</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('statusChangeModal');
    const select = document.getElementById('newStatusSelect');
    const confirmBtn = document.getElementById('confirmStatusChange');
    const cancelBtn = document.getElementById('cancelStatusChange');

    const closeModal = () => {
        modal.remove();
    };

    cancelBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    confirmBtn.onclick = async () => {
        const newStatus = select.value;
        if (!newStatus) {
            messageModal.warning('Please select a new status', 'Status Required');
            return;
        }

        closeModal();

        try {
            const response = await api.purchaseOrders.updateStatus(id, newStatus);
            if (response.success) {
                messageModal.success('PO status updated successfully!', 'Status Updated');
                await loadPOs();
            }
        } catch (error) {
            messageModal.error('Error updating PO status: ' + error.message, 'Update Failed');
        }
    };
};

window.printPO = function (id) {
    // Open print template in new window
    const printWindow = window.open(`/pages/print-po.html?id=${id}`, '_blank', 'width=900,height=700');
    if (!printWindow) {
        messageModal.warning('Please allow popups to print the purchase order', 'Popup Blocked');
    }
};

/**
 * Item Creation Logic
 */

async function showAddItemModal() {
    try {
        const toast = (await import('./toast.js')).default;
        await loadCategories();
        await loadSuppliersForItemModal();
        await loadUOMs();

        document.getElementById('modalTitle').textContent = 'Add New Finished Good';
        document.getElementById('itemForm').reset();

        // Directly render categories with 'Finished Goods' selected by default
        renderCategorySelect(finishedGoodsCategoryId);
        document.getElementById('itemSubCategory').disabled = false; // Ensure it's enabled

        // For POs, we usually deal with Raw Materials. Update visibility based on this assumption or selected category.
        // It should default to Finished Goods, so update based on that.
        updateReorderFieldVisibility('Finished Goods'); // Should ideally be dynamic based on selected category type
        updateSellingPriceFieldVisibility('Finished Goods'); // Should ideally be dynamic based on selected category type

        document.getElementById('itemModal').style.display = 'block';
    } catch (error) {
        console.error('Error showing item modal:', error);
        const toast = (await import('./toast.js')).default;
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
            // Find the ID for 'Finished Goods' category
            const finishedGoodsCat = allCategories.find(cat => cat.name === 'Finished Goods' || cat.type === 'Finished Goods');
            if (finishedGoodsCat) {
                finishedGoodsCategoryId = finishedGoodsCat.id;
            }
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



function renderCategorySelect(selectedCategoryId = null) {
    const select = document.getElementById('itemSubCategory'); // Now acts as main category select

    const options = allCategories.map(cat =>
        `<option value="${cat.id}" ${cat.id == selectedCategoryId ? 'selected' : ''} data-type="${cat.type}">${cat.name}</option>`
    ).join('');

    select.innerHTML = '<option value="">Select category...</option>' + options;
    select.disabled = false; // Always enabled now

    // Trigger change event manually to update visibility of other fields
    const event = new Event('change');
    select.dispatchEvent(event);
}

function updateReorderFieldVisibility(categoryType) {
    const reorderInput = document.getElementById('itemReorder');
    const reorderGroup = document.getElementById('reorderLevelGroup');

    if (categoryType === 'Raw Materials' || categoryType === 'Finished Goods') {
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

    const toast = (await import('./toast.js')).default;
    const loadingScreen = (await import('./loading-screen.js')).default;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const categoryId = parseInt(document.getElementById('itemSubCategory').value); // Now main category

    if (!categoryId) {
        messageModal.warning('Please select a category', 'Category Required');
        return;
    }

    const itemData = {
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDescription').value,
        category_id: categoryId,
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

            // Refresh items list in PO dropdown
            await loadPOItems();

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

async function loadUOMs() {
    try {
        const response = await api.uom.getAll();
        if (response.success) {
            const select = document.getElementById('itemUnit');
            if (select) {
                const options = response.data.map(uom =>
                    `<option value="${uom.short_name}">${uom.name} (${uom.short_name})</option>`
                ).join('');
                select.innerHTML = '<option value="">Select unit...</option>' + options;
            }
        }
    } catch (error) {
        console.error('Error loading UOMs:', error);
    }
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const poModal = document.getElementById('poModal');
    if (e.target === poModal) {
        hideModal();
    }
    const itemModal = document.getElementById('itemModal');
    if (e.target === itemModal) {
        hideItemModal();
    }
    const bulkPoModal = document.getElementById('bulkUploadPOModal');
    if (e.target === bulkPoModal) {
        bulkPoModal.style.display = 'none';
    }
});

/**
 * Bulk CSV Upload for Purchase Orders
 */
function initBulkPOUpload() {
    const downloadBtn = document.getElementById('downloadPOTemplateBtn');
    const modalDownloadBtn = document.getElementById('modalDownloadPOTemplateBtn');
    const bulkUploadBtn = document.getElementById('bulkUploadPOBtn');
    const modal = document.getElementById('bulkUploadPOModal');
    const closeBtn = document.getElementById('closeBulkUploadPOModalBtn');
    const closeFooterBtn = document.getElementById('closePoBulkModalFooterBtn');
    const dropzone = document.getElementById('poCsvDropzone');
    const fileInput = document.getElementById('poCsvFileInput');
    const selectedFileName = document.getElementById('selectedPoCsvName');
    const startUploadBtn = document.getElementById('startPoCsvUploadBtn');
    const resultsContainer = document.getElementById('poBulkUploadResultsContainer');
    const resultsTableBody = document.getElementById('poBulkResultsTableBody');
    const summaryBadge = document.getElementById('poBulkUploadSummaryBadge');

    let selectedFile = null;

    const triggerDownload = () => {
        const supplierSelect = document.getElementById('poTemplateSupplierSelect');
        const supplierId = supplierSelect ? supplierSelect.value : '';
        const url = `/api/purchase-orders/bulk-template${supplierId ? `?supplier_id=${supplierId}` : ''}`;
        window.open(url, '_blank');
    };

    if (downloadBtn) downloadBtn.addEventListener('click', triggerDownload);
    if (modalDownloadBtn) modalDownloadBtn.addEventListener('click', triggerDownload);

    const openModal = () => {
        selectedFile = null;
        if (fileInput) fileInput.value = '';
        if (selectedFileName) {
            selectedFileName.textContent = '';
            selectedFileName.style.display = 'none';
        }
        if (startUploadBtn) startUploadBtn.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (resultsTableBody) resultsTableBody.innerHTML = '';

        // Populate supplier dropdown in modal
        const supplierSelect = document.getElementById('poTemplateSupplierSelect');
        if (supplierSelect) {
            supplierSelect.innerHTML = '<option value="">All Suppliers (Use Default Assigned Suppliers)</option>' +
                (suppliers || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');

            if (templateSupplierDropdown) {
                templateSupplierDropdown.destroy();
                templateSupplierDropdown = null;
            }

            templateSupplierDropdown = new SearchableDropdown(supplierSelect, {
                placeholder: 'Search supplier...'
            });
        }

        if (modal) modal.style.display = 'block';
    };


    const closeModal = () => {
        if (modal) modal.style.display = 'none';
    };


    if (bulkUploadBtn) bulkUploadBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeModal);

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#2563eb';
            dropzone.style.background = '#eff6ff';
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#cbd5e1';
            dropzone.style.background = '#f8fafc';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#cbd5e1';
            dropzone.style.background = '#f8fafc';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    function handleFileSelect(file) {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Please select a valid .csv file');
            return;
        }
        selectedFile = file;
        if (selectedFileName) {
            selectedFileName.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            selectedFileName.style.display = 'block';
        }
        if (startUploadBtn) startUploadBtn.style.display = 'inline-block';
    }

    if (startUploadBtn) {
        startUploadBtn.addEventListener('click', async () => {
            if (!selectedFile) return;

            const formData = new FormData();
            formData.append('file', selectedFile);

            try {
                const res = await api.postFormData('/purchase-orders/bulk-upload', formData);


                if (resultsContainer) resultsContainer.style.display = 'block';
                if (summaryBadge) {
                    summaryBadge.textContent = `${res.summary.created} Created / ${res.summary.failed} Failed`;
                    summaryBadge.style.background = res.summary.failed > 0 ? '#fef2f2' : '#f0fdf4';
                    summaryBadge.style.color = res.summary.failed > 0 ? '#991b1b' : '#166534';
                }

                if (resultsTableBody) {
                    resultsTableBody.innerHTML = res.results.map(r => `
                        <tr>
                            <td style="padding: 0.5rem 0.75rem; font-weight: 600;">${r.po_ref}</td>
                            <td style="padding: 0.5rem 0.75rem; font-weight: 700; color: #2563eb;">${r.po_number || '-'}</td>
                            <td style="padding: 0.5rem 0.75rem;">${r.item_count || '-'}</td>
                            <td style="padding: 0.5rem 0.75rem;">${r.total_amount ? 'KSh ' + parseFloat(r.total_amount).toFixed(2) : '-'}</td>
                            <td style="padding: 0.5rem 0.75rem;">
                                ${r.status === 'created' 
                                    ? '<span class="badge badge-success">✅ Created</span>' 
                                    : '<span class="badge badge-danger">❌ Failed</span>'}
                            </td>
                            <td style="padding: 0.5rem 0.75rem; color: ${r.status === 'created' ? '#166534' : '#991b1b'};">
                                ${r.reason || ''}
                            </td>
                        </tr>
                    `).join('');
                }

                if (res.summary.created > 0) {
                    loadPOs(1);
                }
            } catch (err) {
                alert(err.message || 'Bulk PO upload failed');
            }
        });
    }
}

