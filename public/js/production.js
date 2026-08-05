/**
 * Production Management
 */

import auth from './auth.js';
import api from './api.js';
import messageModal from './message-modal.js';

let productions = [];
let activeBOMs = [];

// Export init function for Router
export default async function init() {
    // Reset state
    productions = [];
    activeBOMs = [];

    // Check authentication
    if (!(await auth.requireAuth())) return;

    // Load data
    await loadActiveBOMs();
    await loadProduction();

    // Event listeners
    const createBtn = document.getElementById('createProductionBtn');
    if (createBtn) createBtn.addEventListener('click', showCreateModal);

    const cancelBtn = document.getElementById('cancelProductionBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);

    const form = document.getElementById('productionForm');
    if (form) form.addEventListener('submit', handleSubmit);

    const bomSelect = document.getElementById('productionBOM');
    if (bomSelect) bomSelect.addEventListener('change', handleBOMSelect);

    const qtyInput = document.getElementById('productionQuantity');
    if (qtyInput) qtyInput.addEventListener('input', handleQuantityChange);

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('productionDate');
    if (dateInput) dateInput.value = today;

    // Close modal when clicking outside
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('productionModal');
        if (modal && e.target === modal) {
            hideModal();
        }
    });
}

async function loadProduction() {
    try {
        const response = await api.get('/production');
        if (response.success) {
            productions = response.data;
            renderProduction(productions);
        }
    } catch (error) {
        console.error('Error loading production records:', error);
        document.getElementById('productionTableBody').innerHTML = `
            <tr><td colspan="7" class="text-center text-danger">Error loading production records</td></tr>
        `;
    }
}

async function loadActiveBOMs() {
    try {
        const response = await api.get('/bom');
        if (response.success) {
            // Filter only active BOMs
            activeBOMs = response.data.filter(bom => bom.is_active);
            renderBOMSelect();
        }
    } catch (error) {
        console.error('Error loading BOMs:', error);
    }
}

function renderProduction(productionToShow) {
    const tbody = document.getElementById('productionTableBody');

    if (productionToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No production records found</td></tr>';
        return;
    }

    tbody.innerHTML = productionToShow.map(prod => {
        const statusClass = {
            'pending': 'warning',
            'completed': 'success',
            'cancelled': 'danger'
        }[prod.status] || 'secondary';

        return `
            <tr>
                <td><strong>${prod.production_number}</strong></td>
                <td>${prod.finished_good_name}</td>
                <td>${prod.quantity_produced}</td>
                <td>${formatDate(prod.production_date)}</td>
                <td><span class="badge badge-${statusClass}">${prod.status}</span></td>
                <td>${prod.produced_by_name}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="window.viewProduction(${prod.id})">View</button>
                    ${prod.status === 'pending' ? `<button class="btn btn-sm btn-danger" onclick="window.deleteProduction(${prod.id})">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function renderBOMSelect() {
    const select = document.getElementById('productionBOM');
    const options = activeBOMs.map(bom =>
        `<option value="${bom.id}">${bom.finished_good_name} (v${bom.version}) - ${bom.component_count} components</option>`
    ).join('');
    select.innerHTML = '<option value="">Select finished good...</option>' + options;
}

function showCreateModal() {
    document.getElementById('productionForm').reset();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('productionDate').value = today;
    document.getElementById('materialRequirementsSection').style.display = 'none';
    document.getElementById('productionWarning').style.display = 'none';
    document.getElementById('productionModal').style.display = 'block';
}

function hideModal() {
    document.getElementById('productionModal').style.display = 'none';
}

async function handleBOMSelect() {
    await checkMaterialRequirements();
}

async function handleQuantityChange() {
    await checkMaterialRequirements();
}

async function checkMaterialRequirements() {
    const bomId = document.getElementById('productionBOM').value;
    const quantity = parseInt(document.getElementById('productionQuantity').value);

    if (!bomId || !quantity || quantity <= 0) {
        document.getElementById('materialRequirementsSection').style.display = 'none';
        return;
    }

    try {
        const response = await api.get(`/production/calculate-requirements?bom_id=${bomId}&quantity=${quantity}`);

        if (response.success) {
            const { materials, canProduce } = response.data;

            // Show requirements section
            document.getElementById('materialRequirementsSection').style.display = 'block';

            // Render requirements table
            const tbody = document.getElementById('requirementsTableBody');
            tbody.innerHTML = materials.map(mat => {
                const statusClass = mat.stock_status === 'sufficient' ? 'success' : 'danger';
                const statusText = mat.stock_status === 'sufficient' ? '✓ Sufficient' : '✗ Insufficient';

                return `
                    <tr>
                        <td>${mat.raw_material_name}</td>
                        <td>${mat.total_required} ${mat.unit_of_measure}</td>
                        <td>${mat.current_stock} ${mat.unit_of_measure}</td>
                        <td><span class="badge badge-${statusClass}">${statusText}</span></td>
                    </tr>
                `;
            }).join('');

            // Show warning and disable button if insufficient
            if (!canProduce) {
                document.getElementById('productionWarning').style.display = 'block';
                document.getElementById('submitProductionBtn').disabled = true;
            } else {
                document.getElementById('productionWarning').style.display = 'none';
                document.getElementById('submitProductionBtn').disabled = false;
            }
        }
    } catch (error) {
        console.error('Error calculating requirements:', error);
    }
}

async function handleSubmit(e) {
    e.preventDefault();

    const productionData = {
        bom_id: parseInt(document.getElementById('productionBOM').value),
        quantity_produced: parseInt(document.getElementById('productionQuantity').value),
        production_date: document.getElementById('productionDate').value,
        notes: document.getElementById('productionNotes').value
    };

    try {
        const response = await api.post('/production', productionData);

        if (response.success) {
            messageModal.success(`Production recorded successfully! Production #${response.data.production_number}`, 'Production Recorded');
            hideModal();
            await loadProduction();
        }
    } catch (error) {
        messageModal.error('Failed to record production: ' + error.message, 'Recording Failed');
    }
}

window.viewProduction = async function (id) {
    try {
        const response = await api.get(`/production/${id}`);
        if (response.success) {
            const prod = response.data;
            let details = `Production #: ${prod.production_number}\n`;
            details += `Finished Good: ${prod.finished_good_name}\n`;
            details += `Quantity Produced: ${prod.quantity_produced}\n`;
            details += `Production Date: ${formatDate(prod.production_date)}\n`;
            details += `Status: ${prod.status}\n`;
            details += `Produced By: ${prod.produced_by_name}\n`;
            if (prod.notes) details += `Notes: ${prod.notes}\n`;
            details += `\nRaw Materials Consumed:\n`;
            prod.materials.forEach(mat => {
                details += `- ${mat.raw_material_name}: ${mat.total_consumed} ${mat.unit_of_measure}\n`;
            });
            messageModal.info(details.replace(/\n/g, '<br>'), 'Production Details');
        }
    } catch (error) {
        messageModal.error('Error viewing production: ' + error.message, 'View Failed');
    }
};

window.deleteProduction = async function (id) {
    const messageModal = (await import('./message-modal.js')).default;

    messageModal.confirm(
        'Delete Production',
        'Delete this production record? This can only delete pending records.',
        async () => {
            try {
                const response = await api.delete(`/production/${id}`);

                if (response.success) {
                    messageModal.success('Production record deleted', 'Deleted');
                    await loadProduction();
                }
            } catch (error) {
                messageModal.error('Failed to delete: ' + error.message, 'Delete Failed');
            }
        }
    );
};

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}


