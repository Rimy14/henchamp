/**
 * Invoice Management functionality
 */

import auth from './auth.js';
import api from './api.js';
import './modal-utils.js';
import { TablePagination } from './lazy-loader.js';

// State
let allInvoices = []; // Kept for consistency, but now represents current page data
let currentInvoice = null;
let tablePagination = null;
let searchTimeout = null;

// Export init function for Router
export default async function init() {
    // Reset state
    allInvoices = [];
    currentInvoice = null;
    tablePagination = null;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = null;

    // Check authentication
    if (!(await auth.requireAuth())) {
        return;
    }

    // Setup pagination
    tablePagination = new TablePagination({
        currentPage: 1,
        pageSize: 10,
        onChange: () => loadInvoices()
    });
    window.tablePagination = tablePagination;

    // Filters
    const applyBtn = document.getElementById('applyFilters');
    if (applyBtn) applyBtn.addEventListener('click', () => loadInvoices(true));

    const resetBtn = document.getElementById('resetFilters');
    if (resetBtn) resetBtn.addEventListener('click', resetFilters);

    // Search with debounce
    const searchInput = document.getElementById('searchInvoice');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => loadInvoices(true), 500);
        });
    }

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.addEventListener('change', () => loadInvoices(true));

    const fromDate = document.getElementById('fromDate');
    if (fromDate) fromDate.addEventListener('change', () => loadInvoices(true));

    const toDate = document.getElementById('toDate');
    if (toDate) toDate.addEventListener('change', () => loadInvoices(true));

    // Modal
    const closeBtn = document.getElementById('closeModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const closeCancelBtn = document.getElementById('closeCancelModal');
    if (closeCancelBtn) closeCancelBtn.addEventListener('click', closeCancelReasonModal);

    window.onclick = (e) => {
        const modal = document.getElementById('invoiceModal');
        const cancelModal = document.getElementById('cancelInvoiceModal');
        if (e.target === modal) {
            closeModal();
        }
        if (e.target === cancelModal) {
            closeCancelReasonModal();
        }
    };

    // Return Checkbox Listener
    const returnCheckbox = document.getElementById('cancelReturnCheckbox');
    if (returnCheckbox) {
        returnCheckbox.addEventListener('change', (e) => {
            const reasonInput = document.getElementById('cancelReason');
            if (e.target.checked) {
                reasonInput.value = 'Return';
                // Trigger input event to clear validation errors if any
                reasonInput.dispatchEvent(new Event('input'));
            } else {
                if (reasonInput.value === 'Return') {
                    reasonInput.value = '';
                }
            }
        });
    }

    // Load invoices
    await loadInvoices();
}

