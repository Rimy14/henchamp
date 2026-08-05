/**
 * GRN (Goods Receipt Note) Management
 */

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import Pagination from './pagination.js';
import messageModal from './message-modal.js';
import toast from './toast.js';

let grns = [];
let purchaseOrders = [];
let selectedPO = null;
let pagination = null;
let searchQuery = '';
let searchTimeout = null;

// Export init function for Router
export default async function init() {
    // Reset state
    grns = [];
    purchaseOrders = [];
    selectedPO = null;
    pagination = null;
    searchQuery = '';
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = null;

    // loadingScreen.show('Loading GRNs...'); // We now use skeleton loading

    // Check authentication
    if (!(await auth.requireAuth())) {
        // await loadingScreen.hide();
        return;
    }

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadGRNs(page);
        }
    });

    // Set today as default received date
    const dateInput = document.getElementById('grnReceivedDate');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }

    // Load data
    try {
        await Promise.all([
            loadGRNs(1),
            loadPurchaseOrders()
        ]);
    } catch (err) {
        console.error("Error init GRNs:", err);
    }

    // Event listeners
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', handleSearch);

    const addBtn = document.getElementById('addGRNBtn');
    if (addBtn) addBtn.addEventListener('click', showAddModal);

    const cancelBtn = document.getElementById('cancelGRNBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);

    const form = document.getElementById('grnForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const poSelect = document.getElementById('grnPO');
    if (poSelect) poSelect.addEventListener('change', handlePOChange);

    const closeViewBtn = document.getElementById('closeViewBtn');
    if (closeViewBtn) closeViewBtn.addEventListener('click', hideViewModal);

    const closeRejectBtn = document.getElementById('closeRejectModal');
    if (closeRejectBtn) closeRejectBtn.addEventListener('click', closeRejectReasonModal);

    // Close modals when clicking outside
    const grnModal = document.getElementById('grnModal');
    const viewModal = document.getElementById('viewGRNModal');
    const rejectModal = document.getElementById('rejectGRNModal');

    if (grnModal) {
        grnModal.addEventListener('click', (e) => {
            if (e.target === grnModal) hideModal();
        });
    }

    if (viewModal) {
        viewModal.addEventListener('click', (e) => {
            if (e.target === viewModal) hideViewModal();
        });
    }

    if (rejectModal) {
        rejectModal.addEventListener('click', (e) => {
            if (e.target === rejectModal) closeRejectReasonModal();
        });
    }
}

async function loadGRNs(page = 1) {
    try {
        const tbody = document.getElementById('grnTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderGRNSkeleton();

        const { limit } = pagination ? pagination.getState() : { limit: 10 };

        const params = {
            page: page,
            limit: limit
        };

        if (searchQuery) {
            // Note: Backend doesn't support search yet, so we'll filter client-side after loading
        }

        const response = await api.grn.getAll(params);
        if (response.success) {
            grns = response.data;

            // Apply client-side search filter if needed
            let filteredGRNs = grns;
            if (searchQuery) {
                filteredGRNs = grns.filter(grn =>
                    grn.grn_number.toLowerCase().includes(searchQuery) ||
                    grn.po_number.toLowerCase().includes(searchQuery) ||
                    (grn.supplier_name && grn.supplier_name.toLowerCase().includes(searchQuery))
                );
            }

            renderGRNs(filteredGRNs);

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
        console.error('Error loading GRNs:', error);
        const tbody = document.getElementById('grnTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        Failed to load GRNs: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderGRNSkeleton() {
    const tableBody = document.getElementById('grnTableBody');
    if (!tableBody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 120px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 40px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <div class="skeleton skeleton-text" style="width: 40px; height: 32px; border-radius: 4px;"></div>
                        <div class="skeleton skeleton-text" style="width: 50px; height: 32px; border-radius: 4px;"></div>
                    </div>
                </td>
            </tr>
        `);
    }

    tableBody.innerHTML = skeletons.join('');
}

async function loadPurchaseOrders() {
    try {
        const response = await api.purchaseOrders.getAll();
        if (response.success) {
            // Only show approved POs
            purchaseOrders = response.data.filter(po => po.status === 'Approved');
            renderPOSelect();
        }
    } catch (error) {
        console.error('Error loading purchase orders:', error);
    }
}

function renderGRNs(grnsToShow) {
    const tbody = document.getElementById('grnTableBody');

    if (grnsToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No GRNs found</td></tr>';
        return;
    }

    tbody.innerHTML = grnsToShow.map(grn => {
        const statusClass = grn.status === 'approved' ? 'success' :
            grn.status === 'rejected' ? 'danger' : 'warning';

        return `
            <tr>
                <td><strong>${grn.grn_number}</strong></td>
                <td>${grn.po_number}</td>
                <td>${grn.supplier_name || 'N/A'}</td>
                <td>${new Date(grn.received_date).toLocaleDateString()}</td>
                <td>${grn.receiver_name}</td>
                <td>${grn.item_count || 0}</td>
                <td>
                    <span class="badge badge-${statusClass}">
                        ${grn.status.toUpperCase()}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="window.viewGRN(${grn.id})">View</button>
                    ${grn.status === 'pending' && auth.getCurrentUser() && auth.getCurrentUser().role === 'Admin' ? `
                        <button class="btn btn-sm btn-success" onclick="window.approveGRN(${grn.id})">Approve</button>
                        <button class="btn btn-sm btn-danger" onclick="window.rejectGRN(${grn.id})">Reject</button>
                        <button class="btn btn-sm btn-danger" onclick="window.deleteGRN(${grn.id})">Delete</button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function renderPOSelect() {
    const select = document.getElementById('grnPO');
    const options = purchaseOrders.map(po =>
        `<option value="${po.id}">${po.po_number} - ${po.supplier_name} (${po.status})</option>`
    ).join('');
    select.innerHTML = '<option value="">Select Purchase Order...</option>' + options;
}

async function handlePOChange(e) {
    const poId = e.target.value;
    if (!poId) {
        document.getElementById('grnItemsContainer').innerHTML = '<p class="text-muted">Select a PO to see items</p>';
        selectedPO = null;
        return;
    }

    try {
        const response = await api.purchaseOrders.getById(poId);
        if (response.success) {
            selectedPO = response.data;
            renderPOItems(selectedPO.items || []);
        }
    } catch (error) {
        console.error('Error loading PO details:', error);
        messageModal.error('Failed to load PO details: ' + error.message, 'Load Failed');
    }
}

function renderPOItems(items) {
    const container = document.getElementById('grnItemsContainer');

    if (items.length === 0) {
        container.innerHTML = '<p class="text-muted">No items in this PO</p>';
        return;
    }

    container.innerHTML = `
        <div style="overflow-x: auto; width: 100%;">
            <table class="table" style="font-size: 0.9rem; min-width: 850px; width: 100%;">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Ordered Qty</th>
                        <th>Already Received</th>
                        <th>Receive Now</th>
                        <th>Unit Cost</th>
                        <th>Quality Status</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody id="grnItemsTableBody">
                    ${items.map((item, index) => {
            const remaining = item.quantity - (item.received_quantity || 0);
            return `
                            <tr>
                                <td>
                                    <strong>${item.item_name}</strong><br>
                                    <small>${item.item_code}</small>
                                    ${item.barcode ? `<br><small class="text-muted">${item.barcode}</small>` : ''}
                                </td>
                                <td>${item.quantity}</td>
                                <td>${item.received_quantity || 0}</td>
                                <td>
                                    <input 
                                        type="number" 
                                        class="receive-qty" 
                                        data-item-id="${item.item_id}" 
                                        data-barcode="${item.barcode || ''}"
                                        data-index="${index}"
                                        min="0" 
                                        max="${remaining}" 
                                        value="${remaining}"
                                        style="width: 80px; padding: 0.25rem;"
                                        ${remaining <= 0 ? 'disabled' : ''}
                                    >
                                </td>
                                <td>
                                    <input 
                                        type="number" 
                                        class="item-unit-cost" 
                                        data-index="${index}"
                                        min="0" 
                                        step="0.01"
                                        value="${item.unit_price || 0}"
                                        style="width: 100px; padding: 0.25rem;"
                                        ${remaining <= 0 ? 'disabled' : ''}
                                    >
                                </td>
                                <td>
                                    <select 
                                        class="quality-status" 
                                        data-index="${index}"
                                        style="padding: 0.25rem;"
                                        ${remaining <= 0 ? 'disabled' : ''}
                                    >
                                        <option value="accepted">Accepted</option>
                                        <option value="rejected">Rejected</option>
                                        <option value="partial">Partial</option>
                                    </select>
                                </td>
                                <td>
                                    <input 
                                        type="text" 
                                        class="item-notes" 
                                        data-index="${index}"
                                        placeholder="Optional notes"
                                        style="width: 150px; padding: 0.25rem;"
                                    >
                                </td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    searchQuery = query;

    // Debounce search
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (pagination) {
            pagination.reset(); // Reset to first page on search
        }
        loadGRNs(1);
    }, 300);
}

function showAddModal() {
    document.getElementById('grnForm').reset();
    document.getElementById('grnReceivedDate').valueAsDate = new Date();
    document.getElementById('grnItemsContainer').innerHTML = '<p class="text-muted">Select a PO to see items</p>';
    selectedPO = null;
    document.getElementById('grnModal').style.display = 'block';
}

function hideModal() {
    document.getElementById('grnModal').style.display = 'none';
    document.getElementById('grnForm').reset();
}

function hideViewModal() {
    document.getElementById('viewGRNModal').style.display = 'none';
}

async function handleSubmit(e) {
    e.preventDefault();

    if (!selectedPO) {
        messageModal.warning('Please select a Purchase Order', 'PO Required');
        return;
    }

    const poId = parseInt(document.getElementById('grnPO').value);
    const receivedDate = document.getElementById('grnReceivedDate').value;
    const notes = document.getElementById('grnNotes').value;

    // Collect items with quantities
    const items = [];
    const receiveQtyInputs = document.querySelectorAll('.receive-qty');
    const costInputs = document.querySelectorAll('.item-unit-cost');
    const qualityStatusSelects = document.querySelectorAll('.quality-status');
    const itemNotesInputs = document.querySelectorAll('.item-notes');

    receiveQtyInputs.forEach((input, index) => {
        const quantity = parseInt(input.value) || 0;
        if (quantity > 0) {
            items.push({
                item_id: parseInt(input.dataset.itemId),
                received_quantity: quantity,
                unit_cost: parseFloat(costInputs[index].value) || 0,
                quality_status: qualityStatusSelects[index].value,
                notes: itemNotesInputs[index].value || null,
                barcode: input.dataset.barcode || null
            });
        }
    });

    if (items.length === 0) {
        messageModal.warning('Please enter at least one item to receive', 'Items Required');
        return;
    }

    const grnData = {
        po_id: poId,
        received_date: receivedDate,
        items: items,
        notes: notes
    };

    loadingScreen.show('Creating GRN...');
    try {
        const response = await api.grn.create(grnData);
        if (response.success) {
            messageModal.success('GRN created successfully!', 'GRN Created');
            hideModal();
            await loadGRNs();
        }
    } catch (error) {
        messageModal.error('Failed to create GRN: ' + error.message, 'Creation Failed');
    } finally {
        await loadingScreen.hide();
    }
}

window.viewGRN = async function (grnId) {
    try {
        const response = await api.grn.getById(grnId);
        if (response.success) {
            const grn = response.data;
            const content = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <p><strong>GRN Number:</strong> ${grn.grn_number}</p>
                        <p><strong>PO Number:</strong> ${grn.po_number}</p>
                        <p><strong>Supplier:</strong> ${grn.supplier_name}</p>
                    </div>
                    <div>
                        <p><strong>Received Date:</strong> ${new Date(grn.received_date).toLocaleDateString()}</p>
                        <p><strong>Receiver:</strong> ${grn.receiver_name}</p>
                        <p><strong>Status:</strong> <span class="badge badge-${grn.status === 'approved' ? 'success' : grn.status === 'rejected' ? 'danger' : 'warning'}">${grn.status.toUpperCase()}</span></p>
                    </div>
                </div>

                ${grn.notes ? `<p><strong>Notes:</strong> ${grn.notes}</p>` : ''}

                <h3 style="margin-top: 1.5rem;">Items Received</h3>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Ordered</th>
                            <th>Received</th>
                            <th>Quality Status</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(grn.items || []).map(item => `
                            <tr>
                                <td>
                                    <strong>${item.item_name}</strong><br>
                                    <small>${item.item_code}</small>
                                </td>
                                <td>${item.ordered_quantity}</td>
                                <td>${item.received_quantity}</td>
                                <td>
                                    <span class="badge badge-${item.quality_status === 'accepted' ? 'success' : 'warning'}">
                                        ${item.quality_status.toUpperCase()}
                                    </span>
                                </td>
                                <td>${item.notes || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            document.getElementById('viewGRNContent').innerHTML = content;

            // Add print button
            const printBtn = document.createElement('button');
            printBtn.className = 'btn btn-primary';
            printBtn.innerHTML = '<i class="fas fa-print"></i> Print GRN';
            printBtn.onclick = () => window.printGRN(grnId);

            const modalFooter = document.querySelector('#viewGRNModal .modal-footer');
            if (!modalFooter) {
                const footer = document.createElement('div');
                footer.className = 'modal-footer';
                footer.appendChild(printBtn);
                document.querySelector('#viewGRNModal .modal-content').appendChild(footer);
            } else {
                // Clear existing buttons and add print + close
                modalFooter.innerHTML = '';
                modalFooter.appendChild(printBtn);

                const closeBtn = document.createElement('button');
                closeBtn.className = 'btn btn-secondary';
                closeBtn.innerHTML = '<i class="fas fa-times"></i> Close';
                closeBtn.onclick = hideViewModal;
                modalFooter.appendChild(closeBtn);
            }

            document.getElementById('viewGRNModal').style.display = 'block';
        }
    } catch (error) {
        messageModal.error('Failed to load GRN details: ' + error.message, 'Load Failed');
    }
};

window.approveGRN = async function (grnId) {
    // Import confirm modal
    const confirmModal = (await import('./confirm-modal.js')).default;

    const confirmed = await confirmModal.show(
        'Approve GRN',
        'Are you sure you want to approve this GRN? This will update the inventory.',
        'Approve',
        'btn-success'
    );

    if (!confirmed) return;

    try {
        const response = await api.grn.approve(grnId);
        if (response.success) {
            messageModal.success('GRN approved successfully! Inventory has been updated.', 'GRN Approved');
            await loadGRNs();
        }
    } catch (error) {
        messageModal.error('Failed to approve GRN: ' + error.message, 'Approval Failed');
    }
};

// State variable for GRN being rejected
let grnToReject = null;

window.rejectGRN = function (grnId) {
    grnToReject = grnId;
    showRejectReasonModal();
};

function showRejectReasonModal() {
    const modal = document.getElementById('rejectGRNModal');
    const textarea = document.getElementById('rejectReason');
    const errorDiv = document.getElementById('rejectReasonError');

    // Reset form
    textarea.value = '';
    errorDiv.style.display = 'none';

    // Show modal
    modal.classList.add('active');
}

function closeRejectReasonModal() {
    const modal = document.getElementById('rejectGRNModal');
    modal.classList.remove('active');
    grnToReject = null;
}

function validateRejectReason() {
    const textarea = document.getElementById('rejectReason');
    const errorDiv = document.getElementById('rejectReasonError');
    const errorText = document.getElementById('rejectReasonErrorText');
    const reason = textarea.value.trim();

    if (!reason) {
        errorDiv.style.display = 'block';
        errorText.textContent = 'Rejection reason is required';
        return false;
    }

    if (reason.length < 10) {
        errorDiv.style.display = 'block';
        errorText.textContent = 'Please provide a more detailed reason (minimum 10 characters)';
        return false;
    }

    errorDiv.style.display = 'none';
    return true;
}

async function confirmRejection() {
    if (!validateRejectReason()) {
        return;
    }

    const reason = document.getElementById('rejectReason').value.trim();
    const grnId = grnToReject;

    closeRejectReasonModal();

    try {
        const response = await api.grn.reject(grnId, reason);
        if (response.success) {
            messageModal.info('GRN rejected', 'GRN Rejected');
            await loadGRNs();
        }
    } catch (error) {
        messageModal.error('Failed to reject GRN: ' + error.message, 'Rejection Failed');
    }
}

window.deleteGRN = async function (grnId) {
    // Import confirm modal
    const confirmModal = (await import('./confirm-modal.js')).default;

    const confirmed = await confirmModal.show(
        'Delete GRN',
        'Are you sure you want to delete this GRN?',
        'Delete',
        'btn-danger'
    );

    if (!confirmed) return;

    try {
        const response = await api.grn.delete(grnId);
        if (response.success) {
            messageModal.success('GRN deleted successfully', 'GRN Deleted');
            await loadGRNs();
        }
    } catch (error) {
        messageModal.error('Failed to delete GRN: ' + error.message, 'Deletion Failed');
    }
};

window.printGRN = function (id) {
    // Open print template in new window
    const printWindow = window.open(`/pages/print-grn.html?id=${id}`, '_blank', 'width=900,height=700');
    if (!printWindow) {
        messageModal.warning('Please allow popups to print the GRN', 'Popup Blocked');
    }
};

// Make functions globally available
window.showRejectReasonModal = showRejectReasonModal;
window.closeRejectReasonModal = closeRejectReasonModal;
window.confirmRejection = confirmRejection;

/**
 * Add a new item row to the GRN items table (for scanned items not in PO or when no PO selected)
 * @param {Object} item - Item object from API
 * @param {number} orderedQty - Ordered quantity (default: 0)
 * @param {number} unitCost - Unit cost (default: 0)
 */
function addItemRow(item, orderedQty = 0, unitCost = 0) {
    const tbody = document.getElementById('grnItemsTableBody');
    if (!tbody) return;

    const index = tbody.rows.length;
    const remaining = orderedQty > 0 ? orderedQty : 999999; // If no ordered qty, allow any amount

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>
            <strong>${item.name}</strong><br>
            <small>${item.code}</small>
            ${item.barcode ? `<br><small class="text-muted">${item.barcode}</small>` : ''}
        </td>
        <td>${orderedQty > 0 ? orderedQty : '-'}</td>
        <td>-</td>
        <td>
            <input 
                type="number" 
                class="receive-qty" 
                data-item-id="${item.id}" 
                data-barcode="${item.barcode || ''}"
                data-index="${index}"
                min="0" 
                max="${remaining}" 
                value="1"
                style="width: 80px; padding: 0.25rem;"
            >
        </td>
        <td>
            <input 
                type="number" 
                class="item-unit-cost" 
                data-index="${index}"
                min="0" 
                step="0.01"
                value="${unitCost || item.selling_price || 0}"
                style="width: 100px; padding: 0.25rem;"
            >
        </td>
        <td>
            <select 
                class="quality-status" 
                data-index="${index}"
                style="padding: 0.25rem;"
            >
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="partial">Partial</option>
            </select>
        </td>
        <td>
            <input 
                type="text" 
                class="item-notes" 
                data-index="${index}"
                placeholder="Optional notes"
                style="width: 150px; padding: 0.25rem;"
            >
        </td>
    `;
    tbody.appendChild(tr);
}

// Make globally available if needed
window.addItemRow = addItemRow;
