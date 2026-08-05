/**
 * Items/Products Management
 */

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import Pagination from './pagination.js';
import toast from './toast.js';
import messageModal from './message-modal.js';


let items = [];
let allCategories = [];
let suppliers = [];
let uoms = [];
let finishedGoodsCategoryId = null; // New global variable
let editingItemId = null;
let pagination = null;
let searchQuery = '';
let searchTimeout = null;

// Export init function for Router
export default async function init() {
    // Check authentication (Double check, though Router handles it)
    const isAuth = await auth.requireAuth();
    if (!isAuth) {
        return;
    }

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadItems(page);
        }
    });

    // Load data
    try {
        await loadCategories();
        await loadSuppliers();
        await loadUOMs();
        await loadItems(1);
    } catch (error) {
        console.error('Error initializing items:', error);
    }

    // Event listeners
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', handleSearch);

    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) addItemBtn.addEventListener('click', showAddModal);

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);

    const itemForm = document.getElementById('itemForm');
    if (itemForm) itemForm.addEventListener('submit', handleSubmit);

    // Inline UOM Creation Logic
    const addUomBtn = document.getElementById('addUomBtn');
    if (addUomBtn) addUomBtn.addEventListener('click', showUomModal);

    const closeUomModal = document.getElementById('closeUomModal');
    if (closeUomModal) closeUomModal.addEventListener('click', hideUomModal);

    const cancelUomBtn = document.getElementById('cancelUomBtn');
    if (cancelUomBtn) cancelUomBtn.addEventListener('click', hideUomModal);

    const uomCreationForm = document.getElementById('uomCreationForm');
    if (uomCreationForm) uomCreationForm.addEventListener('submit', handleUomSubmit);

    // Initialize Bulk Upload CSV listeners
    initBulkItemUpload();




    // Add event listener for category change (formerly base category)
    const categorySelect = document.getElementById('itemSubCategory'); // Now acts as the main category select
    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            const selectedCategoryId = e.target.value;
            const selectedCategory = allCategories.find(c => c.id == selectedCategoryId);
            const categoryType = selectedCategory ? selectedCategory.type : null;
            updateReorderFieldVisibility(categoryType);
            updateSellingPriceFieldVisibility(categoryType);
        });
    }

    // Setup Tax Calculation Listeners
    setupTaxCalculationListeners();
}

function setupTaxCalculationListeners() {
    const taxRateSelect = document.getElementById('itemTaxRate');
    const taxTypeSelect = document.getElementById('itemTaxType');
    const exclInput = document.getElementById('itemSellingPriceExcl');
    const inclInput = document.getElementById('itemSellingPriceIncl');

    if (!taxRateSelect || !taxTypeSelect || !exclInput || !inclInput) return;

    function recalculateFromExcl() {
        const rate = parseFloat(taxRateSelect.value) || 0;
        const excl = parseFloat(exclInput.value) || 0;
        const incl = excl * (1 + rate / 100);
        inclInput.value = excl ? incl.toFixed(2) : '';
    }

    function recalculateFromIncl() {
        const rate = parseFloat(taxRateSelect.value) || 0;
        const incl = parseFloat(inclInput.value) || 0;
        const excl = rate > 0 ? (incl / (1 + rate / 100)) : incl;
        exclInput.value = incl ? excl.toFixed(2) : '';
    }

    exclInput.addEventListener('input', recalculateFromExcl);
    inclInput.addEventListener('input', recalculateFromIncl);

    taxRateSelect.addEventListener('change', () => {
        if (taxTypeSelect.value === 'inclusive') {
            recalculateFromIncl();
        } else {
            recalculateFromExcl();
        }
    });

    taxTypeSelect.addEventListener('change', () => {
        if (taxTypeSelect.value === 'inclusive') {
            recalculateFromIncl();
        } else {
            recalculateFromExcl();
        }
    });
}