async function loadInvoices(resetPage = false) {
    try {
        if (resetPage) {
            tablePagination.currentPage = 1;
        }

        // Show skeleton loading
        renderInvoicesSkeleton();

        const statusFilter = document.getElementById('statusFilter').value;
        const searchTerm = document.getElementById('searchInvoice').value;
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;

        const pageInfo = tablePagination.getPageInfo();

        const response = await api.sales.getAll({
            status: statusFilter,
            search: searchTerm,
            startDate: fromDate,
            endDate: toDate,
            page: pageInfo.currentPage,
            limit: pageInfo.pageSize
        });

        if (response.success) {
            allInvoices = response.data;

            // Update pagination with total count
            if (response.pagination) {
                tablePagination.setTotalItems(response.pagination.total);
            }

            displayInvoices(allInvoices);
            renderPagination();
            updateTableHeaders();
        }
    } catch (error) {
        console.error('Error loading invoices:', error);
        // alert('Failed to load invoices: ' + error.message);
        const tableBody = document.getElementById('invoicesTable');
        const colspan = document.getElementById('statusFilter').value === 'pending' ? 8 : 7;
        tableBody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="text-center text-danger">
                    <i class="fas fa-exclamation-circle"></i> Failed to load invoices: ${error.message}
                </td>
            </tr>
        `;
    }
}

function renderPagination() {
    const paginationContainer = document.getElementById('paginationContainer');
    if (!paginationContainer) {
        // Create pagination container if it doesn't exist
        const tableContainer = document.querySelector('.table-container');
        const container = document.createElement('div');
        container.id = 'paginationContainer';
        tableContainer.parentNode.insertBefore(container, tableContainer.nextSibling);
    }
    tablePagination.render(document.getElementById('paginationContainer'));
}

// Update table header visibility based on status filter
function updateTableHeaders() {
    const statusFilter = document.getElementById('statusFilter').value;
    const daysPassedHeader = document.getElementById('daysPassedHeader');

    if (daysPassedHeader) {
        // Show Days Passed column only when filtering pending invoices
        if (statusFilter === 'pending') {
            daysPassedHeader.style.display = '';
        } else {
            daysPassedHeader.style.display = 'none';
        }
    }
}

function renderInvoicesSkeleton() {
    const tableBody = document.getElementById('invoicesTable');
    if (!tableBody) return;

    const statusFilter = document.getElementById('statusFilter').value;
    const showDaysPassed = statusFilter === 'pending';
    const rowCount = 10;
    const skeletons = [];

    for (let i = 0; i < rowCount; i++) {
        skeletons.push(`
            <tr class="skeleton-row">
                <td><div class="skeleton skeleton-text" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                ${showDaysPassed ? '<td><div class="skeleton skeleton-text" style="width: 120px;"></div></td>' : ''}
                <td><div class="skeleton skeleton-text" style="width: 150px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 80px; border-radius: 12px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
            </tr>
        `);
    }

    tableBody.innerHTML = skeletons.join('');
}

function displayInvoices(invoices) {
    const tableBody = document.getElementById('invoicesTable');
    const statusFilter = document.getElementById('statusFilter').value;
    const showDaysPassed = statusFilter === 'pending';

    if (invoices.length === 0) {
        const colspan = showDaysPassed ? 8 : 7;
        tableBody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="text-center text-muted">No invoices found</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = invoices.map(invoice => {
        // Calculate days passed from sale_date
        const saleDate = new Date(invoice.sale_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time for accurate day calculation
        const saleDateOnly = new Date(saleDate);
        saleDateOnly.setHours(0, 0, 0, 0);

        const diffTime = today - saleDateOnly;
        const daysPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const creditPeriod = parseInt(invoice.credit_period) || 30;
        const daysRemaining = creditPeriod - daysPassed;

        let statusDisplay = '';
        let badgeColor = 'info';

        if (showDaysPassed) {
            if (daysRemaining < 0) {
                const overdueDays = Math.abs(daysRemaining);
                statusDisplay = `<td style="color: var(--danger); font-weight: bold;">OVERDUE ${overdueDays} day${overdueDays !== 1 ? 's' : ''}</td>`;
            } else if (daysRemaining === 0) {
                statusDisplay = `<td style="color: var(--warning); font-weight: bold;">DUE TODAY</td>`;
            } else {
                statusDisplay = `<td>Due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</td>`;
            }
        }

        return `
            <tr>
                <td><strong>${invoice.invoice_number}</strong></td>
                <td>${formatDate(invoice.sale_date)}</td>
                ${statusDisplay}
                <td>${invoice.customer_name || 'Walk-in'}</td>
                <td>KSh ${parseFloat(invoice.total_amount).toFixed(2)}</td>
                <td>
                    <span class="badge badge-${invoice.status || 'completed'}">
                        ${(invoice.status || 'completed').toUpperCase()}
                    </span>
                </td>
                <td>${invoice.cashier_name}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewInvoice(${invoice.id})">
                        View
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// applyFilters is no longer needed as independent function, replaced by direct loadInvoices call
function resetFilters() {
    document.getElementById('searchInvoice').value = '';
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    document.getElementById('statusFilter').value = '';
    loadInvoices(true);
}

async function viewInvoice(invoiceId) {
    try {
        const response = await api.sales.getById(invoiceId);

        if (response.success) {
            currentInvoice = response.data;
            displayInvoiceDetails(currentInvoice);
            openModal();
        }
    } catch (error) {
        console.error('Error loading invoice details:', error);
        alert('Failed to load invoice details: ' + error.message);
    }
}

function displayInvoiceDetails(invoice) {
    // ── Header ──
    document.getElementById('modalInvoiceNumber').textContent = invoice.invoice_number;

    // Add a copy button next to the invoice number
    const headerContainer = document.getElementById('modalInvoiceNumber').parentNode;
    if (headerContainer && !document.getElementById('copyInvBtn')) {
        const copyBtn = document.createElement('button');
        copyBtn.id = 'copyInvBtn';
        copyBtn.className = 'btn-icon';
        copyBtn.title = 'Copy invoice number';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(invoice.invoice_number).then(() => {
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 1500);
            });
        };
        headerContainer.appendChild(copyBtn);
    }

    // Status badge
    const statusEl = document.getElementById('invStatusBadge');
    if (statusEl) {
        const s = (invoice.status || 'completed').toLowerCase();
        statusEl.textContent = s.toUpperCase();
        statusEl.className = `inv-status-badge status-${s}`;
    }

    // ── Compact Info Summary ──
    const detailsContainer = document.getElementById('invoiceDetails');
    const paymentSummary = invoice.payments && invoice.payments.length > 0
        ? invoice.payments.map(p => p.payment_method).join(', ')
        : invoice.payment_method || '—';

    const customerInfo = invoice.customer_name || 'Walk-in Customer';
    const phoneInfo = invoice.customer_phone ? ` | ${invoice.customer_phone}` : '';

    detailsContainer.innerHTML = `
        <div class="inv-summary-line">
            <span><i class="fas fa-calendar-alt"></i> ${formatDate(invoice.sale_date)}</span>
            <span><i class="fas fa-user-tie"></i> ${invoice.cashier_name || '—'}</span>
            <span><i class="fas fa-credit-card"></i> ${paymentSummary}</span>
        </div>
        <div class="inv-summary-line">
            <i class="fas fa-user"></i> ${customerInfo}${phoneInfo}
        </div>
    `;

    // ── Line Items ──
    const itemsTable = document.getElementById('modalItemsTable');
    itemsTable.innerHTML = invoice.items.map((item) => {
        const unitPrice = parseFloat(item.unit_price) || 0;
        const totalPrice = parseFloat(item.total_price) || 0;
        const quantity = parseFloat(item.quantity) || 0;
        const effectiveUnitPrice = quantity > 0 ? (totalPrice / quantity) : 0;
        const discountPct = unitPrice > 0 ? ((unitPrice - effectiveUnitPrice) / unitPrice * 100) : 0;
        const hasDiscount = discountPct > 0.1;

        return `
        <tr>
            <td>
                <div class="inv-item-name">${item.item_name || item.product_name || item.name || '—'}</div>
            </td>
            <td class="text-center">${quantity}</td>
            <td class="text-right">
                ${hasDiscount
                ? `<span class="original-price">KSh ${unitPrice.toFixed(2)}</span> <span class="effective-price">KSh ${effectiveUnitPrice.toFixed(2)}</span>`
                : `<span>KSh ${effectiveUnitPrice.toFixed(2)}</span>`
            }
            </td>
            <td class="text-right">
                ${hasDiscount ? `<span class="discount-badge">-${discountPct.toFixed(0)}%</span>` : ''}
            </td>
            <td class="text-right" style="font-weight:700; color: var(--gray-800);">KSh ${totalPrice.toFixed(2)}</td>
        </tr>`;
    }).join('');

    // ── Totals ──
    const totalItemDiscounts = invoice.items.reduce((sum, item) => sum + (parseFloat(item.discount_amount) || 0), 0);
    const rawSubtotal = parseFloat(invoice.subtotal) || 0;
    const rawSaleDiscount = parseFloat(invoice.discount_amount) || 0;
    const displaySubtotal = rawSubtotal + totalItemDiscounts;
    const displayDiscount = rawSaleDiscount + totalItemDiscounts;
    const taxAmount = parseFloat(invoice.tax_amount) || 0;
    const totalAmount = parseFloat(invoice.total_amount) || 0;

    const totalsContainer = document.getElementById('modalTotals');
    totalsContainer.innerHTML = `
        <div class="inv-total-row">
            <span>Subtotal</span>
            <span>KSh ${displaySubtotal.toFixed(2)}</span>
        </div>
        ${displayDiscount > 0 ? `
        <div class="inv-total-row discount">
            <span><i class="fas fa-tag" style="margin-right:0.35rem;"></i>Discount</span>
            <span>-KSh ${displayDiscount.toFixed(2)}</span>
        </div>` : ''}
        ${taxAmount > 0 ? `
        <div class="inv-total-row">
            <span>Tax (${invoice.tax_percentage || 0}%)</span>
            <span>KSh ${taxAmount.toFixed(2)}</span>
        </div>` : ''}
        <div class="inv-total-row grand">
            <span>TOTAL</span>
            <span>KSh ${totalAmount.toFixed(2)}</span>
        </div>
    `;

    // ── Action Buttons ──
    const actionsContainer = document.getElementById('modalActions');
    const isCancelled = invoice.status === 'cancelled';
    const isPending = invoice.status === 'pending';

    if (isCancelled) {
        actionsContainer.innerHTML = `
            <div class="inv-cancelled-notice">
                <i class="fas fa-ban"></i>
                This invoice has been <strong>voided</strong>.<br>Stock has been restored.
            </div>
            <button class="btn btn-secondary" onclick="closeModal()">
                <i class="fas fa-times"></i> Close
            </button>
        `;
    } else if (isPending) {
        const payments = invoice.payments || [];
        const totalPaid = payments.reduce((sum, p) => {
            if ((p.payment_method && p.payment_method.toUpperCase() === 'CREDIT') || p.amount <= 0) return sum;
            return sum + parseFloat(p.amount);
        }, 0);
        const outstanding = totalAmount - totalPaid;

        actionsContainer.innerHTML = `
            <div class="inv-pending-alert">
                <strong><i class="fas fa-clock" style="margin-right:0.4rem;"></i>Payment Pending</strong>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                    <span>Invoice Total</span><strong>KSh ${totalAmount.toFixed(2)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                    <span>Amount Paid</span><strong>KSh ${totalPaid.toFixed(2)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;border-top:1px dashed #f59e0b;padding-top:0.5rem;margin-top:0.25rem;">
                    <span>Outstanding</span><span class="inv-pending-outstanding">KSh ${outstanding.toFixed(2)}</span>
                </div>
            </div>
            <div class="action-group">
                <button class="btn btn-success btn-lg" onclick="receivePayment(${invoice.id}, ${outstanding})">
                    <i class="fas fa-money-bill-wave"></i> Receive KSh ${outstanding.toFixed(2)}
                </button>
            </div>
            <div class="action-group">
                <button class="btn btn-primary" onclick="reprintInvoice(${invoice.id})">
                    <i class="fas fa-print"></i> Print Invoice
                </button>
                <button class="btn btn-outline-danger" onclick="cancelInvoice(${invoice.id})">
                    <i class="fas fa-ban"></i> Void Invoice
                </button>
            </div>
            <button class="btn btn-secondary" onclick="closeModal()">
                <i class="fas fa-times"></i> Close
            </button>
        `;
    } else {
        actionsContainer.innerHTML = `
            <div class="action-group">
                <button class="btn btn-primary" onclick="reprintInvoice(${invoice.id})">
                    <i class="fas fa-print"></i> Print Invoice
                </button>
                <button class="btn btn-outline-danger" onclick="cancelInvoice(${invoice.id})">
                    <i class="fas fa-ban"></i> Void Invoice
                </button>
            </div>
            <button class="btn btn-secondary" onclick="closeModal()">
                <i class="fas fa-times"></i> Close
            </button>
        `;
    }
}

