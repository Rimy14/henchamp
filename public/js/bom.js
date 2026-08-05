/**
 * Bill of Materials (BOM) Management
 */

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import Pagination from './pagination.js';
import messageModal from './message-modal.js';
import SearchableDropdown from './searchable-dropdown.js';

let boms = [];
let finishedGoods = [];
let rawMaterials = [];
let bomComponents = []; // Components in current BOM being created
let pagination = null;
let finishedGoodDropdown = null;
let rawMaterialDropdown = null;

// Export init function for Router
export default async function init() {
    // Reset state
    boms = [];
    finishedGoods = [];
    rawMaterials = [];
    bomComponents = [];
    pagination = null;

    loadingScreen.show('Loading BOMs...');

    // Check authentication
    if (!(await auth.requireAuth())) {
        await loadingScreen.hide();
        return;
    }

    // Initialize pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadBOMs(page);
        }
    });

    // Load data
    try {
        await loadFinishedGoods();
        await loadRawMaterials();
        await loadBOMs(1);
    } finally {
        await loadingScreen.hide();
    }

    // Event listeners
    const createBtn = document.getElementById('createBOMBtn');
    if (createBtn) createBtn.addEventListener('click', showCreateModal);

    const cancelBtn = document.getElementById('cancelBOMBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);

    const addMaterialBtn = document.getElementById('addMaterialBtn');
    if (addMaterialBtn) addMaterialBtn.addEventListener('click', addMaterialToBOM);

    const form = document.getElementById('bomForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const materialSelect = document.getElementById('rawMaterialSelect');
    if (materialSelect) materialSelect.addEventListener('change', handleMaterialSelect);

    const closeViewBtn = document.getElementById('closeViewBOMBtn');
    if (closeViewBtn) closeViewBtn.addEventListener('click', () => {
        if (window.hideViewBOM) window.hideViewBOM();
    });

    const closeViewBtnBottom = document.getElementById('closeViewBtnBottom');
    if (closeViewBtnBottom) closeViewBtnBottom.addEventListener('click', () => {
        if (window.hideViewBOM) window.hideViewBOM();
    });

    // Close modal when clicking outside
    const modal = document.getElementById('bomModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideModal();
        });
    }

    const viewModal = document.getElementById('viewBOMModal');
    if (viewModal) {
        viewModal.addEventListener('click', (e) => {
            if (e.target === viewModal && window.hideViewBOM) window.hideViewBOM();
        });
    }
}