async function loadItems(page = 1) {
    try {
        const { limit } = pagination ? pagination.getState() : { limit: 10 };

        const params = {
            page: page,
            limit: limit,
            search: searchQuery,
            min_shop_stock: 1 // Only show items with shop_stock > 0
        };

        // Removed type filters as all items are shown now

        // Show skeleton loading
        renderItemsSkeleton();

        const response = await api.items.getAll(params);
        if (response.success) {
            items = response.data;
            renderItems(items);

            if (pagination && response.pagination) {
                // Update pagination with response data
                pagination.update({
                    page: response.pagination.page,
                    limit: response.pagination.limit,
                    total: response.pagination.totalItems,
                    totalPages: response.pagination.totalPages
                });
            }
        }
    } catch (error) {
        console.error('Error loading items:', error);
        toast.error('Failed to load items: ' + error.message);
        document.getElementById('itemsTableBody').innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger">
                    <i class="fas fa-exclamation-circle"></i> Failed to load items: ${error.message}
                </td>
            </tr>
        `;
    }
}

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

function renderItemsSkeleton() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 200px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <div class="skeleton skeleton-text" style="width: 60px; height: 30px;"></div>
                        <div class="skeleton skeleton-text" style="width: 60px; height: 30px;"></div>
                        <div class="skeleton skeleton-text" style="width: 30px; height: 30px;"></div>
                    </div>
                </td>
            </tr>
        `);
    }

    tbody.innerHTML = skeletons.join('');
}