// State variable for current invoice being cancelled
let invoiceToCancel = null;


function cancelInvoice(invoiceId) {
    // Store the invoice ID and show the reason modal
    invoiceToCancel = invoiceId;
    showCancelReasonModal();
}

function showCancelReasonModal() {
    const modal = document.getElementById('cancelInvoiceModal');
    const textarea = document.getElementById('cancelReason');
    const errorDiv = document.getElementById('cancelReasonError');

    // Reset form
    textarea.value = '';
    errorDiv.style.display = 'none';

    // Show modal
    modal.classList.add('active');

    // Reset checkbox
    const returnCheckbox = document.getElementById('cancelReturnCheckbox');
    if (returnCheckbox) returnCheckbox.checked = false;
}

function closeCancelReasonModal() {
    const modal = document.getElementById('cancelInvoiceModal');
    modal.classList.remove('active');
    invoiceToCancel = null;
}

function validateCancelReason() {
    const textarea = document.getElementById('cancelReason');
    const errorDiv = document.getElementById('cancelReasonError');
    const errorText = document.getElementById('cancelReasonErrorText');
    const reason = textarea.value.trim();

    if (!reason) {
        errorDiv.style.display = 'block';
        errorText.textContent = 'Cancellation reason is required';
        return false;
    }

    if (reason.length < 4) {
        errorDiv.style.display = 'block';
        errorText.textContent = 'Please provide a reason (minimum 4 characters)';
        return false;
    }

    errorDiv.style.display = 'none';
    return true;
}

