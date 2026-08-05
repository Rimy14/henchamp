// Stock Adjustments Page JavaScript
import toast from './toast.js';
import messageModal from './message-modal.js';
import SearchableDropdown from './searchable-dropdown.js';
import Pagination from './pagination.js';

// Global variables for modal
let selectedBatches = [];
let availableBatches = [];
let itemDropdown = null; // Searchable dropdown instance
let pagination = null;

// Modal control functions
function openBatchAdjustmentModal() {
    document.getElementById('batchAdjustmentModal').style.display = 'flex';
    loadItemsForAdjustment();
    loadLocationsForAdjustment();
    resetBatchAdjustmentForm();
}

function closeBatchAdjustmentModal() {
    document.getElementById('batchAdjustmentModal').style.display = 'none';
    resetBatchAdjustmentForm();
}

function resetBatchAdjustmentForm() {
    document.getElementById('batchAdjustmentForm').reset();
    selectedBatches = [];
    availableBatches = [];
    document.getElementById('batchesList').innerHTML = '<p style="text-align: center; color: var(--gray-500);">Select an item to view batches</p>';
    document.getElementById('adjustmentSummary').style.display = 'none';
}

async function loadItemsForAdjustment() {
    try {
        // Fetch initial raw materials for stock adjustments
        const response = await fetch('/api/items?type=Finished Goods&limit=50');
        const data = await response.json();

        const select = document.getElementById('adj_item_id');
        select.innerHTML = '<option value="">Select Item...</option>';

        data.data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.code} - ${item.name}`;
            select.appendChild(option);
        });

        // Initialize searchable dropdown with async search
        if (itemDropdown) {
            itemDropdown.destroy();
        }

        itemDropdown = new SearchableDropdown(select, {
            asyncSource: async (term) => {
                try {
                    // Fetch raw materials with server-side search
                    const searchUrl = `/api/items?type=Finished Goods&search=${encodeURIComponent(term)}&limit=50`;
                    const searchResponse = await fetch(searchUrl);
                    const searchData = await searchResponse.json();

                    if (searchData.success) {
                        return searchData.data.map(item => ({
                            text: `${item.code} - ${item.name}`,
                            value: item.id,
                            name: item.name,
                            code: item.code
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
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

async function loadLocationsForAdjustment() {
    try {
        const response = await fetch('/api/stock-transfers/locations');
        const data = await response.json();

        const select = document.getElementById('adj_location_id');
        select.innerHTML = '<option value="">Select Location...</option>';

        data.data.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc.id;
            option.textContent = loc.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading locations:', error);
    }
}

async function loadBatchesForItem() {
    const itemId = document.getElementById('adj_item_id').value;
    const locationId = document.getElementById('adj_location_id').value;

    if (!itemId || !locationId) {
        document.getElementById('batchesList').innerHTML = '<p style="text-align: center; color: var(--gray-500);">Select item and location</p>';
        return;
    }

    // Show loading state
    document.getElementById('batchesList').innerHTML = '<p style="text-align: center; color: var(--gray-500);"><i class="fas fa-spinner fa-spin"></i> Loading batches...</p>';

    try {
        const url = `/api/stock-adjustments/batches?item_id=${itemId}&location_id=${locationId}`;
        console.log('🔍 Fetching batches from:', url);

        const response = await fetch(url);
        console.log('📡 Response status:', response.status, response.statusText);

        const data = await response.json();
        console.log('📦 Batches response:', data);
        console.log('📊 Number of batches found:', data.data?.length || 0);

        if (!response.ok) {
            throw new Error(data.message || 'Failed to load batches');
        }

        availableBatches = data.data || [];

        if (availableBatches.length === 0) {
            console.warn('⚠️ No batches found for item_id:', itemId, 'location_id:', locationId);
            document.getElementById('batchesList').innerHTML = `
                <p style="text-align: center; color: var(--warning); padding: 1rem;">
                    <i class="fas fa-exclamation-triangle"></i><br>
                    No batches available for this item at the selected location.<br>
                    <small style="color: var(--gray-500);">Batches are created when you receive goods via GRN.</small>
                </p>
            `;
            return;
        }

        renderBatches();
    } catch (error) {
        console.error('❌ Error loading batches:', error);
        document.getElementById('batchesList').innerHTML = `
            <p style="text-align: center; color: var(--danger); padding: 1rem;">
                <i class="fas fa-times-circle"></i><br>
                Error loading batches: ${error.message}
            </p>
        `;
    }
}

function renderBatches() {
    const container = document.getElementById('batchesList');

    if (availableBatches.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray-500);">No batches available</p>';
        return;
    }

    const isFIFO = document.getElementById('auto_select_fifo')?.checked;
    const item = itemDropdown?.selectedOption;
    const unitForDisplay = item?.uom || 'units';

    container.innerHTML = availableBatches.map(batch => {
        const maxAdd = parseFloat(batch.initial_quantity) - parseFloat(batch.current_quantity);
        const currentQty = parseFloat(batch.current_quantity);
        const subMode = isSubtraction();
        const maxAllowed = subMode ? currentQty : maxAdd;
        const actionText = subMode ? 'Deduct' : 'Add';

        return `
        <div class="batch-item" id="batch_${batch.id}">
            <div class="batch-header">
                <div>
                    <strong>Batch #${batch.id}</strong>
                    ${batch.grn_number ? `<span style="color: var(--gray-600); margin-left: 0.5rem;">GRN: ${batch.grn_number}</span>` : ''}
                </div>
                <input type="checkbox" 
                       class="batch-select" 
                       data-batch-id="${batch.id}"
                       onchange="toggleBatchItem(${batch.id})"
                       ${isFIFO ? 'disabled' : ''}>
            </div>
            <div class="batch-details">
                <div><strong>Date:</strong> ${new Date(batch.received_date).toLocaleDateString()}</div>
                <div><strong>Available:</strong> ${batch.current_quantity} ${unitForDisplay}</div>
                <div><strong>Cost:</strong> KSh ${parseFloat(batch.cost_per_unit || 0).toFixed(2)}</div>
            </div>
            <div class="batch-adjustment-input" style="display: none;" data-batch-id="${batch.id}">
                <label class="qty-label" data-batch-id="${batch.id}" style="font-size: 0.875rem; margin-bottom: 0.25rem; display: block;">
                    Quantity to ${actionText} (Max: ${maxAllowed})
                </label>
                <input type="number" 
                       class="batch-qty-input"
                       data-batch-id="${batch.id}"
                       data-current-qty="${batch.current_quantity}"
                       data-initial-qty="${batch.initial_quantity}"
                       step="0.01" 
                       max="${maxAllowed}"
                       placeholder="Enter quantity"
                       oninput="updateAdjustmentSummary()">
                <input type="text"
                       class="batch-reason-input"
                       data-batch-id="${batch.id}"
                       placeholder="Batch-specific reason (optional)"
                       style="margin-top: 0.5rem;">
            </div>
        </div>
        `;
    }).join('');
}

function toggleBatchItem(batchId) {
    const checkbox = document.querySelector(`.batch-select[data-batch-id="${batchId}"]`);
    const inputDiv = document.querySelector(`.batch-adjustment-input[data-batch-id="${batchId}"]`);
    const batchItem = document.getElementById(`batch_${batchId}`);

    if (checkbox.checked) {
        inputDiv.style.display = 'block';
        batchItem.classList.add('selected');
    } else {
        inputDiv.style.display = 'none';
        batchItem.classList.remove('selected');
        document.querySelector(`.batch-qty-input[data-batch-id="${batchId}"]`).value = '';
        document.querySelector(`.batch-reason-input[data-batch-id="${batchId}"]`).value = '';
    }

    updateAdjustmentSummary();
}

function updateBatchInputLimits() {
    const isSub = isSubtraction();

    document.querySelectorAll('.batch-qty-input').forEach(input => {
        const batchId = input.dataset.batchId;
        const currentQty = parseFloat(input.dataset.currentQty || 0);
        const initialQty = parseFloat(input.dataset.initialQty || 0);
        const maxAdd = initialQty - currentQty;

        const newMax = isSub ? currentQty : maxAdd;
        input.max = newMax;

        const label = document.querySelector(`.qty-label[data-batch-id="${batchId}"]`);
        if (label) {
            label.innerHTML = `Quantity to ${isSub ? 'Deduct' : 'Add'} (Max: ${newMax})`;
        }
    });
}

function handleAdjustmentTypeChange() {
    const type = document.getElementById('adj_type_select').value;
    const correctionActionDiv = document.getElementById('correctionActionDiv');
    const fifoOption = document.getElementById('fifoOption');

    // Reset states
    document.getElementById('auto_select_fifo').checked = false;

    if (type === 'CORRECTION') {
        correctionActionDiv.style.display = 'block';
        // Trigger action change to set correct states for correction
        handleCorrectionActionChange();
    } else if (type === 'DAMAGE' || type === 'WASTE') {
        correctionActionDiv.style.display = 'none';
        fifoOption.style.display = 'block'; // Always show FIFO for damage/waste (subtraction)
    } else {
        correctionActionDiv.style.display = 'none';
        fifoOption.style.display = 'none';
    }

    updateBatchInputLimits();
    toggleBatchSelection();

    // Show summary immediately to indicate if this is addition or subtraction
    updateAdjustmentSummary();
}

function handleCorrectionActionChange() {
    const action = document.querySelector('input[name="correction_action"]:checked').value;
    const fifoOption = document.getElementById('fifoOption');

    if (action === 'subtraction') {
        fifoOption.style.display = 'block';
    } else {
        fifoOption.style.display = 'none';
        document.getElementById('auto_select_fifo').checked = false;
    }

    updateBatchInputLimits();
    toggleBatchSelection();

    // Show summary immediately to indicate if this is addition or subtraction
    updateAdjustmentSummary();
}

function toggleBatchSelection() {
    const isFIFO = document.getElementById('auto_select_fifo').checked;
    const fifoQuantityDiv = document.getElementById('fifoQuantityDiv');
    const checkboxes = document.querySelectorAll('.batch-select');

    if (isFIFO) {
        fifoQuantityDiv.style.display = 'block';
        checkboxes.forEach(cb => {
            cb.disabled = true;
            cb.checked = false;
        });
        document.querySelectorAll('.batch-adjustment-input').forEach(div => div.style.display = 'none');
    } else {
        fifoQuantityDiv.style.display = 'none';
        checkboxes.forEach(cb => cb.disabled = false);
    }
}

function isSubtraction() {
    const type = document.getElementById('adj_type_select').value;
    if (type === 'DAMAGE' || type === 'WASTE') return true;
    if (type === 'CORRECTION') {
        const action = document.querySelector('input[name="correction_action"]:checked')?.value;
        return action === 'subtraction';
    }
    return false;
}

function updateAdjustmentSummary() {
    const selectedInputs = Array.from(document.querySelectorAll('.batch-qty-input'))
        .filter(input => {
            const batchId = input.dataset.batchId;
            const checkbox = document.querySelector(`.batch-select[data-batch-id="${batchId}"]`);
            return checkbox?.checked && input.value;
        });

    const total = selectedInputs.reduce((sum, input) => sum + parseFloat(input.value || 0), 0);
    const isSub = isSubtraction();
    const item = itemDropdown?.selectedOption;
    const unitForDisplay = item?.uom || 'units';

    // Get adjustment type to determine if we should show summary
    const adjustmentType = document.getElementById('adj_type_select').value;

    // Show summary if adjustment type is selected, even with 0 batches (to show +/- sign)
    // OR if batches are actually selected
    if (!adjustmentType && selectedInputs.length === 0) {
        document.getElementById('adjustmentSummary').style.display = 'none';
        return;
    }

    const batchCount = selectedInputs.length;

    document.getElementById('summaryContent').innerHTML = `
        <div style="display: flex; justify-content: space-between;">
            <span><strong>Batches Selected:</strong></span>
            <span>${batchCount}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 0.5rem;">
            <span><strong>Total Adjustment:</strong></span>
            <span style="color: ${isSub ? 'var(--danger)' : 'var(--success)'}; font-weight: 600;">
                ${isSub ? '-' : '+'}${total.toFixed(2)} ${unitForDisplay}
            </span>
        </div>
    `;

    document.getElementById('adjustmentSummary').style.display = 'block';
}

// Form submission handler
function initFormHandler() {
    const form = document.getElementById('batchAdjustmentForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const itemId = document.getElementById('adj_item_id').value;
        const locationId = document.getElementById('adj_location_id').value;
        const type = document.getElementById('adj_type_select').value;
        let isSub = isSubtraction();

        const reason = document.getElementById('adj_reason').value;
        const autoFIFO = document.getElementById('auto_select_fifo')?.checked || false;

        let batches = [];

        if (autoFIFO) {
            const quantity = parseFloat(document.getElementById('fifo_quantity').value);
            if (!quantity || quantity <= 0) {
                messageModal.warning('Please enter a valid quantity', 'Input Required');
                return;
            }

            // Client-side Total Capacity Check for FIFO
            const totalAvailable = availableBatches.reduce((sum, batch) => sum + parseFloat(batch.current_quantity || 0), 0);
            if (quantity > totalAvailable) {
                messageModal.warning(`Requested quantity (${quantity}) exceeds total available stock across all batches (${totalAvailable.toFixed(2)}).`, 'Insufficient Stock');
                return;
            }

            // Send negative quantity for subtraction
            batches = [{ quantity: -quantity }];
        } else {
            const selectedInputs = Array.from(document.querySelectorAll('.batch-qty-input'))
                .filter(input => {
                    const batchId = input.dataset.batchId;
                    const checkbox = document.querySelector(`.batch-select[data-batch-id="${batchId}"]`);
                    return checkbox?.checked && input.value;
                });

            if (selectedInputs.length === 0) {
                messageModal.warning('Please select at least one batch', 'Selection Required');
                return;
            }

            for (const input of selectedInputs) {
                const batchId = input.dataset.batchId;
                const quantity = parseFloat(input.value);

                if (isNaN(quantity) || quantity <= 0) {
                    messageModal.warning(`Invalid quantity entered for Batch #${batchId}. Quantity must be a positive number greater than zero.`, 'Invalid Input');
                    return; // Stop submission
                }

                const batchReason = document.querySelector(`.batch-reason-input[data-batch-id="${batchId}"]`).value;

                batches.push({
                    batch_id: parseInt(batchId),
                    quantity: isSub ? -quantity : quantity,
                    reason: batchReason || reason
                });
            }
        }

        try {
            const response = await fetch('/api/stock-adjustments/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: parseInt(itemId),
                    location_id: parseInt(locationId),
                    adjustment_type: type,
                    batches,
                    overall_reason: reason,
                    auto_select_fifo: autoFIFO
                })
            });

            const data = await response.json();

            if (data.success) {
                messageModal.success(
                    `Batch adjustment created successfully!\n\nAdjustment #: ${data.data.adjustmentNumber}\nTotal Adjustment: ${data.data.totalAdjustment >= 0 ? '+' : ''}${data.data.totalAdjustment}`,
                    'Adjustment Complete'
                );
                closeBatchAdjustmentModal();
                loadAdjustments();
            } else {
                // Check specifically for insufficient batches error
                if (data.message && data.message.includes('Insufficient batches')) {
                    messageModal.error(data.message, 'Insufficient Stock');
                } else {
                    // Other errors
                    messageModal.error(data.message || 'Error creating adjustment', 'Submission Failed');
                }
            }
        } catch (error) {
            console.error(error);
            messageModal.error('Error submitting adjustment', 'System Error');
        }
    });
}

