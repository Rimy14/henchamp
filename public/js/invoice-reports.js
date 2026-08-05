import api from './api.js';
import toast from './toast.js';
import messageModal from './message-modal.js';
import loadingScreen from './loading-screen.js';
import Pagination from './pagination.js';

// State
let rawInvoices = [];
let filteredInvoices = [];
let paginationInstance = null;
const ITEMS_PER_PAGE = 15;

// Chart Instances
let trendChartInstance = null;
let paymentChartInstance = null;
let activeModalInvoiceId = null;

/**
 * Initialize the invoice reports page
 */
export default function init() {
    console.log('Initializing Enterprise Invoice Reports...');

    // Set default dates to current month
    applyDatePreset('this_month');

    // Initialize pagination component
    paginationInstance = new Pagination('invoiceReportPagination', {
        itemsPerPage: ITEMS_PER_PAGE,
        onPageChange: (page) => {
            renderInvoiceReport(page);
        }
    });

    // Event listeners
    document.getElementById('quickDatePreset')?.addEventListener('change', (e) => {
        applyDatePreset(e.target.value);
    });

    document.getElementById('generateInvoiceReport')?.addEventListener('click', () => {
        paginationInstance.reset();
        generateInvoiceReport(true);
    });

    document.getElementById('invoiceStatusFilter')?.addEventListener('change', () => {
        applyClientFilters();
    });

    document.getElementById('invoiceSearchInput')?.addEventListener('input', () => {
        applyClientFilters();
    });

    document.getElementById('exportToExcel')?.addEventListener('click', exportToExcel);
    document.getElementById('printReportBtn')?.addEventListener('click', printReportSummary);
    document.getElementById('modalPrintBtn')?.addEventListener('click', () => {
        if (activeModalInvoiceId) {
            window.open(`/pages/print-invoice.html?id=${activeModalInvoiceId}`, '_blank');
        }
    });

    // Auto load current month report on initial open
    generateInvoiceReport();
}

/**
 * Apply quick date preset
 */
function applyDatePreset(preset) {
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (preset) {
        case 'today':
            startDate = new Date(today);
            endDate = new Date(today);
            break;

        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 1);
            endDate = new Date(startDate);
            break;

        case 'this_week': {
            const dayOfWeek = today.getDay(); // 0 is Sunday
            const distanceToMonday = (dayOfWeek + 6) % 7;
            startDate = new Date(today);
            startDate.setDate(today.getDate() - distanceToMonday);
            endDate = new Date(today);
            break;
        }

        case 'this_month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;

        case 'last_month':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;

        case 'this_year':
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
            break;

        case 'custom':
        default:
            return; // keep existing input values
    }

    const formatDateForInput = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startElem = document.getElementById('invoiceStartDate');
    const endElem = document.getElementById('invoiceEndDate');

    if (startElem && endElem) {
        startElem.value = formatDateForInput(startDate);
        endElem.value = formatDateForInput(endDate);
    }
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format currency
 */