async function confirmCancellation() {
    // Validate reason
    if (!validateCancelReason()) {
        return;
    }

    const reason = document.getElementById('cancelReason').value.trim();
    const invoiceId = invoiceToCancel;

    // Close the reason modal
    closeCancelReasonModal();

    // Import dependencies
    const toast = (await import('./toast.js')).default;
    const loadingScreen = (await import('./loading-screen.js')).default;
    const adminPasswordModal = (await import('./admin-password-modal.js')).default;

    // Show admin password modal
    const password = await adminPasswordModal.show(
        'Void Invoice Authorization',
        'This action will cancel the invoice and restore stock. Enter admin password to proceed.'
    );

    if (!password) {
        return; // User cancelled
    }

    // Show loading
    loadingScreen.show('Validating password...');

    try {
        // Validate admin password
        const passwordResponse = await fetch('/api/void/validate-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        const passwordData = await passwordResponse.json();

        if (!passwordData.success) {
            await loadingScreen.hide();
            window.showModal('Invalid admin password', 'Authentication Failed', 'error');
            return;
        }

        // Password valid, proceed with cancellation
        loadingScreen.show('Cancelling invoice...');

        const response = await api.sales.cancel(invoiceId, reason);

        if (response.success) {
            window.messageModal.success(
                'Invoice cancelled successfully! Stock has been restored.',
                'Cancellation Complete'
            );
            closeModal();
            await loadInvoices();
        }
    } catch (error) {
        console.error('Error cancelling invoice:', error);
        toast.error('Failed to cancel invoice: ' + error.message);
    } finally {
        await loadingScreen.hide();
    }
}

// Reprint invoice with admin password protection
async function reprintInvoice(invoiceId) {
    try {
        // Import dependencies
        const toast = (await import('./toast.js')).default;
        const loadingScreen = (await import('./loading-screen.js')).default;
        const adminPasswordModal = (await import('./admin-password-modal.js')).default;

        // Show admin password modal
        const password = await adminPasswordModal.show(
            'Reprint Authorization',
            'Enter admin password to reprint this invoice.'
        );

        if (!password) {
            return; // User cancelled
        }

        // Show loading
        loadingScreen.show('Validating password...');

        // Validate admin password
        const passwordResponse = await fetch('/api/void/validate-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ password })
        });

        const passwordData = await passwordResponse.json();

        if (!passwordData.success) {
            await loadingScreen.hide();
            window.showModal('Invalid admin password', 'Authentication Failed', 'error');
            return;
        }

        // Password valid, proceed with reprint
        loadingScreen.show('Generating receipt...');

        // Get invoice details (currentInvoice should be already loaded)
        if (!currentInvoice) {
            await loadingScreen.hide();
            toast.error('Invoice data not available');
            return;
        }

        // Open A4 invoice print dialog directly using hidden iframe without new tab
        const iframeId = 'invoice-reprint-frame';
        let iframe = document.getElementById(iframeId);

        if (iframe) {
            document.body.removeChild(iframe);
        }

        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        // Hide iframe but keep it part of DOM for chrome to print
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';

        iframe.src = `/pages/print-invoice.html?id=${currentInvoice.id}`;
        document.body.appendChild(iframe);

        await loadingScreen.hide();
        toast.success('Printing invoice...');

    } catch (error) {
        console.error('Error reprinting invoice:', error);
        const toast = (await import('./toast.js')).default;
        const loadingScreen = (await import('./loading-screen.js')).default;
        toast.error('Failed to reprint invoice: ' + error.message);
        await loadingScreen.hide();
    }
}

