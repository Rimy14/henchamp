/**
 * Supplier Management functionality
 */

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import Pagination from './pagination.js';

let suppliers = [];
let editingSupplierId = null;
let pagination = null;
let searchTimeout = null;

// Export init function for Router
export default async function init() {
    // Reset state
    suppliers = [];
    editingSupplierId = null;
    pagination = null;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = null;

    // Check authentication
    if (!(await auth.requireAuth())) return;

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadSuppliers(page);
        }
    });

    // Load initial data
    // loadingScreen.show('Loading suppliers...'); // We now use skeleton loading
    try {
        await loadSuppliers(1);
    } catch (err) {
        console.error("Error init suppliers:", err);
    }

    // Event listeners
    const addBtn = document.getElementById('addSupplierBtn');
    if (addBtn) addBtn.addEventListener('click', openAddModal);

    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    const form = document.getElementById('supplierForm');
    if (form) form.addEventListener('submit', handleSubmit);

    // Search listener
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (pagination) {
                    pagination.reset(); // Reset to first page on search
                }
                loadSuppliers(1);
            }, 300);
        });
    }

    // Close modal on backdrop click
    const modal = document.getElementById('supplierModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'supplierModal') closeModal();
        });
    }
}

async function loadSuppliers(page = 1) {
    try {
        const tbody = document.getElementById('suppliersTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderSuppliersSkeleton();

        const searchTerm = document.getElementById('searchInput').value;
        const { limit } = pagination ? pagination.getState() : { limit: 10 };

        const response = await api.suppliers.getAll({
            page: page,
            limit: limit,
            search: searchTerm
        });

        if (response.success) {
            suppliers = response.data;
            renderSuppliers();

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
        console.error('Error loading suppliers:', error);
        const tbody = document.getElementById('suppliersTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        Failed to load suppliers: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderSuppliersSkeleton() {
    const tableBody = document.getElementById('suppliersTableBody');
    if (!tableBody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 120px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                        <div class="skeleton skeleton-text" style="width: 32px; height: 32px; border-radius: 4px;"></div>
                    </div>
                </td>
            </tr>
        `);
    }

    tableBody.innerHTML = skeletons.join('');
}

function renderSuppliers() {
    const tbody = document.getElementById('suppliersTableBody');

    if (suppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No suppliers found</td></tr>';
        return;
    }

    tbody.innerHTML = suppliers.map(supplier => `
        <tr>
            <td><strong>${supplier.code}</strong></td>
            <td>${supplier.name}</td>
            <td>${supplier.contact_person || '-'}</td>
            <td>${supplier.phone || '-'}</td>
            <td>${supplier.email || '-'}</td>
            <td>${supplier.city || '-'}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="window.editSupplier(${supplier.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteSupplier(${supplier.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddModal() {
    editingSupplierId = null;
    document.getElementById('modalTitle').textContent = 'Add New Supplier';
    document.getElementById('supplierForm').reset();
    const modal = document.getElementById('supplierModal');
    modal.classList.add('show');
    modal.style.display = 'flex';
}

window.editSupplier = function (id) {
    const supplier = suppliers.find(s => s.id === id);
    if (!supplier) return;

    editingSupplierId = id;
    document.getElementById('modalTitle').textContent = 'Edit Supplier';

    document.getElementById('supplierName').value = supplier.name;
    document.getElementById('supplierContact').value = supplier.contact_person || '';
    document.getElementById('supplierEmail').value = supplier.email || '';
    document.getElementById('supplierPhone').value = supplier.phone || '';
    document.getElementById('supplierCity').value = supplier.city || '';
    document.getElementById('supplierCountry').value = supplier.country || '';
    document.getElementById('supplierTaxNumber').value = supplier.tax_number || '';
    document.getElementById('supplierCreditLimit').value = supplier.credit_limit || 0;
    document.getElementById('supplierPaymentTerms').value = supplier.payment_terms || '';
    document.getElementById('supplierAddress').value = supplier.address || '';

    const modal = document.getElementById('supplierModal');
    modal.classList.add('show');
    modal.style.display = 'flex';
};

function closeModal() {
    const modal = document.getElementById('supplierModal');
    modal.classList.remove('show');
    modal.style.display = 'none';
    document.getElementById('supplierForm').reset();
    editingSupplierId = null;
}

async function handleSubmit(e) {
    e.preventDefault();

    const supplierData = {
        name: document.getElementById('supplierName').value,
        contact_person: document.getElementById('supplierContact').value || null,
        email: document.getElementById('supplierEmail').value || null,
        phone: document.getElementById('supplierPhone').value,
        city: document.getElementById('supplierCity').value || null,
        country: document.getElementById('supplierCountry').value || null,
        tax_number: document.getElementById('supplierTaxNumber').value || null,
        credit_limit: parseFloat(document.getElementById('supplierCreditLimit').value) || 0,
        payment_terms: document.getElementById('supplierPaymentTerms').value || null,
        address: document.getElementById('supplierAddress').value || null
    };

    loadingScreen.show(editingSupplierId ? 'Updating supplier...' : 'Creating supplier...');

    try {
        let response;
        if (editingSupplierId) {
            response = await api.suppliers.update(editingSupplierId, supplierData);
        } else {
            response = await api.suppliers.create(supplierData);
        }

        if (response.success) {
            toast.success(editingSupplierId ? 'Supplier updated successfully!' : 'Supplier created successfully!');
            closeModal();
            await loadSuppliers();
        }
    } catch (error) {
        toast.error('Failed to save supplier: ' + error.message);
    } finally {
        await loadingScreen.hide();
    }
}

window.deleteSupplier = async function (id) {
    const supplier = suppliers.find(s => s.id === id);
    if (!supplier) return;

    const messageModal = (await import('./message-modal.js')).default;

    messageModal.confirm(
        'Delete Supplier',
        `Are you sure you want to delete supplier "${supplier.name}"? This action cannot be undone.`,
        async () => {
            loadingScreen.show('Deleting supplier...');
            try {
                const response = await api.suppliers.delete(id);
                if (response.success) {
                    toast.success('Supplier deleted successfully!');
                    await loadSuppliers();
                }
            } catch (error) {
                toast.error('Failed to delete supplier: ' + error.message);
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};

