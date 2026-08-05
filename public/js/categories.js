/**
 * Categories Management functionality
 */

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import messageModal from './message-modal.js';

// State
let categories = [];
let baseCategories = [];
let editingCategoryId = null;

// Export init function for Router
export default async function init() {
    // Reset state
    categories = [];
    baseCategories = [];
    editingCategoryId = null;

    if (!(await auth.requireAuth())) {
        return;
    }

    // Load categories
    await loadCategories();

    // Event listeners
    const addBtn = document.getElementById('addCategoryBtn');
    if (addBtn) addBtn.addEventListener('click', () => openCategoryModal());

    const closeModal = document.getElementById('closeModal');
    if (closeModal) closeModal.addEventListener('click', closeCategoryModal);

    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeCategoryModal);

    const form = document.getElementById('categoryForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const closeViewModalBtn = document.getElementById('closeViewModal');
    if (closeViewModalBtn) closeViewModalBtn.addEventListener('click', closeViewModal);

    const closeViewBtn = document.getElementById('closeViewBtn');
    if (closeViewBtn) closeViewBtn.addEventListener('click', closeViewModal);

    // Close modals on backdrop click
    const categoryModal = document.getElementById('categoryModal');
    if (categoryModal) {
        categoryModal.addEventListener('click', (e) => {
            if (e.target.id === 'categoryModal') closeCategoryModal();
        });
    }

    const viewModal = document.getElementById('viewModal');
    if (viewModal) {
        viewModal.addEventListener('click', (e) => {
            if (e.target.id === 'viewModal') closeViewModal();
        });
    }
}