// Load adjustments list
async function loadAdjustments(page = 1) {
    try {
        const tbody = document.getElementById('adjustmentsTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderAdjustmentsSkeleton();

        const limit = pagination ? pagination.itemsPerPage : 15;
        const response = await fetch(`/api/stock-adjustments?page=${page}&limit=${limit}`);
        const data = await response.json();

        if (!data.success || data.data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: var(--gray-600);">
                        <i class="fas fa-clipboard-list" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 1rem;"></i>
                        <p>No adjustments found</p>
                        <p style="font-size: 0.875rem; margin-top: 0.5rem;">Click "New Batch Adjustment" to create one</p>
                    </td>
                </tr>
            `;
            if (pagination) pagination.update({ page: 1, totalPages: 1, total: 0, limit });
            return;
        }

        tbody.innerHTML = data.data.map(adj => {
            const typeClass = adj.adjustment_type === 'addition' ? 'success' :
                adj.adjustment_type === 'subtraction' ? 'danger' : 'warning';
            const diffSign = adj.difference >= 0 ? '+' : '';

            return `
                <tr>
                    <td><strong>${adj.adjustment_number}</strong></td>
                    <td>
                        <div>${adj.item_name}</div>
                        <small style="color: var(--gray-500);">${adj.item_code}</small>
                    </td>
                    <td><span class="badge badge-${typeClass}">${adj.adjustment_type.toUpperCase()}</span></td>
                    <td style="color: ${adj.difference >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
                        ${diffSign}${adj.difference}
                    </td>
                    <td>${new Date(adj.adjustment_date).toLocaleDateString()}</td>
                    <td>${adj.adjusted_by_name || 'N/A'}</td>
                    <td>
                        ${adj.uses_batch_tracking ?
                    '<span class="badge badge-info"><i class="fas fa-check"></i> Batch</span>' :
                    '<span class="badge badge-secondary">Regular</span>'}
                    </td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="viewAdjustment(${adj.id})">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Update pagination
        if (pagination && data.pagination) {
            pagination.update(data.pagination);
        }
    } catch (error) {
        console.error('Error loading adjustments:', error);
        const tbody = document.getElementById('adjustmentsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 2rem; color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        Failed to load adjustments: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderAdjustmentsSkeleton() {
    const tableBody = document.getElementById('adjustmentsTableBody');
    if (!tableBody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td>
                    <div class="skeleton skeleton-text" style="width: 150px;"></div>
                    <div class="skeleton skeleton-text" style="width: 60px; height: 12px; margin-top: 5px;"></div>
                </td>
                <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div></td>
            </tr>
        `);
    }

    tableBody.innerHTML = skeletons.join('');
}

// Initialize page
export default function initStockAdjustments() {
    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 15,
        onPageChange: (page) => {
            loadAdjustments(page);
        }
    });

    loadAdjustments(1);
    initFormHandler();

    // Expose functions to window for inline onclick handlers
    window.openBatchAdjustmentModal = openBatchAdjustmentModal;
    window.closeBatchAdjustmentModal = closeBatchAdjustmentModal;
    window.loadBatchesForItem = loadBatchesForItem;
    window.toggleBatchItem = toggleBatchItem;
    window.handleAdjustmentTypeChange = handleAdjustmentTypeChange;
    window.handleCorrectionActionChange = handleCorrectionActionChange;
    window.toggleBatchSelection = toggleBatchSelection;
    window.updateAdjustmentSummary = updateAdjustmentSummary;
    window.viewAdjustment = async (id) => {
        try {
            const response = await fetch(`/api/stock-adjustments/${id}`);
            const data = await response.json();

            if (data.success) {
                const adj = data.data;
                const typeClass = adj.adjustment_type === 'addition' ? 'success' :
                    adj.adjustment_type === 'subtraction' ? 'danger' : 'warning';
                const diffSign = adj.difference >= 0 ? '+' : '';
                const diffColor = adj.difference >= 0 ? 'var(--success)' : 'var(--danger)';

                let message = `
                    <div style="padding: 0.5rem;">
                        <!-- Adjustment Header -->
                        <div style="background: var(--gray-50); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                                <h3 style="margin: 0; color: var(--gray-800); font-size: 1.1rem;">
                                    <i class="fas fa-clipboard-list" style="color: var(--primary-color); margin-right: 0.5rem;"></i>
                                    ${adj.adjustment_number}
                                </h3>
                                <span class="badge badge-${typeClass}" style="font-size: 0.9rem;">
                                    ${adj.adjustment_type.toUpperCase()}
                                </span>
                            </div>
                            <div style="color: var(--gray-600); font-size: 0.875rem;">
                                <i class="fas fa-calendar-alt" style="margin-right: 0.5rem;"></i>
                                ${new Date(adj.adjustment_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })}
                            </div>
                        </div>

                        <!-- Item Information -->
                        <div style="background: white; border: 1px solid var(--gray-200); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                            <h4 style="margin: 0 0 0.75rem 0; color: var(--gray-700); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                <i class="fas fa-box" style="color: var(--primary-color); margin-right: 0.5rem;"></i>
                                Item Details
                            </h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                                <div>
                                    <div style="font-size: 0.75rem; color: var(--gray-500); margin-bottom: 0.25rem;">Item Name</div>
                                    <div style="font-weight: 600; color: var(--gray-800);">${adj.item_name}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: var(--gray-500); margin-bottom: 0.25rem;">Item Code</div>
                                    <div style="font-weight: 600; color: var(--gray-800);">${adj.item_code}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Adjustment Details -->
                        <div style="background: white; border: 1px solid var(--gray-200); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                            <h4 style="margin: 0 0 0.75rem 0; color: var(--gray-700); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                <i class="fas fa-exchange-alt" style="color: var(--primary-color); margin-right: 0.5rem;"></i>
                                Adjustment Summary
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                                <div style="text-align: center; padding: 0.75rem; background: var(--gray-50); border-radius: var(--radius-md);">
                                    <div style="font-size: 0.75rem; color: var(--gray-500); margin-bottom: 0.5rem;">Before</div>
                                    <div style="font-size: 1.25rem; font-weight: 600; color: var(--gray-700);">${adj.current_quantity}</div>
                                </div>
                                <div style="text-align: center; padding: 0.75rem; background: ${adj.difference >= 0 ? 'var(--success-light)' : 'var(--danger-light)'}; border-radius: var(--radius-md);">
                                    <div style="font-size: 0.75rem; color: var(--gray-600); margin-bottom: 0.5rem;">Change</div>
                                    <div style="font-size: 1.25rem; font-weight: 700; color: ${diffColor};">
                                        ${diffSign}${adj.difference}
                                    </div>
                                </div>
                                <div style="text-align: center; padding: 0.75rem; background: var(--gray-50); border-radius: var(--radius-md);">
                                    <div style="font-size: 0.75rem; color: var(--gray-500); margin-bottom: 0.5rem;">After</div>
                                    <div style="font-size: 1.25rem; font-weight: 600; color: var(--gray-700);">${adj.adjusted_quantity}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Reason -->
                        <div style="background: var(--warning-light); border-left: 4px solid var(--warning); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                            <div style="font-size: 0.75rem; color: var(--gray-600); margin-bottom: 0.5rem; font-weight: 600;">
                                <i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>
                                REASON
                            </div>
                            <div style="color: var(--gray-800);">${adj.reason}</div>
                        </div>
                `;

                // Batch Details if available
                if (adj.batch_items && adj.batch_items.length > 0) {
                    message += `
                        <div style="background: white; border: 1px solid var(--gray-200); padding: 1rem; border-radius: var(--radius-md);">
                            <h4 style="margin: 0 0 0.75rem 0; color: var(--gray-700); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                <i class="fas fa-layer-group" style="color: var(--primary-color); margin-right: 0.5rem;"></i>
                                Batch Details (${adj.batch_items.length} batches)
                            </h4>
                            <div style="max-height: 200px; overflow-y: auto;">
                    `;

                    adj.batch_items.forEach((b, index) => {
                        const batchDiffSign = b.quantity_adjusted >= 0 ? '+' : '';
                        message += `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: ${index % 2 === 0 ? 'var(--gray-50)' : 'white'}; border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; color: var(--gray-800); margin-bottom: 0.25rem;">
                                        <i class="fas fa-tag" style="color: var(--info); margin-right: 0.5rem; font-size: 0.875rem;"></i>
                                        GRN ${b.grn_number}
                                    </div>
                                    <div style="font-size: 0.75rem; color: var(--gray-500);">
                                        ${new Date(b.received_date).toLocaleDateString()}
                                    </div>
                                </div>
                                <div style="text-align: right; font-weight: 600; font-size: 1rem; color: ${b.quantity_adjusted >= 0 ? 'var(--success)' : 'var(--danger)'};">
                                    ${batchDiffSign}${b.quantity_adjusted} ${adj.unit_of_measure || 'units'}
                                </div>
                            </div>
                        `;
                    });

                    message += `
                            </div>
                        </div>
                    `;
                }

                message += '</div>';

                messageModal.info(message, 'Adjustment Details');
            }
        } catch (error) {
            messageModal.error('Error loading adjustment details', 'Error');
        }
    };
}
