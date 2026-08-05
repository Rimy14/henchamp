import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import Pagination from './pagination.js';

let customers = [];
let editingCustomerId = null;
let pagination = null;
let searchTimeout = null;

// Export init function for Router
export default async function init() {
    // Reset state
    customers = [];
    editingCustomerId = null;
    pagination = null;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = null;

    // Check authentication
    if (!(await auth.requireAuth())) return;

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadCustomers(page);
        }
    });

    // Show loading screen
    // loadingScreen.show('Loading customers...'); // We now use skeleton loading

    try {
        await loadCustomers(1);
    } catch (err) {
        console.error("Error init customers:", err);
    }

    // Event listeners
    const addBtn = document.getElementById('addCustomerBtn');
    if (addBtn) addBtn.addEventListener('click', openAddModal);

    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    const form = document.getElementById('customerForm');
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
                loadCustomers(1);
            }, 300);
        });
    }

    // Close modal on backdrop click
    const modal = document.getElementById('customerModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'customerModal') closeModal();
        });
    }
}

async function loadCustomers(page = 1) {
    try {
        const tbody = document.getElementById('customersTableBody');
        if (!tbody) return;

        // Show skeleton loading
        renderCustomersSkeleton();

        const searchTerm = document.getElementById('searchInput').value;
        const { limit } = pagination ? pagination.getState() : { limit: 10 };

        const response = await api.customers.getAll({
            page: page,
            limit: limit,
            search: searchTerm
        });

        if (response.success) {
            customers = response.data;
            renderCustomers();

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
        console.error('Error loading customers:', error);
        const tbody = document.getElementById('customersTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem; color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        Failed to load customers: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderCustomersSkeleton() {
    const tableBody = document.getElementById('customersTableBody');
    if (!tableBody) return;

    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
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

function renderCustomers() {
    const tbody = document.getElementById('customersTableBody');

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No customers found</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(customer => `
        <tr>
            <td><strong>${customer.customer_code || 'N/A'}</strong></td>
            <td>${customer.name}</td>
            <td>${customer.phone || '-'}</td>
            <td>${customer.email || '-'}</td>
            <td>${customer.city || '-'}</td>
            <td><strong>${customer.credit_period || 30} days</strong></td>

            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-sm btn-secondary" onclick="window.editCustomer(${customer.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.deleteCustomer(${customer.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddModal() {
    editingCustomerId = null;
    document.getElementById('modalTitle').textContent = 'Add Customer';
    document.getElementById('customerForm').reset();
    const modal = document.getElementById('customerModal');
    modal.classList.add('show');
    modal.style.display = 'flex'; // Ensure flex is set if CSS doesn't force it via class alone (though it should)
}

window.editCustomer = function (id) {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    editingCustomerId = id;
    document.getElementById('modalTitle').textContent = 'Edit Customer';
    document.getElementById('customerId').value = customer.id;
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerPhone').value = customer.phone || '';
    document.getElementById('customerEmail').value = customer.email || '';
    document.getElementById('customerCity').value = customer.city || '';
    document.getElementById('customerCreditPeriod').value = customer.credit_period || 30;

    document.getElementById('customerAddress').value = customer.address || '';

    const modal = document.getElementById('customerModal');
    modal.classList.add('show');
    modal.style.display = 'flex';
};

function closeModal() {
    const modal = document.getElementById('customerModal');
    modal.classList.remove('show');
    modal.style.display = 'none';
    document.getElementById('customerForm').reset();
    editingCustomerId = null;
}

async function handleSubmit(e) {
    e.preventDefault();

    const customerData = {
        name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        email: document.getElementById('customerEmail').value || null,
        city: document.getElementById('customerCity').value || null,
        credit_period: parseInt(document.getElementById('customerCreditPeriod').value) || 30,
        company: 'PRINTHUB',
        address: document.getElementById('customerAddress').value || null
    };

    loadingScreen.show(editingCustomerId ? 'Updating customer...' : 'Creating customer...');

    try {
        let response;
        if (editingCustomerId) {
            response = await api.customers.update(editingCustomerId, customerData);
        } else {
            response = await api.customers.create(customerData);
        }

        if (response.success) {
            toast.success(editingCustomerId ? 'Customer updated successfully!' : 'Customer created successfully!');
            closeModal();
            // Preserve current page when reloading
            const currentPage = pagination ? pagination.getState().page : 1;
            await loadCustomers(currentPage);
        }
    } catch (error) {
        toast.error('Failed to save customer: ' + error.message);
    } finally {
        await loadingScreen.hide();
    }
}

window.deleteCustomer = async function (id) {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    const messageModal = (await import('./message-modal.js')).default;

    messageModal.confirm(
        'Delete Customer',
        `Are you sure you want to delete customer "${customer.name}"? This action cannot be undone.`,
        async () => {
            loadingScreen.show('Deleting customer...');
            try {
                const response = await api.customers.delete(id);
                if (response.success) {
                    toast.success('Customer deleted successfully!');
                    // Preserve current page when reloading
                    const currentPage = pagination ? pagination.getState().page : 1;
                    await loadCustomers(currentPage);
                }
            } catch (error) {
                console.error('Error deleting customer:', error);
                toast.error('Failed to delete customer: ' + error.message);
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};
