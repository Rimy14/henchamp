import auth from './auth.js';
import api from './api.js';
import Pagination from './pagination.js';
import messageModal from './message-modal.js';

let pos = [];
let pagination = null;
let currentUser = null;
let activePOId = null;

export default async function init() {
    pos = [];
    pagination = null;
    currentUser = null;
    activePOId = null;

    if (!(await auth.requireAuth())) {
        return;
    }

    currentUser = auth.getCurrentUser();

    pagination = new Pagination('poPaymentsPaginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            loadPOs(page);
        }
    });

    await loadPOs(1);

    // Event listeners
    const paymentStatusFilter = document.getElementById('paymentStatusFilter');
    if (paymentStatusFilter) paymentStatusFilter.addEventListener('change', () => loadPOs(1));

    const poSearchInput = document.getElementById('poSearchInput');
    if (poSearchInput) {
        let timeout = null;
        poSearchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => loadPOs(1), 300);
        });
    }

    const poPaymentForm = document.getElementById('poPaymentForm');
    if (poPaymentForm) poPaymentForm.addEventListener('submit', handlePaymentSubmit);
}

async function loadPOs(page = 1) {
    try {
        const tbody = document.getElementById('poPaymentsTableBodyMain');
        if (!tbody) return;

        renderSkeleton();

        const paymentStatus = document.getElementById('paymentStatusFilter').value;
        const search = document.getElementById('poSearchInput').value;
        const { limit } = pagination ? pagination.getState() : { limit: 10 };

        const params = {
            page: page,
            limit: limit,
            payment_view: 'true'
        };

        if (paymentStatus) {
            params.payment_status = paymentStatus;
        }

        if (search) {
            params.search = search;
        }

        const queryString = new URLSearchParams(params).toString();
        const response = await api.get(`/purchase-orders?${queryString}`);

        if (response.success) {
            pos = response.data;
            renderPOs(pos);

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
        console.error('Error loading POs:', error);
        const tbody = document.getElementById('poPaymentsTableBodyMain');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 2rem; color: var(--danger);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        Failed to load purchase orders: ${error.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderSkeleton() {
    const tableBody = document.getElementById('poPaymentsTableBodyMain');
    if (!tableBody) return;

    const skeletons = Array(10).fill(0).map(() => `
        <tr class="skeleton-row">
            <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 120px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80px; height: 32px; border-radius: 4px;"></div></td>
        </tr>
    `).join('');

    tableBody.innerHTML = skeletons;
}

function renderPOs(posToShow) {
    const tbody = document.getElementById('poPaymentsTableBodyMain');
    if (!tbody) return;

    if (posToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No purchase orders found</td></tr>';
        return;
    }

    tbody.innerHTML = posToShow.map(po => {
        const poStatusClass = {
            'Draft': 'secondary',
            'Pending': 'warning',
            'Approved': 'info',
            'Received': 'success',
            'Cancelled': 'danger',
            'Rejected': 'danger'
        }[po.status] || 'secondary';

        const paymentStatusClass = {
            'unpaid': 'danger',
            'partial': 'warning',
            'paid': 'success'
        }[po.payment_status || 'unpaid'] || 'danger';

        const paymentStatusText = {
            'unpaid': 'Unpaid',
            'partial': 'Partially Paid',
            'paid': 'Paid'
        }[po.payment_status || 'unpaid'] || 'Unpaid';

        const outstanding = parseFloat(po.total_amount) - parseFloat(po.paid_amount);

        // Hide payment button if payment status is "paid"
        const showPayButton = po.payment_status !== 'paid' && outstanding > 0.01;
        const payButtonHTML = showPayButton 
            ? `<button class="btn btn-sm btn-success" onclick="window.showPaymentsModal(${po.id})">💳 Record Payment</button>`
            : `<span style="color: var(--success); font-size: 0.85rem; font-weight: 500;"><i class="fas fa-check-circle"></i> Settled</span>`;

        return `
            <tr>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <strong>${po.po_number || 'N/A'}</strong>
                        <span class="badge badge-${poStatusClass}" style="width: fit-content; font-size: 0.7rem; padding: 1px 6px;">${po.status}</span>
                    </div>
                </td>
                <td>${po.supplier_name}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 500;">Due: ${po.due_date ? formatDate(po.due_date) : 'N/A'}</span>
                        <span style="font-size: 0.75rem; color: var(--gray-500);">Ordered: ${formatDate(po.order_date)}</span>
                    </div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-weight: 500;">Total: KSh ${parseFloat(po.total_amount || 0).toFixed(2)}</span>
                        <span style="font-size: 0.75rem; color: var(--gray-500);">Paid: KSh ${parseFloat(po.paid_amount || 0).toFixed(2)}</span>
                    </div>
                </td>
                <td><strong style="color: ${outstanding > 0.01 ? 'var(--danger)' : 'var(--gray-600)'}">KSh ${Math.max(0, outstanding).toFixed(2)}</strong></td>
                <td><span class="badge badge-${paymentStatusClass}">${paymentStatusText}</span></td>
                <td>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        ${payButtonHTML}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.showPaymentsModal = async function (id) {
    activePOId = id;
    try {
        const response = await api.purchaseOrders.getById(id);
        if (response.success) {
            const po = response.data;
            const outstanding = parseFloat(po.total_amount) - parseFloat(po.paid_amount);

            // Populating headers
            document.getElementById('payPOModalNumber').textContent = po.po_number || 'N/A';
            document.getElementById('payPOModalSupplier').textContent = po.supplier_name || 'N/A';
            document.getElementById('payPOModalTotal').textContent = `KSh ${parseFloat(po.total_amount).toFixed(2)}`;
            document.getElementById('payPOModalPaid').textContent = `KSh ${parseFloat(po.paid_amount).toFixed(2)}`;
            document.getElementById('payPOModalOutstanding').textContent = `KSh ${Math.max(0, outstanding).toFixed(2)}`;

            // Populate form default amount
            const amountInput = document.getElementById('payAmount');
            if (amountInput) {
                amountInput.value = outstanding > 0 ? outstanding.toFixed(2) : '';
                amountInput.max = outstanding.toFixed(2);
            }

            // Set today's date as default payment date
            const dateInput = document.getElementById('payDate');
            if (dateInput) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }

            // Reset form fields
            document.getElementById('payReference').value = '';
            document.getElementById('payNotes').value = '';
            document.getElementById('payMethod').value = 'Bank Transfer';

            // Show/hide payment form if PO is fully paid
            const formContainer = document.getElementById('newPaymentFormContainer');
            if (formContainer) {
                if (outstanding <= 0.01) {
                    formContainer.style.display = 'none';
                } else {
                    formContainer.style.display = 'block';
                }
            }

            // Render payments list
            renderPOPaymentsList(po.payments || []);

            // Show the modal
            document.getElementById('poPaymentsModal').style.display = 'flex';
        }
    } catch (error) {
        messageModal.error('Failed to load PO details: ' + error.message, 'Error');
    }
};

window.hidePaymentsModal = function () {
    document.getElementById('poPaymentsModal').style.display = 'none';
    activePOId = null;
};

function renderPOPaymentsList(payments) {
    const tbody = document.getElementById('poPaymentsTableBody');
    if (!tbody) return;

    if (payments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--gray-500);">
                    No payments recorded yet
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = payments.map(payment => {
        const isCancelled = payment.is_cancelled == 1;
        const rowStyle = isCancelled ? 'style="text-decoration: line-through; color: #94a3b8; background-color: #f8fafc;"' : '';
        const statusBadge = isCancelled 
            ? `<span class="badge badge-danger" title="Cancelled by ${payment.cancelled_by_name || 'Admin'}">Cancelled</span>`
            : `<span class="badge badge-success">Active</span>`;

        const canCancel = !isCancelled && currentUser && (currentUser.role === 'Admin' || (currentUser.permissions && (currentUser.permissions.includes('po:approve') || currentUser.permissions.includes('po:*'))));
        const actionBtn = canCancel 
            ? `<button class="btn btn-sm btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="window.cancelPOPaymentFromManageModal(${payment.po_id}, ${payment.id}, ${payment.amount})">Cancel</button>`
            : (isCancelled ? `<span style="font-size:0.75rem; color:#94a3b8;">${payment.cancel_reason || 'Cancelled'}</span>` : '-');

        return `
            <tr ${rowStyle}>
                <td>${formatDate(payment.paid_date)}</td>
                <td>${payment.payment_method}</td>
                <td>${payment.reference_number || '-'}</td>
                <td><strong>KSh ${parseFloat(payment.amount).toFixed(2)}</strong></td>
                <td>${payment.created_by_name || 'System'}</td>
                <td>${statusBadge}</td>
                <td>${actionBtn}</td>
            </tr>
        `;
    }).join('');
}

window.cancelPOPaymentFromManageModal = async function (poId, paymentId, amount) {
    const adminPasswordModal = (await import('./admin-password-modal.js')).default;
    const toast = (await import('./toast.js')).default;
    const loadingScreen = (await import('./loading-screen.js')).default;

    const password = await adminPasswordModal.show(
        'Cancel Payment Authorization',
        `Enter admin password to cancel this payment of KSh ${parseFloat(amount).toFixed(2)}.`
    );

    if (!password) return;

    loadingScreen.show('Validating password & cancelling payment...');
    try {
        const response = await api.request(`/purchase-orders/${poId}/payments/${paymentId}/cancel`, {
            method: 'PATCH',
            body: { password, reason: 'Cancelled from PO Payments Page' }
        });

        if (response.success) {
            toast.success('Payment cancelled successfully!');
            await window.showPaymentsModal(poId);
            await loadPOs();
        } else {
            messageModal.error(response.message || 'Failed to cancel payment', 'Cancellation Failed');
        }
    } catch (error) {
        console.error('Error cancelling payment:', error);
        messageModal.error(error.message || 'Failed to cancel payment', 'Error');
    } finally {
        loadingScreen.hide();
    }
};


async function handlePaymentSubmit(e) {
    e.preventDefault();

    if (!activePOId) {
        messageModal.error('No active purchase order selected', 'Error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const paymentData = {
        paid_date: document.getElementById('payDate').value,
        payment_method: document.getElementById('payMethod').value,
        amount: parseFloat(document.getElementById('payAmount').value),
        reference_number: document.getElementById('payReference').value || null,
        notes: document.getElementById('payNotes').value || null
    };

    try {
        const response = await api.purchaseOrders.addPayment(activePOId, paymentData);
        if (response.success) {
            messageModal.success('Payment recorded successfully!', 'Success');
            window.hidePaymentsModal();
            await loadPOs();
        } else {
            messageModal.error(response.message || 'Failed to record payment', 'Error');
        }
    } catch (error) {
        messageModal.error('Failed to record payment: ' + error.message, 'Error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const poPaymentsModal = document.getElementById('poPaymentsModal');
    if (e.target === poPaymentsModal) {
        hidePaymentsModal();
    }
});