// Generate thermal receipt for invoice
function generateInvoiceReceipt(invoice, isReprint = false) {
    // Get or create receipt preview container
    let receiptModal = document.getElementById('receiptPreviewModal');

    if (!receiptModal) {
        // Dynamically load the receipt modal if not present
        console.error('Receipt modal not found. Creating temporary container.');
        const container = document.createElement('div');
        container.id = 'invoiceReceiptContainer';
        container.innerHTML = '<div id="receipt-preview"></div>';
        document.body.appendChild(container);
    }

    const container = document.getElementById('receipt-preview');
    if (!container) {
        console.error('Receipt preview container not found');
        return;
    }

    const dateStr = new Date(invoice.sale_date).toLocaleString();

    console.log('Generating receipt for items:', invoice.items);

    // Build Items HTML
    const itemsHtml = invoice.items.map(item => `
        <tr>
            <td colspan="2">
                <span class="receipt-item-name">${item.item_name || item.product_name || item.name || 'Unknown Item'}</span>
                <span class="receipt-item-meta">${item.quantity} x KSh ${parseFloat(item.unit_price).toFixed(2)}</span>
            </td>
            <td class="text-right">
                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <span>Rs</span>
                    <span>${parseFloat(item.total_price).toFixed(2)}</span>
                </div>
            </td>
        </tr>
    `).join('');

    // Build Payments HTML
    const paymentsHtml = invoice.payments && invoice.payments.length > 0
        ? invoice.payments.map(p => `
            <div class="receipt-row">
                <span>${p.payment_method}</span>
                <span>KSh ${parseFloat(p.amount).toFixed(2)}</span>
            </div>
        `).join('')
        : `<div class="receipt-row">
            <span>${invoice.payment_method}</span>
            <span>KSh ${parseFloat(invoice.total_amount).toFixed(2)}</span>
        </div>`;

    // Calculate total item level discounts
    const totalItemDiscounts = invoice.items.reduce((sum, item) => {
        return sum + (parseFloat(item.discount_amount) || 0);
    }, 0);

    // Prepare display values
    const rawSubtotal = parseFloat(invoice.subtotal) || 0;
    const rawSaleDiscount = parseFloat(invoice.discount_amount) || 0;

    // Backend subtotal is net of item discounts. Add them back to get Gross Subtotal.
    const displaySubtotal = rawSubtotal + totalItemDiscounts;
    const displayDiscount = rawSaleDiscount + totalItemDiscounts;
    const logoUrl = `${window.location.origin}/img/logo-emerald.png`;


    container.innerHTML = `
        ${isReprint ? '<div class="receipt-copy-header" style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 10px; border: 2px solid #000; padding: 5px;">INVOICE COPY</div>' : ''}
        <div class="receipt-header">
            <img src="${logoUrl}" class="receipt-logo" style="display: block; margin: 0 auto 8px auto; max-width: 60mm; max-height: 25mm; object-fit: contain;">
            <h2>PRINT HUB (PRIVATE) LIMITED</h2>
            <p style="margin-top: 4px;">P V-00276108</p>
            <p>647/2/B Athurugiriya Rd, Pannipitiya</p>
            <p>Tel: 070 607 6076</p>
        </div>
        <div class="receipt-details" style="display: flex; flex-wrap: wrap; justify-content: space-between; font-size: 11px;">
            <span style="width: 50%;">Inv: ${invoice.invoice_number}</span>
            <span style="width: 50%; text-align: right;">${dateStr}</span>
            <span style="width: 100%; margin-top: 2px;">Cashier: ${invoice.cashier_name || 'N/A'}</span>
        </div>
        <table class="receipt-table">
            <colgroup>
                <col style="width: 62%">
                <col style="width: 0%">
                <col style="width: 38%">
            </colgroup>
            <thead>
                <tr>
                    <th colspan="2">Item</th>
                    <th class="text-right" style="text-align:right;">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div class="receipt-totals">
            <div class="receipt-row">
                <span>Subtotal:</span>
                <div style="display: flex; justify-content: space-between; width: 45%;">
                    <span>Rs</span>
                    <span>${displaySubtotal.toFixed(2)}</span>
                </div>
            </div>
            ${displayDiscount > 0 ? `
            <div class="receipt-row">
                <span>Discount:</span>
                <div style="display: flex; justify-content: space-between; width: 45%;">
                    <span>-Rs</span>
                    <span>${displayDiscount.toFixed(2)}</span>
                </div>
            </div>` : ''}
            ${parseFloat(invoice.tax_amount) > 0 ? `
            <div class="receipt-row">
                <span>Tax (${invoice.tax_rate}%):</span>
                <div style="display: flex; justify-content: space-between; width: 45%;">
                    <span>Rs</span>
                    <span>${parseFloat(invoice.tax_amount).toFixed(2)}</span>
                </div>
            </div>` : ''}
            <div class="receipt-row bold">
                <span>TOTAL:</span>
                <div style="display: flex; justify-content: space-between; width: 45%;">
                    <span>Rs</span>
                    <span>${parseFloat(invoice.total_amount).toFixed(2)}</span>
                </div>
            </div>
        </div>
        <div class="receipt-totals" style="border-top:none; padding-top:0;">
            ${paymentsHtml}
        </div>
        <div class="receipt-footer">
            <p>Thank you for your purchase</p>
        </div>
        <div class="receipt-feed" style="height: 5mm;"></div>
    `;

    // Check config to determine print behavior
    (async () => {
        try {
            console.log('🔍 Fetching print config for invoice reprint...');
            const configResponse = await fetch('/api/config/client-config');
            const configData = await configResponse.json();
            console.log('📋 Config response:', configData);
            console.log('🖨️  showPrintPreview:', configData.config?.showPrintPreview);

            if (configData.success && configData.config.showPrintPreview) {
                // Show receipt preview modal
                console.log('✅ Showing print preview modal for invoice');
                receiptModal = document.getElementById('receiptPreviewModal');
                if (receiptModal) {
                    receiptModal.style.display = 'flex';
                    setTimeout(() => receiptModal.classList.add('show'), 10);
                } else {
                    // Fallback: direct print
                    setTimeout(() => window.print(), 300);
                }
            } else {
                // Auto-print directly without showing modal
                console.log('🚀 Auto-printing invoice directly');
                await window.printReceiptNow();
            }
        } catch (error) {
            console.error('Error checking print config for invoice:', error);
            // Default to showing preview on error
            receiptModal = document.getElementById('receiptPreviewModal');
            if (receiptModal) {
                receiptModal.style.display = 'flex';
                setTimeout(() => receiptModal.classList.add('show'), 10);
            } else {
                setTimeout(() => window.print(), 300);
            }
        }
    })();
}