function formatCurrency(amount) {
    const val = parseFloat(amount) || 0;
    return `KSh ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Generate invoice report from server
 */
async function generateInvoiceReport(isUserClick = false) {
    const startDate = document.getElementById('invoiceStartDate').value;
    const endDate = document.getElementById('invoiceEndDate').value;

    if (!startDate || !endDate) {
        if (isUserClick) {
            messageModal.warning('Please select both start and end dates', 'Validation Error');
        } else {
            toast.error('Please select both start and end dates');
        }
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        if (isUserClick) {
            messageModal.warning('Start date cannot be after end date', 'Validation Error');
        } else {
            toast.error('Start date cannot be after end date');
        }
        return;
    }

    try {
        loadingScreen.show('Loading invoice analytics...');

        const response = await api.get(`/reports/invoices?start_date=${startDate}&end_date=${endDate}`);

        if (response.success) {
            rawInvoices = response.data || [];
            applyClientFilters();

            if (isUserClick) {
                messageModal.success(`Invoice report data refreshed successfully! Found ${rawInvoices.length} total invoice(s).`, 'Report Refreshed');
            }
        } else {
            if (isUserClick) {
                messageModal.error(response.message || 'Failed to load invoice data', 'Refresh Failed');
            } else {
                toast.error(response.message || 'Failed to load invoice data');
            }
        }
    } catch (error) {
        console.error('Error loading invoice data:', error);
        if (isUserClick) {
            messageModal.error('Error loading invoice data: ' + error.message, 'System Error');
        } else {
            toast.error('Error loading invoice data: ' + error.message);
        }
    } finally {
        loadingScreen.hide();
    }
}

/**
 * Apply client-side filtering (Status & Search query)
 */
function applyClientFilters() {
    const statusFilter = document.getElementById('invoiceStatusFilter')?.value || 'all';
    const searchQuery = (document.getElementById('invoiceSearchInput')?.value || '').toLowerCase().trim();

    filteredInvoices = rawInvoices.filter(inv => {
        // Status filter
        const invStatus = (inv.status || 'completed').toLowerCase();
        if (statusFilter !== 'all') {
            if (statusFilter === 'completed' && invStatus !== 'completed' && invStatus !== 'paid') return false;
            if (statusFilter === 'pending' && invStatus !== 'pending') return false;
            if (statusFilter === 'cancelled' && invStatus !== 'cancelled') return false;
        }

        // Search filter
        if (searchQuery) {
            const invNum = (inv.invoice_number || '').toLowerCase();
            const cashier = (inv.cashier_name || '').toLowerCase();
            const payments = (inv.payment_methods || '').toLowerCase();
            if (!invNum.includes(searchQuery) && !cashier.includes(searchQuery) && !payments.includes(searchQuery)) {
                return false;
            }
        }

        return true;
    });

    // Update KPIs & Charts
    updateKpis(filteredInvoices);
    updateCharts(filteredInvoices);

    // Setup pagination & render table
    paginationInstance.update({
        page: 1,
        totalPages: Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE) || 1,
        totalItems: filteredInvoices.length,
        limit: ITEMS_PER_PAGE
    });

    renderInvoiceReport(1);

    const hasData = filteredInvoices.length > 0;
    document.getElementById('exportToExcel').style.display = hasData ? 'inline-flex' : 'none';
    document.getElementById('printReportBtn').style.display = hasData ? 'inline-flex' : 'none';
    document.getElementById('invoiceKpiSection').style.display = hasData ? 'block' : 'none';
    document.getElementById('invoiceAnalyticsSection').style.display = hasData ? 'block' : 'none';
}

/**
 * Update Executive KPI Cards
 */
function updateKpis(invoices) {
    let totalRevenue = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    invoices.forEach(inv => {
        const amt = parseFloat(inv.total_amount) || 0;
        const disc = parseFloat(inv.discount_amount) || 0;
        const tax = parseFloat(inv.tax_amount) || 0;
        const st = (inv.status || 'completed').toLowerCase();

        if (st !== 'cancelled') {
            totalRevenue += amt;
            totalDiscount += disc;
            totalTax += tax;
            if (st === 'pending') {
                pendingCount++;
            } else {
                completedCount++;
            }
        } else {
            cancelledCount++;
        }
    });

    const totalValidCount = completedCount + pendingCount;
    const avgValue = totalValidCount > 0 ? (totalRevenue / totalValidCount) : 0;

    document.getElementById('kpiTotalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('kpiRevenueSubtext').textContent = `${completedCount + pendingCount} active sales (${cancelledCount} cancelled)`;

    document.getElementById('kpiTotalCount').textContent = invoices.length;
    document.getElementById('kpiCountSubtext').textContent = `${completedCount} Paid | ${pendingCount} Pending | ${cancelledCount} Cancelled`;

    document.getElementById('kpiAvgValue').textContent = formatCurrency(avgValue);

    document.getElementById('kpiTotalDiscounts').textContent = formatCurrency(totalDiscount);
    document.getElementById('kpiTaxSubtext').textContent = `Total Tax: ${formatCurrency(totalTax)}`;
}

/**
 * Update Chart.js Visualizations
 */
function updateCharts(invoices) {
    if (typeof window.Chart === 'undefined') {
        console.warn('Chart.js library is not available');
        return;
    }

    // 1. Prepare Daily Trend Data
    const dailyMap = {};
    invoices.forEach(inv => {
        if ((inv.status || '').toLowerCase() === 'cancelled') return;
        const dateKey = formatDate(inv.sale_date);
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + (parseFloat(inv.total_amount) || 0);
    });

    const sortedDates = Object.keys(dailyMap).reverse();
    const trendValues = sortedDates.map(d => dailyMap[d]);

    const trendCanvas = document.getElementById('invoiceTrendChart');
    if (trendCanvas) {
        if (trendChartInstance) trendChartInstance.destroy();
        trendChartInstance = new window.Chart(trendCanvas, {
            type: 'line',
            data: {
                labels: sortedDates.length > 0 ? sortedDates : ['No Data'],
                datasets: [{
                    label: 'Revenue (Rs)',
                    data: trendValues.length > 0 ? trendValues : [0],
                    borderColor: '#0e4a35',
                    backgroundColor: 'rgba(14, 74, 53, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            callback: (val) => 'KSh ' + val.toLocaleString()
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // 2. Prepare Payment Method Breakdown Data
    const methodMap = {};
    invoices.forEach(inv => {
        if ((inv.status || '').toLowerCase() === 'cancelled') return;
        const methods = (inv.payment_methods || 'Cash').split(',');
        methods.forEach(m => {
            const cleanM = m.trim() || 'Cash';
            methodMap[cleanM] = (methodMap[cleanM] || 0) + (parseFloat(inv.total_amount) / methods.length);
        });
    });

    const paymentLabels = Object.keys(methodMap);
    const paymentValues = Object.values(methodMap);
    const palette = ['#10b981', '#0e4a35', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    const paymentCanvas = document.getElementById('invoicePaymentChart');
    if (paymentCanvas) {
        if (paymentChartInstance) paymentChartInstance.destroy();
        paymentChartInstance = new window.Chart(paymentCanvas, {
            type: 'doughnut',
            data: {
                labels: paymentLabels.length > 0 ? paymentLabels : ['No Data'],
                datasets: [{
                    data: paymentValues.length > 0 ? paymentValues : [1],
                    backgroundColor: paymentLabels.length > 0 ? palette.slice(0, paymentLabels.length) : ['#e5e7eb'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { boxWidth: 12, padding: 15 }
                    }
                },
                cutout: '65%'
            }
        });
    }
}

/**
 * Render invoice report table
 */
function renderInvoiceReport(page = 1) {
    const tableBody = document.getElementById('invoiceReportTable');
    const reportSection = document.getElementById('invoiceReportSection');
    const emptyState = document.getElementById('emptyState');
    const invoiceCount = document.getElementById('invoiceCount');

    if (!filteredInvoices || filteredInvoices.length === 0) {
        reportSection.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    reportSection.style.display = 'block';
    invoiceCount.textContent = `Showing ${filteredInvoices.length} matching invoice${filteredInvoices.length !== 1 ? 's' : ''}`;

    // Slice list for current page view
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const paginatedInvoices = filteredInvoices.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    let pageTotalSum = 0;
    let pageDiscountSum = 0;

    tableBody.innerHTML = paginatedInvoices.map(invoice => {
        const st = (invoice.status || 'completed').toLowerCase();
        let statusBadge = '';

        if (st === 'cancelled') {
            statusBadge = `<span class="badge badge-danger" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-weight: 600; padding: 0.25rem 0.6rem; border-radius: 6px;"><i class="fas fa-ban"></i> CANCELLED</span>`;
        } else if (st === 'pending') {
            statusBadge = `<span class="badge badge-warning" style="background: rgba(245, 158, 11, 0.12); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.2); font-weight: 600; padding: 0.25rem 0.6rem; border-radius: 6px;"><i class="fas fa-clock"></i> PENDING</span>`;
        } else {
            statusBadge = `<span class="badge badge-success" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-weight: 600; padding: 0.25rem 0.6rem; border-radius: 6px;"><i class="fas fa-check-circle"></i> PAID</span>`;
        }

        const totalAmt = parseFloat(invoice.total_amount) || 0;
        const discAmt = parseFloat(invoice.discount_amount) || 0;

        if (st !== 'cancelled') {
            pageTotalSum += totalAmt;
            pageDiscountSum += discAmt;
        }

        const paymentBadges = (invoice.payment_methods || 'Cash').split(',').map(m => `
            <span style="display: inline-block; background: var(--gray-100); color: var(--gray-700); font-size: 0.75rem; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 500; margin: 0.1rem;">
                ${m.trim()}
            </span>
        `).join('');

        return `
            <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.15s ease;">
                <td style="padding: 0.85rem 1rem;">
                    <a href="javascript:void(0)" onclick="window.viewInvoiceDetails(${invoice.id})" style="font-weight: 700; color: var(--primary); text-decoration: none;">
                        <i class="fas fa-hashtag" style="font-size: 0.75rem; opacity: 0.7;"></i> ${invoice.invoice_number || 'N/A'}
                    </a>
                </td>
                <td style="padding: 0.85rem 1rem; color: var(--text-secondary); font-size: 0.875rem;">
                    ${formatDate(invoice.sale_date)}
                </td>
                <td style="padding: 0.85rem 1rem; font-size: 0.875rem;">
                    <i class="fas fa-user-circle" style="color: var(--gray-400); margin-right: 0.3rem;"></i> ${invoice.cashier_name || 'N/A'}
                </td>
                <td style="padding: 0.85rem 1rem;">
                    ${paymentBadges}
                </td>
                <td style="padding: 0.85rem 1rem; color: var(--warning); font-size: 0.875rem; font-weight: 500;">
                    ${discAmt > 0 ? '-' + formatCurrency(discAmt) : 'KSh 0.00'}
                </td>
                <td style="padding: 0.85rem 1rem; font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">
                    ${formatCurrency(totalAmt)}
                </td>
                <td style="padding: 0.85rem 1rem;">
                    ${statusBadge}
                </td>
                <td style="padding: 0.85rem 1rem; text-align: center;">
                    <div style="display: flex; gap: 0.35rem; justify-content: center;">
                        <button class="btn btn-sm btn-secondary" onclick="window.viewInvoiceDetails(${invoice.id})" title="View Details">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <a href="/pages/print-invoice.html?id=${invoice.id}" target="_blank" class="btn btn-sm btn-secondary" title="Print Invoice" style="text-decoration: none;">
                            <i class="fas fa-print"></i>
                        </a>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Update Footer Totals
    document.getElementById('footerPageDiscount').textContent = formatCurrency(pageDiscountSum);
    document.getElementById('footerPageTotal').textContent = formatCurrency(pageTotalSum);
}

/**
 * View invoice details in modal preview
 */
function viewInvoiceDetails(invoiceId) {
    const invoice = rawInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    activeModalInvoiceId = invoice.id;
    const modal = document.getElementById('invoiceDetailsModal');
    const content = document.getElementById('invoiceDetailsContent');

    const totalDiscount = parseFloat(invoice.discount_amount) || 0;
    const st = (invoice.status || 'completed').toLowerCase();

    const statusBadge = st === 'cancelled'
        ? `<span class="badge badge-danger"><i class="fas fa-ban"></i> Cancelled</span>`
        : st === 'pending'
            ? `<span class="badge badge-warning"><i class="fas fa-clock"></i> Pending / Credit</span>`
            : `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Paid</span>`;

    content.innerHTML = `
        <div style="background: var(--surface); padding: 1.25rem; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <div>
                    <h3 style="margin: 0; font-size: 1.3rem; font-weight: 700; color: var(--primary);">
                        Invoice #${invoice.invoice_number}
                    </h3>
                    <div style="color: var(--gray-500); font-size: 0.85rem; margin-top: 0.2rem;">
                        Date: ${formatDate(invoice.sale_date)}
                    </div>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; background: var(--gray-50); padding: 1rem; border-radius: 8px;">
                <div>
                    <span style="font-size: 0.75rem; color: var(--gray-500); text-transform: uppercase; font-weight: 600;">Cashier:</span>
                    <div style="font-weight: 600; color: var(--text-primary); margin-top: 0.15rem;">${invoice.cashier_name || 'N/A'}</div>
                </div>
                <div>
                    <span style="font-size: 0.75rem; color: var(--gray-500); text-transform: uppercase; font-weight: 600;">Payment Method:</span>
                    <div style="font-weight: 600; color: var(--text-primary); margin-top: 0.15rem;">${invoice.payment_methods || 'Cash'}</div>
                </div>
                <div>
                    <span style="font-size: 0.75rem; color: var(--gray-500); text-transform: uppercase; font-weight: 600;">Discounts Applied:</span>
                    <div style="font-weight: 600; color: var(--warning); margin-top: 0.15rem;">${formatCurrency(totalDiscount)}</div>
                </div>
                <div>
                    <span style="font-size: 0.75rem; color: var(--gray-500); text-transform: uppercase; font-weight: 600;">Grand Total:</span>
                    <div style="font-weight: 700; color: var(--primary); font-size: 1.1rem; margin-top: 0.15rem;">${formatCurrency(invoice.total_amount)}</div>
                </div>
            </div>
        </div>

        <h4 style="margin: 0 0 0.75rem 0; font-size: 1rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-boxes" style="color: var(--primary);"></i> Purchased Line Items
        </h4>
        <div class="table-container" style="border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
            <table class="table table-striped" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--gray-100); font-size: 0.8rem; text-transform: uppercase;">
                        <th style="padding: 0.65rem 0.85rem;">Item Description</th>
                        <th style="padding: 0.65rem 0.85rem; text-align: center;">Qty</th>
                        <th style="padding: 0.65rem 0.85rem; text-align: right;">Unit Price</th>
                        <th style="padding: 0.65rem 0.85rem; text-align: right;">Discount</th>
                        <th style="padding: 0.65rem 0.85rem; text-align: right;">Total Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoice.products && invoice.products.length > 0 ? invoice.products.map(product => `
                        <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.875rem;">
                            <td style="padding: 0.65rem 0.85rem;">
                                <strong>${product.item_name || 'N/A'}</strong>
                                ${product.item_code ? `<br><small style="color: var(--gray-500);">Code: ${product.item_code}</small>` : ''}
                            </td>
                            <td style="padding: 0.65rem 0.85rem; text-align: center;">${product.quantity}</td>
                            <td style="padding: 0.65rem 0.85rem; text-align: right;">${formatCurrency(product.unit_price)}</td>
                            <td style="padding: 0.65rem 0.85rem; text-align: right; color: var(--warning);">${formatCurrency(product.discount_amount || 0)}</td>
                            <td style="padding: 0.65rem 0.85rem; text-align: right; font-weight: 600;">${formatCurrency(product.total_price)}</td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td colspan="5" class="text-center" style="padding: 1.5rem; color: var(--gray-500);">No product items attached</td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;

    modal.style.display = 'flex';
}

/**
 * Close invoice details modal
 */
function closeInvoiceDetailsModal() {
    activeModalInvoiceId = null;
    document.getElementById('invoiceDetailsModal').style.display = 'none';
}

/**
 * Print Report Summary
 */
function printReportSummary() {
    if (!filteredInvoices || filteredInvoices.length === 0) {
        toast.error('No invoice data available to print');
        return;
    }

    const startDate = document.getElementById('invoiceStartDate').value;
    const endDate = document.getElementById('invoiceEndDate').value;

    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) {
        toast.error('Pop-up blocked. Please allow pop-ups to print reports.');
        return;
    }

    let totalSum = 0;
    let totalDiscount = 0;
    filteredInvoices.forEach(inv => {
        if ((inv.status || '').toLowerCase() !== 'cancelled') {
            totalSum += parseFloat(inv.total_amount) || 0;
            totalDiscount += parseFloat(inv.discount_amount) || 0;
        }
    });

    const rowsHtml = filteredInvoices.map((inv, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td><strong>${inv.invoice_number}</strong></td>
            <td>${formatDate(inv.sale_date)}</td>
            <td>${inv.cashier_name || 'N/A'}</td>
            <td>${inv.payment_methods || 'Cash'}</td>
            <td>${(inv.status || 'completed').toUpperCase()}</td>
            <td style="text-align: right;">${formatCurrency(inv.total_amount)}</td>
        </tr>
    `).join('');

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Invoice Audit Report (${startDate} to ${endDate})</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                h2 { margin-bottom: 5px; }
                p { color: #666; font-size: 14px; margin-top: 0; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #ccc; padding: 8px 10px; font-size: 12px; }
                th { background: #f4f4f4; text-align: left; }
                tfoot td { font-weight: bold; background: #fafafa; }
                .summary-box { display: flex; gap: 20px; margin: 15px 0; padding: 10px; background: #f9f9f9; border: 1px solid #eee; }
                @media print {
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <h2>Invoice Audit Summary Report</h2>
            <p>Report Period: ${startDate} to ${endDate} | Generated on: ${new Date().toLocaleString()}</p>

            <div class="summary-box">
                <div><strong>Total Invoices:</strong> ${filteredInvoices.length}</div>
                <div><strong>Total Revenue:</strong> ${formatCurrency(totalSum)}</div>
                <div><strong>Total Discounts:</strong> ${formatCurrency(totalDiscount)}</div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Invoice #</th>
                        <th>Sale Date</th>
                        <th>Cashier</th>
                        <th>Payment Method</th>
                        <th>Status</th>
                        <th style="text-align: right;">Grand Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="6" style="text-align: right;">Total Valid Revenue:</td>
                        <td style="text-align: right;">${formatCurrency(totalSum)}</td>
                    </tr>
                </tfoot>
            </table>
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

/**
 * Export to Excel
 */
async function exportToExcel() {
    const startDate = document.getElementById('invoiceStartDate').value;
    const endDate = document.getElementById('invoiceEndDate').value;

    if (!filteredInvoices || filteredInvoices.length === 0) {
        toast.error('No data to export');
        return;
    }

    try {
        loadingScreen.show('Generating Excel file...');

        const url = `/api/reports/invoices/export?start_date=${startDate}&end_date=${endDate}`;

        const link = document.createElement('a');
        link.href = url;
        link.download = `invoices_${startDate}_to_${endDate}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        messageModal.success('Excel file downloaded successfully');
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        toast.error('Error exporting to Excel: ' + error.message);
    } finally {
        loadingScreen.hide();
    }
}

// Make functions globally accessible
window.viewInvoiceDetails = viewInvoiceDetails;
window.closeInvoiceDetailsModal = closeInvoiceDetailsModal;
