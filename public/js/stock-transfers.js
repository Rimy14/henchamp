import api from './api.js';
import auth from './auth.js';
import messageModal from './message-modal.js';
import SearchableDropdown from './searchable-dropdown.js';
import Pagination from './pagination.js';

let transferItems = [];
let locations = [];
let items = [];
let itemDropdown = null; // Searchable dropdown instance
let pagination = null;

export default async function init() {
    if (!(await auth.requireAuth())) return;

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 15,
        onPageChange: (page) => {
            loadTransfers(page);
        }
    });

    try {
        await loadLocations();
        await loadTransfers(1);
        await loadItems();
    } catch (error) {
        console.error('Initialization error:', error);
        messageModal.error(
            'Failed to load stock transfer data. Please refresh the page and try again.',
            'Initialization Error'
        );
    }

    // Event Listeners
    document.getElementById('newTransferBtn').addEventListener('click', showModal);
    document.getElementById('transferForm').addEventListener('submit', handleSubmit);
    document.getElementById('addItemBtn').addEventListener('click', addItem);
    document.getElementById('fromLocation').addEventListener('change', updateItemStockDisplay);
    document.getElementById('itemSelect').addEventListener('change', updateItemStockDisplay);

    // Set default date
    document.getElementById('transferDate').valueAsDate = new Date();

    // Global helpers
    window.hideTransferModal = hideModal;
    window.removeTransferItem = removeItem;
    window.viewTransferDetails = viewTransferDetails;
}

async function loadLocations() {
    try {
        const res = await api.request('/stock-transfers/locations');
        if (res.success) {
            locations = res.data;

            if (locations.length === 0) {
                messageModal.warning(
                    'No active locations found. Please configure locations before creating stock transfers.',
                    'No Locations Available'
                );
                return;
            }

            const opts = locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
            document.getElementById('fromLocation').innerHTML = `<option value="">Select...</option>${opts}`;
            document.getElementById('toLocation').innerHTML = `<option value="">Select...</option>${opts}`;

            // Defaults
            const store = locations.find(l => l.name === 'Store');
            const shop = locations.find(l => l.name === 'Shop');

            if (store) document.getElementById('fromLocation').value = store.id;
            if (shop) document.getElementById('toLocation').value = shop.id;
        } else {
            throw new Error(res.message || 'Failed to load locations');
        }
    } catch (error) {
        console.error('Load locations error:', error);
        messageModal.error(
            error.message || 'Unable to load locations. Please check your connection and try again.',
            'Location Load Error'
        );
    }
}

async function loadItems() {
    try {
        // Fetch only Raw Materials items for stock transfers
        const res = await api.request('/stock-transfers/raw-materials');
        if (res.success) {
            items = res.data;

            if (items.length === 0) {
                messageModal.warning(
                    'No raw material items found. Please add raw material items before creating stock transfers.',
                    'No Items Available'
                );
                document.getElementById('itemSelect').innerHTML = `<option value="">No raw materials available</option>`;
                return;
            }

            const opts = items.map(i => `<option value="${i.id}">${i.name} (${i.code})</option>`).join('');
            document.getElementById('itemSelect').innerHTML = `<option value="">Select item...</option>${opts}`;

            // Initialize searchable dropdown
            if (itemDropdown) {
                itemDropdown.destroy();
            }
            itemDropdown = new SearchableDropdown(document.getElementById('itemSelect'));
        } else {
            throw new Error(res.message || 'Failed to load items');
        }
    } catch (error) {
        console.error('Load items error:', error);
        messageModal.error(
            error.message || 'Unable to load raw material items. Please check your connection and try again.',
            'Items Load Error'
        );
    }
}

