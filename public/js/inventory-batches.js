/**
 * Inventory Batches Management
 */

import auth from './auth.js';
import api from './api.js';
import Pagination from './pagination.js';
import SearchableDropdown from './searchable-dropdown.js';

let batches = [];
let items = [];
let pagination = null;
let itemFilterDropdown = null; // Searchable dropdown instance

export default async function init() {
    // Reset state
    batches = [];
    items = [];
    pagination = null;
    itemFilterDropdown = null; // Reset dropdown instance

    // Check authentication
    const isAuth = await auth.requireAuth();
    if (!isAuth) return;

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 50,
        onPageChange: (page) => loadBatches(page)
    });

    // Event listeners
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadBatches(1));

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', debounce(handleSearch, 300));

    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', hideModal);

    // Close modal on outside click
    window.onclick = (event) => {
        const modal = document.getElementById('batchModal');
        if (event.target === modal) {
            hideModal();
        }
    };

    // Load initial data
    try {
        await Promise.all([
            loadItems(),
            loadBatches(1)
        ]);
    } catch (err) {
        console.error("Error init batches:", err);
    }
}

async function loadItems() {
    try {
        const response = await api.get('/items');
        if (response.success) {
            items = response.data;

            // Initialize searchable dropdown
            const container = document.getElementById('itemFilterContainer');
            if (container) {
                itemFilterDropdown = new SearchableDropdown(container, {
                    placeholder: 'Filter by Item (All)',
                    searchPlaceholder: 'Search items...',
                    emptyMessage: 'No items found',
                    items: [
                        { value: '', label: 'All Items' },
                        ...items.map(item => ({
                            value: item.id.toString(),
                            label: `${item.code} - ${item.name}`
                        }))
                    ],
                    onChange: (value) => {
                        loadBatches(1);
                    }
                });
            } else {
                console.error('itemFilterContainer not found in DOM');
            }
        }
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

async function loadBatches(page = 1) {
    try {
        const tbody = document.getElementById('batchTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderBatchesSkeleton();

        const itemId = itemFilterDropdown ? itemFilterDropdown.getValue() : '';
        const search = document.getElementById('searchInput').value;

        let url = `/batches?page=${page}&limit=50`;
        if (itemId) url += `&item_id=${itemId}`;

        // Note: Search isn't implemented in backend yet, doing client-side filtering for simplicity if needed
        // But let's rely on backend filtering for items/grns

        const response = await api.get(url);

        if (response.success) {
            batches = response.data;
            pagination.update(response.pagination.totalItems, page);
            renderBatches(batches);
        }
    } catch (error) {
        console.error('Error loading batches:', error);
        const tbody = document.getElementById('batchTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-danger" style="padding: 2rem;">
                        <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                        Failed to load batches: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderBatchesSkeleton() {
    const tableBody = document.getElementById('batchTableBody');
    if (!tableBody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td>
                    <div class="skeleton skeleton-text" style="width: 150px;"></div>
                    <div class="skeleton skeleton-text" style="width: 60px; height: 12px; margin-top: 5px;"></div>
                </td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 60px; height: 32px;"></div></td>
            </tr>
        `);
    }

    tableBody.innerHTML = skeletons.join('');
}

function renderBatches(batchesToRender) {
    const tbody = document.getElementById('batchTableBody');
    tbody.innerHTML = '';

    if (batchesToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">No batches found</td></tr>';
        return;
    }

    batchesToRender.forEach(batch => {
        const row = document.createElement('tr');

        // Calculate status color
        let statusClass = 'success';
        if (batch.current_quantity === 0) statusClass = 'secondary';
        else if (batch.current_quantity < batch.initial_quantity * 0.2) statusClass = 'warning';

        row.innerHTML = `
            <td><strong>${batch.batch_number}</strong></td>
            <td>
                ${batch.item_name}<br>
                <small class="text-muted">${batch.item_code}</small>
            </td>
            <td>${batch.grn_number || '-'}</td>
            <td>${new Date(batch.received_date).toLocaleDateString()}</td>
            <td>KSh ${parseFloat(batch.cost_per_unit).toFixed(2)}</td>
            <td>${batch.initial_quantity} ${batch.unit_of_measure}</td>
            <td><strong style="color: ${batch.current_quantity > 0 ? '#10b981' : '#6b7280'}">${batch.current_quantity} ${batch.unit_of_measure}</strong></td>
            <td><span class="badge badge-${statusClass}">${batch.current_quantity > 0 ? 'Active' : 'Depleted'}</span></td>
            <td>
                <button class="btn btn-sm btn-info" onclick="window.viewBatchDetails(${batch.id})">Details</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.viewBatchDetails = async function (id) {
    try {
        const response = await api.get(`/batches/${id}`);
        if (response.success) {
            const batch = response.data;

            const content = document.getElementById('batchDetailsContent');
            content.innerHTML = `
                <div class="grid grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <p><strong>Batch #:</strong> ${batch.batch_number}</p>
                        <p><strong>Item:</strong> ${batch.item_name} (${batch.item_code})</p>
                        <p><strong>GRN:</strong> ${batch.grn_number}</p>
                        <p><strong>Supplier:</strong> ${batch.supplier_name || 'N/A'}</p>
                    </div>
                    <div>
                        <p><strong>Received:</strong> ${new Date(batch.received_date).toLocaleDateString()}</p>
                        <p><strong>Cost:</strong> KSh ${parseFloat(batch.cost_per_unit).toFixed(2)}</p>
                        <p><strong>Initial Qty:</strong> ${batch.initial_quantity} ${batch.unit_of_measure}</p>
                        <p><strong>Current Qty:</strong> ${batch.current_quantity} ${batch.unit_of_measure}</p>
                    </div>
                </div>
            `;

            // Render consumption history
            const tbody = document.getElementById('consumptionTableBody');
            tbody.innerHTML = '';

            if (batch.consumption_history && batch.consumption_history.length > 0) {
                batch.consumption_history.forEach(record => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${new Date(record.consumed_at).toLocaleString()}</td>
                        <td>${record.reference_type.toUpperCase()}</td>
                        <td>${parseFloat(record.quantity_consumed).toFixed(2)}</td>
                        <td>${record.consumed_by_name}</td>
                        <td>${record.notes || '-'}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No usage history</td></tr>';
            }

            document.getElementById('batchModal').style.display = 'flex';
        }
    } catch (error) {
        alert('Error loading batch details');
    }
};

function hideModal() {
    document.getElementById('batchModal').style.display = 'none';
}

function handleSearch(e) {
    // Client-side filtration for now until backend search is robust
    const term = e.target.value.toLowerCase();
    const filtered = batches.filter(b =>
        b.batch_number.toLowerCase().includes(term) ||
        b.item_name.toLowerCase().includes(term) ||
        b.item_code.toLowerCase().includes(term) ||
        (b.grn_number && b.grn_number.toLowerCase().includes(term))
    );
    renderBatches(filtered);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