function renderItems(itemsToShow) {
    const tbody = document.getElementById('itemsTableBody');

    // Remove stockCols and priceCols visibility toggles, as we now have a single view

    if (itemsToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No items found</td></tr>';
        return;
    }

    tbody.innerHTML = itemsToShow.map(item => {
        // Determine stock status for shop location only
        const shopClass = (item.shop_stock || 0) <= item.reorder_level ? 'text-danger' :
            (item.shop_stock || 0) <= (item.reorder_level * 2) ? 'text-warning' : '';

        const taxRate = parseFloat(item.tax_rate) || 0;
        const exclPrice = parseFloat(item.selling_price_excl_tax || item.selling_price || 0).toFixed(2);
        const inclPrice = parseFloat(item.selling_price_incl_tax || (exclPrice * (1 + taxRate / 100))).toFixed(2);

        return `
            <tr>
                <td><strong>${item.code || 'N/A'}</strong></td>
                <td>${item.name}</td>

                <td>
                    <div><strong>KSh ${exclPrice}</strong> <small class="text-muted">(Excl)</small></div>
                    ${taxRate > 0
                ? `<div style="font-size: 0.8rem; color: #0e4a35; margin-top: 2px;"><span class="badge" style="background:#e0e7ff; color:#0e4a35; padding: 2px 6px; border-radius: 4px; font-weight:600;">${taxRate}% Tax</span> KSh ${inclPrice} (Incl)</div>`
                : `<div style="font-size: 0.8rem; color: #6b7280; margin-top: 2px;">No Tax</div>`}
                </td>
                <td class="${shopClass}"><strong>${item.shop_stock || 0}</strong></td>
                <td>
                    <span class="badge badge-${item.status === 'active' ? 'success' : 'secondary'}">
                        ${item.status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewItemDetails(${item.id})" title="View Details">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="window.editItem(${item.id})" style="margin-left: 5px;">Edit</button>
                    <button class="btn btn-sm btn-info" onclick="window.viewBatches(${item.id})" style="margin-left: 5px;" title="View Batches">
                        <i class="fas fa-layer-group"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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
    if (!reorderInput) return;
    const reorderGroup = reorderInput.closest('.form-group');

    if (categoryType === 'Raw Materials' || categoryType === 'Finished Goods') {
        if (reorderGroup) reorderGroup.style.display = 'block';
        reorderInput.required = true;
    } else {
        if (reorderGroup) reorderGroup.style.display = 'none';
        reorderInput.required = false;
        reorderInput.value = '0';
    }
}

function updateSellingPriceFieldVisibility(categoryType) {
    const sellingPriceGroup = document.getElementById('sellingPriceGroup');
    const sellingPriceInput = document.getElementById('itemSellingPriceExcl') || document.getElementById('itemSellingPrice');

    if (sellingPriceGroup) {
        if (categoryType === 'Finished Goods') {
            sellingPriceGroup.style.display = 'block';
            if (sellingPriceInput) sellingPriceInput.required = true;
        } else {
            sellingPriceGroup.style.display = 'none';
            if (sellingPriceInput) sellingPriceInput.required = false;
        }
    }
}

function renderSupplierSelect() {
    const select = document.getElementById('itemSupplier');
    if (!select) return;
    const options = suppliers.map(sup =>
        `<option value="${sup.id}">${sup.name}</option>`
    ).join('');
    select.innerHTML = '<option value="">Select supplier...</option>' + options;
}

function renderUOMSelect() {
    const select = document.getElementById('itemUnit');
    if (!select) return;
    const options = uoms.map(uom =>
        `<option value="${uom.short_name}">${uom.name} (${uom.short_name})</option>`
    ).join('');
    select.innerHTML = '<option value="">Select unit...</option>' + options;
}

function handleSearch(e) {
    const query = e.target.value;
    searchQuery = query;

    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(() => {
        if (pagination) {
            pagination.reset();
        }
        loadItems(1);
    }, 300);
}

function showAddModal() {
    editingItemId = null;
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = 'Add Product Master';
    const itemForm = document.getElementById('itemForm');
    if (itemForm) itemForm.reset();

    renderCategorySelect(finishedGoodsCategoryId);
    const subCatSelect = document.getElementById('itemSubCategory');
    if (subCatSelect) subCatSelect.disabled = false;

    updateReorderFieldVisibility('Finished Goods');
    updateSellingPriceFieldVisibility('Finished Goods');
    const modal = document.getElementById('itemModal');
    if (modal) modal.style.display = 'block';
}

window.editItem = function (itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    editingItemId = itemId;
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = 'Edit Product Master';

    const nameInput = document.getElementById('itemName');
    if (nameInput) nameInput.value = item.name;

    const descInput = document.getElementById('itemDescription');
    if (descInput) descInput.value = item.description || '';

    renderCategorySelect(item.category_id);
    const subCatSelect = document.getElementById('itemSubCategory');
    if (subCatSelect) subCatSelect.disabled = false;

    updateReorderFieldVisibility(item.category_type);
    updateSellingPriceFieldVisibility(item.category_type || (item.category ? item.category.type : null));

    const unitSelect = document.getElementById('itemUnit');
    if (unitSelect) unitSelect.value = item.unit_of_measure;

    // Tax & Dual Pricing fields
    const taxRate = item.tax_rate || 0;
    const taxRateSelect = document.getElementById('itemTaxRate');
    if (taxRateSelect) taxRateSelect.value = taxRate;

    const taxTypeSelect = document.getElementById('itemTaxType');
    if (taxTypeSelect) taxTypeSelect.value = item.tax_type || 'exclusive';

    const exclVal = parseFloat(item.selling_price_excl_tax || item.selling_price || 0).toFixed(2);
    const inclVal = parseFloat(item.selling_price_incl_tax || (exclVal * (1 + taxRate / 100))).toFixed(2);

    const priceExclInput = document.getElementById('itemSellingPriceExcl');
    if (priceExclInput) priceExclInput.value = exclVal;

    const priceInclInput = document.getElementById('itemSellingPriceIncl');
    if (priceInclInput) priceInclInput.value = inclVal;

    const reorderInput = document.getElementById('itemReorder');
    if (reorderInput) reorderInput.value = item.reorder_level;

    const supplierSelect = document.getElementById('itemSupplier');
    if (supplierSelect) supplierSelect.value = item.supplier_id || '';

    const modal = document.getElementById('itemModal');
    if (modal) modal.style.display = 'block';
};

function hideModal() {
    document.getElementById('itemModal').style.display = 'none';
    document.getElementById('itemForm').reset();
    editingItemId = null;
}

window.hideItemModal = hideModal;

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
        messageModal.error('Failed to create item: ' + error.message, 'Create Failed');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function handleSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');

    const categoryId = parseInt(document.getElementById('itemSubCategory').value); // Now main category

    if (!categoryId) {
        messageModal.warning('Please select a category', 'Category Required');
        return;
    }

    const exclPrice = parseFloat(document.getElementById('itemSellingPriceExcl').value) || 0;
    const inclPrice = parseFloat(document.getElementById('itemSellingPriceIncl').value) || 0;
    const taxRate = parseFloat(document.getElementById('itemTaxRate').value) || 0;

    const itemData = {
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDescription').value,
        category_id: categoryId,
        unit_of_measure: document.getElementById('itemUnit').value,
        tax_rate: taxRate,
        tax_type: document.getElementById('itemTaxType').value || 'exclusive',
        selling_price_excl_tax: exclPrice,
        selling_price_incl_tax: inclPrice || (exclPrice * (1 + taxRate / 100)),
        selling_price: exclPrice,
        reorder_level: parseInt(document.getElementById('itemReorder').value) || 0,
        supplier_id: document.getElementById('itemSupplier').value || null
    };

    if (submitBtn) submitBtn.disabled = true;
    loadingScreen.show('Saving item...');
    try {
        let response;
        if (editingItemId) {
            response = await api.items.update(editingItemId, itemData);
        } else {
            response = await api.items.create(itemData);
        }

        if (response.success) {
            messageModal.success(editingItemId ? 'Item updated successfully!' : 'Item created successfully!', editingItemId ? 'Item Updated' : 'Item Created');
            hideModal();
            await loadItems();
        }
    } catch (error) {
        messageModal.error('Failed to save item: ' + error.message, 'Save Failed');
    } finally {
        await loadingScreen.hide();
        if (submitBtn) submitBtn.disabled = false;
    }
}

// View batches for item
window.viewBatches = async function (itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('viewBatchesTitle').textContent = `Batches for ${item.name}`;
    const tbody = document.getElementById('viewBatchesTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading batches...</td></tr>';
    document.getElementById('viewBatchesModal').style.display = 'block';

    try {
        // Use direct fetch if api wrapper not available yet, or assume api has get method
        // Since api.get is generic in api.js usually
        const response = await api.get(`/batches/item/${itemId}`); // Assuming api.get exists or adding it

        // If api.js doesn't have .get method exposed directly (it usually does), we might need to check api.js
        // Based on inventory-batches.js I wrote earlier, I assumed api.get works.

        if (response.success) {
            const batches = response.data;
            if (batches.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No active batches found</td></tr>';
                return;
            }

            tbody.innerHTML = batches.map(batch => `
                <tr>
                    <td><strong>${batch.batch_number}</strong></td>
                    <td>${batch.grn_number}</td>
                    <td>${new Date(batch.received_date).toLocaleDateString()}</td>
                    <td>${parseFloat(batch.cost_per_unit).toFixed(2)}</td>
                    <td>${batch.initial_quantity}</td>
                    <td><strong>${batch.current_quantity}</strong></td>
                    <td><span class="badge badge-${batch.current_quantity > 0 ? 'success' : 'secondary'}">
                        ${batch.current_quantity > 0 ? 'Active' : 'Depleted'}
                    </span></td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading batches:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Error: ${error.message}</td></tr>`;
    }
};

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const batchModal = document.getElementById('viewBatchesModal');
    if (e.target === batchModal) {
        batchModal.style.display = 'none';
    }

    const detailsModal = document.getElementById('viewItemDetailsModal');
    if (e.target === detailsModal) {
        detailsModal.style.display = 'none';
    }
});

// View item details in modal
window.viewItemDetails = function (itemId) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    // Basic Information
    document.getElementById('detailCode').textContent = item.code || 'N/A';
    document.getElementById('detailName').textContent = item.name;
    document.getElementById('detailDescription').textContent = item.description || 'No description available';

    // Category Information
    // Category Information
    let baseCategoryName = 'N/A';
    let subCategoryName = item.category_name || 'N/A';

    const category = allCategories.find(c => c.id === item.category_id);
    if (category) {
        if (category.parent_id) {
            // It is a sub-category
            subCategoryName = category.name;
            const parent = allCategories.find(c => c.id === category.parent_id);
            if (parent) {
                baseCategoryName = parent.name;
            }
        } else {
            // It is a base category
            baseCategoryName = category.name;
            subCategoryName = '-';
        }
    }

    document.getElementById('detailBaseCategory').textContent = baseCategoryName;
    document.getElementById('detailSubCategory').textContent = subCategoryName;

    // Pricing & Inventory
    const taxRate = parseFloat(item.tax_rate) || 0;
    const exclPrice = parseFloat(item.selling_price_excl_tax || item.selling_price || 0).toFixed(2);
    const inclPrice = parseFloat(item.selling_price_incl_tax || (exclPrice * (1 + taxRate / 100))).toFixed(2);

    document.getElementById('detailSellingPrice').innerHTML = `
        <div style="font-size: 1.5rem;">KSh ${exclPrice} <small style="font-size: 0.9rem; opacity: 0.7;">(Excl)</small></div>
        ${taxRate > 0
            ? `<div style="font-size: 0.9rem; color: #0e4a35; margin-top: 4px;"><span class="badge" style="background:#e0e7ff; color:#0e4a35; padding: 2px 6px;">${taxRate}% Tax</span> KSh ${inclPrice} (Incl)</div>`
            : `<div style="font-size: 0.85rem; color: #6b7280; margin-top: 4px;">No Tax</div>`}
    `;
    document.getElementById('detailUnit').textContent = item.unit_of_measure;

    const supplier = suppliers.find(s => s.id === item.supplier_id);
    document.getElementById('detailSupplier').textContent = supplier ? supplier.name : 'No supplier';
    document.getElementById('detailReorderLevel').textContent = item.reorder_level;

    // Stock Levels with color coding
    const shopStockEl = document.getElementById('detailShopStock');
    // const storeStockEl = document.getElementById('detailStoreStock'); // Removed
    // const totalStockEl = document.getElementById('detailTotalStock'); // Removed

    const shopStock = item.shop_stock || 0;
    // const storeStock = item.store_stock || 0; // Removed
    // const totalStock = item.total_stock || 0; // Removed

    shopStockEl.textContent = shopStock;
    // storeStockEl.textContent = storeStock; // Removed
    // totalStockEl.textContent = totalStock; // Removed

    shopStockEl.style.color = shopStock <= item.reorder_level ? 'var(--danger-color)' :
        shopStock <= (item.reorder_level * 2) ? 'var(--warning-color)' : 'inherit';
    // storeStockEl.style.color = storeStock <= item.reorder_level ? 'var(--danger-color)' : // Removed
    //     storeStock <= (item.reorder_level * 2) ? 'var(--warning-color)' : 'inherit'; // Removed
    // totalStockEl.style.color = totalStock <= item.reorder_level ? 'var(--danger-color)' : // Removed
    //     totalStock <= (item.reorder_level * 2) ? 'var(--warning-color)' : 'inherit'; // Removed

    // Status
    const statusBadge = document.getElementById('detailStatus');
    statusBadge.textContent = item.status;
    statusBadge.className = `badge badge-${item.status === 'active' ? 'success' : 'secondary'}`;

    // Set up action buttons
    document.getElementById('detailEditBtn').onclick = () => {
        document.getElementById('viewItemDetailsModal').style.display = 'none';
        window.editItem(itemId);
    };

    document.getElementById('detailViewBatchesBtn').onclick = () => {
        document.getElementById('viewItemDetailsModal').style.display = 'none';
        window.viewBatches(itemId);
    };

    document.getElementById('viewItemDetailsModal').style.display = 'block';
};

/**
 * Bulk CSV Upload for Items
 */
function initBulkItemUpload() {
    const downloadTemplateBtn = document.getElementById('downloadItemTemplateBtn');
    const modalDownloadTemplateBtn = document.getElementById('modalDownloadItemTemplateBtn');
    const bulkUploadBtn = document.getElementById('bulkUploadItemBtn');
    const modal = document.getElementById('bulkUploadItemModal');
    const closeBtn = document.getElementById('closeBulkUploadItemModalBtn');
    const closeFooterBtn = document.getElementById('closeItemBulkModalFooterBtn');
    const dropzone = document.getElementById('itemCsvDropzone');
    const fileInput = document.getElementById('itemCsvFileInput');
    const selectedFileName = document.getElementById('selectedItemCsvName');
    const startUploadBtn = document.getElementById('startItemCsvUploadBtn');
    const resultsContainer = document.getElementById('itemBulkUploadResultsContainer');
    const resultsTableBody = document.getElementById('itemBulkResultsTableBody');
    const summaryBadge = document.getElementById('itemBulkUploadSummaryBadge');

    let selectedFile = null;

    const triggerDownload = () => {
        window.open('/api/items/bulk-template', '_blank');
    };

    if (downloadTemplateBtn) downloadTemplateBtn.addEventListener('click', triggerDownload);
    if (modalDownloadTemplateBtn) modalDownloadTemplateBtn.addEventListener('click', triggerDownload);

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
            dropzone.style.borderColor = '#0e4a35';
            dropzone.style.background = '#eef2ff';
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
            toast.error('Please select a valid .csv file');
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
                if (window.loadingScreen) window.loadingScreen.show('Processing CSV bulk upload...');
                const res = await api.postFormData('/items/bulk-upload', formData);
                if (window.loadingScreen) window.loadingScreen.hide();

                toast.success(`Upload complete: ${res.summary.created} created, ${res.summary.failed} failed`);

                if (resultsContainer) resultsContainer.style.display = 'block';
                if (summaryBadge) {
                    summaryBadge.textContent = `${res.summary.created} Created / ${res.summary.failed} Failed`;
                    summaryBadge.style.background = res.summary.failed > 0 ? '#fef2f2' : '#f0fdf4';
                    summaryBadge.style.color = res.summary.failed > 0 ? '#991b1b' : '#166534';
                }

                if (resultsTableBody) {
                    resultsTableBody.innerHTML = res.results.map(r => `
                        <tr>
                            <td style="padding: 0.5rem 0.75rem; font-weight: 600;">Row ${r.row}</td>
                            <td style="padding: 0.5rem 0.75rem;">${r.name || '-'}</td>
                            <td style="padding: 0.5rem 0.75rem;">
                                ${r.status === 'created' 
                                    ? '<span class="badge badge-success">✅ Created</span>' 
                                    : '<span class="badge badge-danger">❌ Failed</span>'}
                            </td>
                            <td style="padding: 0.5rem 0.75rem; color: ${r.status === 'created' ? '#166534' : '#991b1b'};">
                                ${r.code ? `Code: <strong>${r.code}</strong>` : (r.reason || '')}
                            </td>
                        </tr>
                    `).join('');
                }

                if (res.summary.created > 0) {
                    loadItems(1);
                }
            } catch (err) {
                if (window.loadingScreen) window.loadingScreen.hide();
                toast.error(err.message || 'Bulk upload failed');
            }
        });
    }
}