async function loadBOMs(page = 1) {
    try {
        const { limit } = pagination ? pagination.getState() : { limit: 10 };

        const params = {
            page: page,
            limit: limit
        };

        const response = await api.get('/bom', { params });
        if (response.success) {
            boms = response.data;
            renderBOMs(boms);

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
        console.error('Error loading BOMs:', error);
        document.getElementById('bomTableBody').innerHTML = `
            <tr><td colspan="8" class="text-center text-danger">Error loading BOMs</td></tr>
        `;
    }
}

async function loadFinishedGoods() {
    try {
        const response = await api.get('/bom/finished-goods');
        if (response.success) {
            finishedGoods = response.data;
            renderFinishedGoodsSelect();
        }
    } catch (error) {
        console.error('Error loading finished goods:', error);
    }
}

async function loadRawMaterials() {
    try {
        const response = await api.get('/bom/raw-materials');
        if (response.success) {
            rawMaterials = response.data;
            renderRawMaterialsSelect();
        }
    } catch (error) {
        console.error('Error loading raw materials:', error);
    }
}

function renderBOMs(bomsToShow) {
    const tbody = document.getElementById('bomTableBody');

    if (bomsToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No BOMs found</td></tr>';
        return;
    }

    tbody.innerHTML = bomsToShow.map(bom => {
        const statusClass = bom.is_active ? 'success' : 'secondary';
        const statusText = bom.is_active ? 'Active' : 'Inactive';

        return `
            <tr>
                <td><strong>${bom.finished_good_name}</strong></td>
                <td>${bom.finished_good_code}</td>
                <td>${bom.category_name}</td>
                <td>v${bom.version}</td>
                <td>${bom.component_count} items</td>
                <td><span class="badge badge-${statusClass}">${statusText}</span></td>
                <td>${bom.created_by_name}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="window.viewBOM(${bom.id})">View</button>
                    ${bom.is_active ?
                `<button class="btn btn-sm btn-primary" onclick="window.editBOM(${bom.id})">Edit</button>
                         <button class="btn btn-sm btn-danger" onclick="window.deactivateBOM(${bom.id}, '${bom.finished_good_name}')">Deactivate</button>`
                : `<button class="btn btn-sm btn-success" onclick="window.activateBOM(${bom.id}, '${bom.finished_good_name}')">Activate</button>`
            }
                </td>
            </tr>
        `;
    }).join('');
}

function renderFinishedGoodsSelect() {
    const select = document.getElementById('finishedGood');
    const options = finishedGoods.map(item =>
        `<option value="${item.id}">${item.name} (${item.code})</option>`
    ).join('');
    select.innerHTML = '<option value="">Select finished good...</option>' + options;

    if (finishedGoodDropdown) {
        finishedGoodDropdown.destroy();
    }
    finishedGoodDropdown = new SearchableDropdown(select);
}

function renderRawMaterialsSelect() {
    const select = document.getElementById('rawMaterialSelect');
    const options = rawMaterials.map(item =>
        `<option value="${item.id}" data-code="${item.code}" data-unit="${item.unit_of_measure}">${item.name} (${item.code}) - ${item.current_stock} ${item.unit_of_measure}</option>`
    ).join('');
    select.innerHTML = '<option value="">Select raw material...</option>' + options;

    if (rawMaterialDropdown) {
        rawMaterialDropdown.destroy();
    }
    rawMaterialDropdown = new SearchableDropdown(select);
}

function showCreateModal() {
    bomComponents = [];
    document.getElementById('bomForm').reset();

    if (finishedGoodDropdown) finishedGoodDropdown.selectOption('', 'Select finished good...');
    if (rawMaterialDropdown) rawMaterialDropdown.selectOption('', 'Select raw material...');

    document.getElementById('modalTitle').textContent = 'Create Bill of Materials';
    renderBOMComponents();
    document.getElementById('bomModal').style.display = 'block';
}

function hideModal() {
    document.getElementById('bomModal').style.display = 'none';
    bomComponents = [];
}

function handleMaterialSelect() {
    const select = document.getElementById('rawMaterialSelect');
    const selectedOption = select.options[select.selectedIndex];
    // Could auto-populate unit or other fields here if needed
}

function addMaterialToBOM() {
    const materialId = parseInt(document.getElementById('rawMaterialSelect').value);
    const quantity = parseFloat(document.getElementById('materialQuantity').value);
    const notes = document.getElementById('materialNotes').value;

    if (!materialId || !quantity || quantity <= 0) {
        messageModal.warning('Please select a raw material and enter a valid quantity', 'Invalid Input');
        return;
    }

    const material = rawMaterials.find(m => m.id === materialId);
    if (!material) return;

    // Check if material already added
    const existingIndex = bomComponents.findIndex(c => c.raw_material_id === materialId);
    if (existingIndex >= 0) {
        // Update existing
        bomComponents[existingIndex].quantity = quantity;
        bomComponents[existingIndex].notes = notes;
    } else {
        // Add new
        bomComponents.push({
            raw_material_id: materialId,
            raw_material_name: material.name,
            raw_material_code: material.code,
            unit_of_measure: material.unit_of_measure,
            quantity: quantity,
            notes: notes
        });
    }

    // Reset inputs
    if (rawMaterialDropdown) {
        rawMaterialDropdown.selectOption('', 'Select raw material...');
    } else {
        document.getElementById('rawMaterialSelect').value = '';
    }
    document.getElementById('materialQuantity').value = '1';
    document.getElementById('materialNotes').value = '';

    renderBOMComponents();
}

function renderBOMComponents() {
    const tbody = document.getElementById('bomComponentsTable');

    if (bomComponents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No components added</td></tr>`;
        return;
    }

    tbody.innerHTML = bomComponents.map((comp, index) => {
        return `
            <tr>
                <td>${comp.raw_material_name}</td>
                <td>${comp.raw_material_code}</td>
                <td>${comp.unit_of_measure}</td>
                <td>${comp.quantity}</td>
                <td>${comp.notes || '-'}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-danger" onclick="window.removeBOMComponent(${index})">Remove</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.removeBOMComponent = function (index) {
    bomComponents.splice(index, 1);
    renderBOMComponents();
};

async function handleSubmit(e) {
    e.preventDefault();

    if (bomComponents.length === 0) {
        messageModal.warning('Please add at least one raw material component', 'Components Required');
        return;
    }

    const bomData = {
        finished_good_id: parseInt(document.getElementById('finishedGood').value),
        description: document.getElementById('bomDescription').value,
        items: bomComponents
    };

    loadingScreen.show('Creating BOM...');
    try {
        const response = await api.post('/bom', bomData);

        if (response.success) {
            messageModal.success('BOM created successfully!', 'BOM Created');
            hideModal();
            await loadBOMs();
        }
    } catch (error) {
        if (error.status === 409) {
            messageModal.warning(error.message, 'Creation Failed');
        } else {
            messageModal.error('Failed to create BOM: ' + error.message, 'Creation Failed');
        }
    } finally {
        await loadingScreen.hide();
    }
}

window.viewBOM = async function (id) {
    try {
        const response = await api.get(`/bom/${id}`);
        if (response.success) {
            const bom = response.data;
            const statusClass = bom.is_active ? 'success' : 'secondary';
            const statusText = bom.is_active ? 'Active' : 'Inactive';
            const content = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <p><strong>Finished Good:</strong> ${bom.finished_good_name}</p>
                        <p><strong>Code:</strong> ${bom.finished_good_code}</p>
                        <p><strong>Version:</strong> v${bom.version}</p>
                    </div>
                    <div>
                        <p><strong>Status:</strong> <span class="badge badge-${statusClass}">${statusText}</span></p>
                        <p><strong>Created By:</strong> ${bom.created_by_name}</p>
                        <p><strong>Components:</strong> ${bom.items ? bom.items.length : 0} items</p>
                    </div>
                </div>
                ${bom.description ? `<p><strong>Description:</strong> ${bom.description}</p>` : ''}
                <h3 style="margin-top: 1.5rem;">Raw Material Components</h3>
                <table class="data-table">
                    <thead><tr><th>Material</th><th>Code</th><th>Quantity</th><th>Notes</th></tr></thead>
                    <tbody>
                        ${(bom.items || []).map(item => `
                            <tr>
                                <td><strong>${item.raw_material_name}</strong></td>
                                <td>${item.raw_material_code}</td>
                                <td>${item.quantity} ${item.unit_of_measure}</td>
                                <td>${item.notes || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            document.getElementById('viewBOMContent').innerHTML = content;
            document.getElementById('viewBOMModal').style.display = 'flex';
        }
    } catch (error) {
        messageModal.error('Error viewing BOM: ' + error.message, 'View Failed');
    }
};

window.hideViewBOM = function () {
    document.getElementById('viewBOMModal').style.display = 'none';
};

window.editBOM = async function (id) {
    try {
        const response = await api.get(`/bom/${id}`);
        if (response.success) {
            const bom = response.data;

            // Load components
            bomComponents = bom.items.map(item => ({
                raw_material_id: item.raw_material_id,
                raw_material_name: item.raw_material_name,
                raw_material_code: item.raw_material_code,
                unit_of_measure: item.unit_of_measure,
                quantity: item.quantity,
                notes: item.notes
            }));

            // Populate form
            document.getElementById('finishedGood').value = bom.finished_good_id;

            // Sync searchable dropdown
            if (finishedGoodDropdown) {
                const select = document.getElementById('finishedGood');
                const selectedOption = select.options[select.selectedIndex];
                if (selectedOption) {
                    // Update display manually or recreate - but selectOption is best if we have the text
                    // Wait - selectOption triggers change event. Is that bad? 
                    // Usually fine. But if change handler does something... here strict set is better.
                    // Actually let's just use selectOption as it ensures consistency.
                    // But selectOption closes the dropdown (which is already closed).
                    finishedGoodDropdown.selectOption(bom.finished_good_id, selectedOption.text);
                }
            }

            document.getElementById('bomDescription').value = bom.description || '';
            document.getElementById('modalTitle').textContent = 'Edit Bill of Materials';

            renderBOMComponents();
            document.getElementById('bomModal').style.display = 'block';

            // Modify form submission for update
            const form = document.getElementById('bomForm');
            form.onsubmit = async function (e) {
                e.preventDefault();

                if (bomComponents.length === 0) {
                    messageModal.warning('Please add at least one component', 'Components Required');
                    return;
                }

                const bomData = {
                    description: document.getElementById('bomDescription').value,
                    items: bomComponents
                };

                try {
                    const updateResponse = await api.put(`/bom/${id}`, bomData);
                    if (updateResponse.success) {
                        messageModal.success('BOM updated successfully!', 'BOM Updated');
                        hideModal();
                        await loadBOMs();
                        form.onsubmit = handleSubmit; // Reset to original handler
                    }
                } catch (error) {
                    messageModal.error('Failed to update BOM: ' + error.message, 'Update Failed');
                }
            };
        }
    } catch (error) {
        messageModal.error('Error loading BOM for editing: ' + error.message, 'Load Failed');
    }
};

window.deactivateBOM = function (id, name) {
    messageModal.confirm(
        'Confirm Deactivation',
        `Are you sure you want to deactivate BOM for "<strong>${name}</strong>"?`,
        async () => {
            loadingScreen.show('Deactivating BOM...');
            try {
                const response = await api.delete(`/bom/${id}`);
                if (response.success) {
                    messageModal.success('BOM deactivated successfully!', 'BOM Deactivated');
                    await loadBOMs(pagination ? pagination.page : 1);
                }
            } catch (error) {
                messageModal.error('Error deactivating BOM: ' + error.message, 'Deactivation Failed');
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};

window.activateBOM = function (id, name) {
    messageModal.confirm(
        'Confirm Activation',
        `Are you sure you want to activate BOM for "<strong>${name}</strong>"?`,
        async () => {
            loadingScreen.show('Activating BOM...');
            try {
                const response = await api.patch(`/bom/${id}/status`, { is_active: true });
                if (response.success) {
                    messageModal.success('BOM activated successfully!', 'BOM Activated');
                    await loadBOMs(pagination ? pagination.page : 1);
                }
            } catch (error) {
                messageModal.error('Error activating BOM: ' + error.message, 'Activation Failed');
            } finally {
                await loadingScreen.hide();
            }
        }
    );
};

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('bomModal');
    if (e.target === modal) {
        hideModal();
    }
});