async function loadCategories() {
    try {
        // Show skeleton loading
        renderCategoriesSkeleton();

        const response = await api.categories.getAll();
        if (response.success) {
            categories = response.data;
            baseCategories = response.baseCategories;
            renderCategories(response.hierarchical);
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        // messageModal.error('Failed to load categories');
        const tableBody = document.getElementById('categoriesTable');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger" style="padding: 2rem;">
                        <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                        Failed to load categories: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderCategoriesSkeleton() {
    const tableBody = document.getElementById('categoriesTable');
    if (!tableBody) return;

    const rowCount = 8; // Categories are usually fewer than items
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px; border-radius: 12px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 250px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 40px;"></div></td>
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

function renderCategories(hierarchical) {
    const tbody = document.getElementById('categoriesTable');

    if (hierarchical.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 3rem; color: var(--gray-500);">
                    <i class="fas fa-tags" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>No categories found</p>
                    <p style="font-size: 0.9rem;">Click "Add Category" to create your first category</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';

    hierarchical.forEach(base => {
        // Render base category
        html += renderCategoryRow(base, false);

        // Render sub-categories
        if (base.children && base.children.length > 0) {
            base.children.forEach(sub => {
                html += renderCategoryRow(sub, true);
            });
        }
    });

    tbody.innerHTML = html;
}

function renderCategoryRow(category, isSubCategory) {
    const typeClass = category.type.toLowerCase().replace(/\s+/g, '-');
    const rowClass = isSubCategory ? 'sub-category-row' : '';

    return `
        <tr class="${rowClass}">
            <td>
                ${isSubCategory ? '<span class="hierarchy-indicator">└</span>' : ''}
                <strong>${category.name}</strong>
            </td>
            <td>
                <span class="category-type-badge ${typeClass}">${category.type}</span>
            </td>

            <td>${category.description || '-'}</td>
            <td>${category.item_count || 0}</td>
            <td>
                <div class="btn-group">
                    <button onclick="window.viewCategory(${category.id})" class="btn btn-sm btn-info" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="window.editCategory(${category.id})" class="btn btn-sm btn-primary" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function getParentName(parentId) {
    const parent = categories.find(c => c.id === parentId);
    return parent ? parent.name : 'Unknown';
}

function openCategoryModal(category = null) {
    editingCategoryId = category ? category.id : null;

    document.getElementById('modalTitle').textContent = category ? 'Edit Category' : 'Add Category';
    document.getElementById('categoryId').value = category ? category.id : '';
    document.getElementById('categoryName').value = category ? category.name : '';
    document.getElementById('categoryType').value = 'Finished Goods'; // Always Finished Goods
    document.getElementById('categoryDescription').value = category ? (category.description || '') : '';

    document.getElementById('categoryModal').classList.add('active');
    document.getElementById('categoryName').focus();
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
    document.getElementById('categoryForm').reset();
    editingCategoryId = null;
}

function handleTypeChange(e) {
    const selectedType = e.target.value;
    updateParentCategoriesDropdown(selectedType);
}

function updateParentCategoriesDropdown(selectedType) {
    const select = document.getElementById('parentCategory');

    // Clear existing options except the first one
    select.innerHTML = '<option value="">None (Base Category)</option>';

    if (!selectedType) return;

    // Filter base categories by the selected type
    const filteredCategories = baseCategories.filter(c => c.type === selectedType);

    filteredCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        select.appendChild(option);
    });
}

async function handleSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');

    const categoryData = {
        name: document.getElementById('categoryName').value.trim(),
        type: 'Finished Goods', // Always Finished Goods
        description: document.getElementById('categoryDescription').value.trim() || null,
        parent_id: null // Always null (no parent categories)
    };

    if (!categoryData.name || !categoryData.type) {
        messageModal.warning('Please fill in all required fields');
        return;
    }

    if (submitBtn) submitBtn.disabled = true;
    loadingScreen.show(editingCategoryId ? 'Updating category...' : 'Creating category...');

    try {
        let response;
        if (editingCategoryId) {
            response = await api.categories.update(editingCategoryId, categoryData);
        } else {
            response = await api.categories.create(categoryData);
        }

        if (response.success) {
            messageModal.success(response.message);
            closeCategoryModal();
            await loadCategories();
        } else {
            messageModal.error(response.message);
        }
    } catch (error) {
        console.error('Error saving category:', error);
        messageModal.error(error.message || 'Failed to save category');
    } finally {
        await loadingScreen.hide();
        if (submitBtn) submitBtn.disabled = false;
    }
}

window.viewCategory = async function (id) {
    loadingScreen.show('Loading category details...');

    try {
        const data = await api.categories.getById(id);

        if (data.success) {
            const category = data.data;

            // Basic Info
            document.getElementById('viewCatName').textContent = category.name;
            document.getElementById('viewCatType').textContent = category.type;
            document.getElementById('viewCatDescription').textContent = category.description || 'No description available';

            // Hierarchy
            document.getElementById('viewCatParent').textContent = category.parent_name || 'None (Base Category)';
            document.getElementById('viewCatSubCount').textContent = category.subcategory_count || 0;

            // Stats
            document.getElementById('viewCatItemCount').textContent = category.item_count || 0;

            // Status
            const statusBadge = document.getElementById('viewCatStatus');
            statusBadge.textContent = category.status;
            statusBadge.className = `badge badge-${category.status === 'active' ? 'success' : 'secondary'}`;

            // Edit Button Logic
            document.getElementById('viewEditBtn').onclick = () => {
                document.getElementById('viewModal').classList.remove('active');
                window.editCategory(id);
            };

            document.getElementById('viewModal').classList.add('active');
        } else {
            messageModal.error(data.message);
        }
    } catch (error) {
        console.error('Error loading category details:', error);
        messageModal.error('Failed to load category details');
    } finally {
        await loadingScreen.hide();
    }
};

window.editCategory = async function (id) {
    const category = categories.find(c => c.id === id);
    if (category) {
        openCategoryModal(category);
    } else {
        messageModal.error('Category not found');
    }
};

window.deleteCategory = async function (id, name) {
    messageModal.confirm(
        `Are you sure you want to delete the category "${name}"?<br><small>This action cannot be undone.</small>`,
        async () => {
            loadingScreen.show('Deleting category...');

            try {
                const response = await api.categories.delete(id);

                if (response.success) {
                    messageModal.success(response.message);
                    await loadCategories();
                } else {
                    messageModal.error(response.message);
                }
            } catch (error) {
                console.error('Error deleting category:', error);
                messageModal.error(error.message || 'Failed to delete category');
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};

function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
}