function openModal() {
    document.getElementById('invoiceModal').classList.add('active');
}

function closeModal() {
    document.getElementById('invoiceModal').classList.remove('active');
    currentInvoice = null;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Make functions globally available
window.viewInvoice = viewInvoice;
window.cancelInvoice = cancelInvoice;
window.reprintInvoice = reprintInvoice;
window.closeModal = closeModal;
window.closeCancelReasonModal = closeCancelReasonModal;
window.confirmCancellation = confirmCancellation;
window.receivePayment = receivePayment; // NEW

// Receive payment for pending credit invoice
async function receivePayment(invoiceId, totalAmount) {
    try {
        const toast = (await import('./toast.js')).default;
        const loadingScreen = (await import('./loading-screen.js')).default;

        // Load multi-payment modal if not loaded
        if (!window.showMultiPaymentModal) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/js/multi-payment-modal.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        // Show multi-payment modal
        const payments = await window.showMultiPaymentModal(totalAmount);
        if (!payments || payments.length === 0) {
            return; // User cancelled
        }

        // Show loading
        loadingScreen.show('Processing payment...');

        // Send payments array to backend
        const response = await fetch(`/api/sales/${invoiceId}/payment`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                payments: payments
            })
        });

        const data = await response.json();

        if (!data.success) {
            await loadingScreen.hide();
            toast.error(data.message || 'Failed to process payment');
            return;
        }

        toast.success('Payment received successfully!');

        // Close invoice modal
        closeModal();

        // Reload invoice data
        await loadInvoices();

        // Print receipt for the paid invoice using the same A4 print mechanism as reprintInvoice
        try {
            const iframeId = 'post-payment-print-frame';
            let iframe = document.getElementById(iframeId);
            if (iframe) document.body.removeChild(iframe);

            iframe = document.createElement('iframe');
            iframe.id = iframeId;
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.src = `/pages/print-invoice.html?id=${invoiceId}`;
            document.body.appendChild(iframe);

            toast.success('Printing invoice...');
        } catch (printError) {
            console.error('Error printing receipt after payment:', printError);
        }


        await loadingScreen.hide();
    } catch (error) {
        console.error('Error receiving payment:', error);
        const toast = (await import('./toast.js')).default;
        const loadingScreen = (await import('./loading-screen.js')).default;
        toast.error('Failed to process payment: ' + error.message);
        await loadingScreen.hide();
    }
}

// Helper function to show payment method selection
function showPaymentMethodPrompt() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-container" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Receive Payment</h3>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Payment Method</label>
                        <select id="receivePaymentMethod" class="form-control">
                            <option value="">Select Payment Method</option>
                            <option value="Cash">Cash</option>
                            <option value="Card">Card</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" id="cancelPaymentBtn">Cancel</button>
                    <button class="btn btn-success" id="confirmPaymentBtn">Confirm Payment</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const selectEl = modal.querySelector('#receivePaymentMethod');
        const confirmBtn = modal.querySelector('#confirmPaymentBtn');
        const cancelBtn = modal.querySelector('#cancelPaymentBtn');

        confirmBtn.addEventListener('click', () => {
            const method = selectEl.value;
            if (!method) {
                alert('Please select a payment method');
                return;
            }
            document.body.removeChild(modal);
            resolve(method);
        });

        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(null);
        });

        // Focus on select
        setTimeout(() => selectEl.focus(), 100);
    });
}