async function loadTransfers(page = 1) {
    try {
        const tbody = document.getElementById('transfersTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderTransfersSkeleton();

        const limit = pagination ? pagination.itemsPerPage : 15;
        const res = await api.request(`/stock-transfers?page=${page}&limit=${limit}`);
        if (res.success) {
            const tbody = document.getElementById('transfersTableBody');
            if (res.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No transfers found</td></tr>';
                if (pagination) pagination.update({ page: 1, totalPages: 1, total: 0, limit });
                return;
            }
            tbody.innerHTML = res.data.map(t => `
                <tr>
                    <td><strong>${t.transfer_number}</strong></td>
                    <td>${new Date(t.transfer_date).toLocaleDateString()}</td>
                    <td>${t.from_location}</td>
                    <td>${t.to_location}</td>
                    <td>-</td>
                    <td><span class="badge badge-${t.status === 'completed' ? 'success' : 'warning'}">${t.status}</span></td>
                    <td>${t.initiated_by_name}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="window.viewTransferDetails(${t.id})" title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                </tr>
            `).join('');

            // Update pagination
            if (pagination && res.pagination) {
                pagination.update(res.pagination);
            }
        } else {
            throw new Error(res.message || 'Failed to load transfers');
        }
    } catch (error) {
        console.error('Load transfers error:', error);
        const tbody = document.getElementById('transfersTableBody');
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error loading transfers</td></tr>';
        messageModal.error(
            error.message || 'Unable to load stock transfers. Please refresh the page and try again.',
            'Transfer Load Error'
        );
    }
}

function renderTransfersSkeleton() {
    const tbody = document.getElementById('transfersTableBody');
    if (!tbody) return;

    const rows = Array.from({ length: 8 }, () => `
        <tr class="skeleton-row">
            <td><div class="skeleton skeleton-text" style="width: 110px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 90px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 30px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div></td>
        </tr>
    `).join('');

    tbody.innerHTML = rows;
}

async function updateItemStockDisplay() {
    const itemId = document.getElementById('itemSelect').value;
    const locationId = document.getElementById('fromLocation').value;
    const display = document.getElementById('currentStockDisplay');

    if (!itemId || !locationId) {
        display.value = '';
        return;
    }

    display.value = 'Checking...';

    try {
        // Fetch stock quantity from the backend
        const res = await api.request(`/stock-transfers/stock-by-location?itemId=${itemId}&locationId=${locationId}`);

        if (res.success) {
            const item = items.find(i => i.id == itemId);
            const unit = item?.unit_of_measure || '';
            display.value = `${res.data.quantity} ${unit}`;

            // Warn if stock is zero
            if (res.data.quantity === 0) {
                const itemSelect = document.getElementById('itemSelect');
                const itemName = itemSelect.options[itemSelect.selectedIndex].text;
                const fromLocSelect = document.getElementById('fromLocation');
                const locationName = fromLocSelect.options[fromLocSelect.selectedIndex].text;

                messageModal.warning(
                    `No stock available for "${itemName}" at "${locationName}". Transfer cannot be completed.`,
                    'No Stock Available'
                );
            }
        } else {
            display.value = '0';
            messageModal.warning(
                res.message || 'Could not retrieve stock information.',
                'Stock Check Failed'
            );
        }
    } catch (error) {
        console.error('Failed to fetch stock:', error);
        display.value = 'Error';
        messageModal.error(
            'Unable to check stock availability. Please try again.',
            'Stock Check Error'
        );
    }
}

function showModal() {
    document.getElementById('transferModal').style.display = 'block';
    transferItems = [];
    renderItems();
}

function hideModal() {
    document.getElementById('transferModal').style.display = 'none';
}

function addItem() {
    const select = document.getElementById('itemSelect');
    const itemId = select.value;
    const itemName = select.options[select.selectedIndex].text;
    const qtyInput = document.getElementById('transferQty').value;
    const qty = parseFloat(qtyInput);
    const item = items.find(i => i.id == itemId);
    const unit = item?.unit_of_measure || 'units';
    
    // Get numeric stock from display (stripping the unit if present)
    const stockDisplayValue = document.getElementById('currentStockDisplay').value;
    const currentStock = parseFloat(stockDisplayValue) || 0;

    // Validation: Item selected
    if (!itemId) {
        messageModal.warning('Please select an item to add to the transfer.', 'No Item Selected');
        return;
    }

    // Validation: Quantity entered
    if (!qtyInput || isNaN(qty) || qty <= 0) {
        messageModal.warning('Please enter a valid quantity greater than 0.', 'Invalid Quantity');
        return;
    }

    // Validation: Check if quantity exceeds available stock
    if (qty > currentStock) {
        messageModal.error(
            `Cannot add ${qty} ${unit}. Only ${currentStock} ${unit} available in stock at the selected location.`,
            'Insufficient Stock'
        );
        return;
    }

    // Check if item already added
    const existingItem = transferItems.find(item => item.item_id === itemId);
    if (existingItem) {
        const totalQty = existingItem.quantity + qty;
        if (totalQty > currentStock) {
            messageModal.error(
                `Cannot add ${qty} more units. You've already added ${existingItem.quantity} units. Total would be ${totalQty}, but only ${currentStock} available.`,
                'Insufficient Stock'
            );
            return;
        }
        existingItem.quantity = totalQty;
    } else {
        transferItems.push({ item_id: itemId, item_name: itemName, quantity: qty, unit: unit });
    }

    renderItems();

    select.value = '';
    document.getElementById('transferQty').value = '';
    document.getElementById('currentStockDisplay').value = '';
}

function removeItem(index) {
    transferItems.splice(index, 1);
    renderItems();
}

function renderItems() {
    const tbody = document.getElementById('transferItemsBody');
    if (transferItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No items added</td></tr>';
        return;
    }
    tbody.innerHTML = transferItems.map((item, idx) => `
        <tr>
            <td>${item.item_name}</td>
            <td>${item.quantity} ${item.unit || ''}</td>
            <td><button type="button" class="btn btn-sm btn-danger" onclick="window.removeTransferItem(${idx})">X</button></td>
        </tr>
    `).join('');
}

async function handleSubmit(e) {
    e.preventDefault();

    // Validation: Items added
    if (transferItems.length === 0) {
        messageModal.warning('Please add at least one item to transfer.', 'No Items Added');
        return;
    }

    const fromLocationId = document.getElementById('fromLocation').value;
    const toLocationId = document.getElementById('toLocation').value;
    const transferDate = document.getElementById('transferDate').value;

    // Validation: From location selected
    if (!fromLocationId) {
        messageModal.warning('Please select a source location (From Location).', 'From Location Required');
        return;
    }

    // Validation: To location selected
    if (!toLocationId) {
        messageModal.warning('Please select a destination location (To Location).', 'To Location Required');
        return;
    }

    // Validation: Different locations
    if (fromLocationId === toLocationId) {
        messageModal.error(
            'Source and destination locations must be different. Please select different locations.',
            'Same Location Selected'
        );
        return;
    }

    // Validation: Transfer date
    if (!transferDate) {
        messageModal.warning('Please select a transfer date.', 'Date Required');
        return;
    }

    const data = {
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        date: transferDate,
        notes: document.getElementById('transferNotes').value,
        items: transferItems
    };

    // Disable submit button to prevent double submission
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        const res = await api.request('/stock-transfers', {
            method: 'POST',
            body: data
        });

        if (res.success) {
            messageModal.success(
                `Transfer completed successfully!<br><br><strong>Transfer Number:</strong> ${res.data.transferNumber}`,
                'Transfer Created'
            );
            hideModal();
            loadTransfers();
            // Reset form
            transferItems = [];
            document.getElementById('transferForm').reset();
            document.getElementById('transferDate').valueAsDate = new Date();
        } else {
            throw new Error(res.message || 'Transfer creation failed');
        }
    } catch (err) {
        console.error('Transfer submission error:', err);
        let errorMessage = 'Failed to create transfer. ';

        if (err.message.includes('Insufficient stock')) {
            errorMessage = err.message;
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
            errorMessage += 'Network error. Please check your connection and try again.';
        } else {
            errorMessage += err.message || 'Please try again or contact support if the problem persists.';
        }

        messageModal.error(errorMessage, 'Transfer Failed');
    } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

async function viewTransferDetails(transferId) {
    try {
        // Fetch transfer details with items
        const res = await api.request(`/stock-transfers/${transferId}`);

        if (!res.success) {
            messageModal.error('Failed to load transfer details', 'Error');
            return;
        }

        const transfer = res.data;

        // Populate modal with transfer details
        document.getElementById('detailTransferNumber').textContent = transfer.transfer_number;
        document.getElementById('detailDate').textContent = new Date(transfer.transfer_date).toLocaleDateString();
        document.getElementById('detailFromLocation').textContent = transfer.from_location;
        document.getElementById('detailToLocation').textContent = transfer.to_location;

        const statusBadge = `<span class="badge badge-${transfer.status === 'completed' ? 'success' : 'warning'}">${transfer.status}</span>`;
        document.getElementById('detailStatus').innerHTML = statusBadge;

        // Show/hide notes
        if (transfer.notes) {
            document.getElementById('detailNotes').textContent = transfer.notes;
            document.getElementById('detailNotesGroup').style.display = 'block';
        } else {
            document.getElementById('detailNotesGroup').style.display = 'none';
        }

        // Populate items table
        const itemsBody = document.getElementById('detailItemsBody');
        if (transfer.items && transfer.items.length > 0) {
            itemsBody.innerHTML = transfer.items.map(item => `
                <tr>
                    <td>${item.item_name}</td>
                    <td>${item.item_code}</td>
                    <td><strong>${item.quantity} ${item.unit_of_measure || ''}</strong></td>
                </tr>
            `).join('');
        } else {
            itemsBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No items found</td></tr>';
        }

        // Show the modal
        document.getElementById('viewDetailsModal').style.display = 'block';

    } catch (err) {
        messageModal.error(err.message || 'Failed to load transfer details', 'Error');
    }
}
