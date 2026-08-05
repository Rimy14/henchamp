/**
 * Sales Reports functionality
 */

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import messageModal from './message-modal.js';

// State
let currentReport = null;
let currentStartDate = null;
let currentEndDate = null;
let currentPeriod = 'this_month'; // Default

export default async function init() {
    // Reset state
    currentReport = null;
    currentStartDate = null;
    currentEndDate = null;
    currentPeriod = 'this_month';

    // Check authentication
    if (!(await auth.requireAuth())) {
        return;
    }

    // Initialize date inputs with this month
    setQuickDate('this_month');

    // Event listeners
    const quickDate = document.getElementById('quickDate');
    if (quickDate) quickDate.addEventListener('change', handleQuickDateChange);

    // Track manual date changes
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    if (startDateInput) {
        startDateInput.addEventListener('change', () => {
            currentPeriod = 'custom';
            if (quickDate) quickDate.value = '';
        });
    }
    if (endDateInput) {
        endDateInput.addEventListener('change', () => {
            currentPeriod = 'custom';
            if (quickDate) quickDate.value = '';
        });
    }

    const generateBtn = document.getElementById('generateReport');
    if (generateBtn) generateBtn.addEventListener('click', generateReport);

    const catFilter = document.getElementById('categoryFilter');
    if (catFilter) catFilter.addEventListener('change', filterProducts);

    // Monthly Targets event listeners
    const targetYear = document.getElementById('targetYear');
    if (targetYear) {
        initializeTargetYears();
        targetYear.addEventListener('change', loadMonthlyTargets);
    }

    const setTargetsBtn = document.getElementById('setTargetsBtn');
    if (setTargetsBtn) setTargetsBtn.addEventListener('click', openSetTargetsModal);

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
}

function handleQuickDateChange(e) {
    const value = e.target.value;
    if (value) {
        currentPeriod = value;
        setQuickDate(value);
    }
}


function setQuickDate(period) {
    const today = new Date();
    let startDate, endDate;

    switch (period) {
        case 'today':
            startDate = endDate = formatDate(today);
            break;

        case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = endDate = formatDate(yesterday);
            break;

        case 'this_week':
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            startDate = formatDate(weekStart);
            endDate = formatDate(today);
            break;

        case 'last_week':
            const lastWeekEnd = new Date(today);
            lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
            const lastWeekStart = new Date(lastWeekEnd);
            lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
            startDate = formatDate(lastWeekStart);
            endDate = formatDate(lastWeekEnd);
            break;

        case 'this_month':
            startDate = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
            endDate = formatDate(today);
            break;

        case 'last_month':
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
            startDate = formatDate(lastMonth);
            endDate = formatDate(lastMonthEnd);
            break;

        case 'this_year':
            startDate = formatDate(new Date(today.getFullYear(), 0, 1));
            endDate = formatDate(today);
            break;
    }

    document.getElementById('startDate').value = startDate;
    document.getElementById('endDate').value = endDate;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function generateReport() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
        toast.warning('Please select start and end dates');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        toast.warning('Start date cannot be after end date');
        return;
    }

    currentStartDate = startDate;
    currentEndDate = endDate;

    loadingScreen.show('Generating report...');

    try {
        // Fetch all report data
        // Fetch all report data
        const [summaryData, daily, products, payments, cashiers, operators, operatorsDaily, profitLossData] = await Promise.all([
            fetchSalesSummary(startDate, endDate),
            fetchDailySales(startDate, endDate),
            fetchProductSales(startDate, endDate),
            fetchPaymentMethods(startDate, endDate),
            fetchCashierPerformance(startDate, endDate),
            fetchOperatorPerformance(startDate, endDate),
            fetchOperatorDailyPerformance(startDate, endDate),
            // fetchSalesPersonPerformance(startDate, endDate), // REMOVED
            // fetchSalesPersonDailyPerformance(startDate, endDate), // REMOVED
            fetchProfitLossData(startDate, endDate)
        ]);

        currentReport = {
            summary: summaryData.summary,
            topProducts: summaryData.topProducts,
            paymentMethods: summaryData.paymentMethods,
            daily,
            products,
            payments,
            cashiers,
            operators,
            operatorsDaily,
            // salesPersons, // REMOVED
            // salesPersonsDaily, // REMOVED
            profitLoss: profitLossData
        };

        renderReport();

        // Show report content, hide empty state
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('dateRangeDisplay').style.display = 'block';
        document.getElementById('summaryStats').style.display = 'grid';
        document.getElementById('reportContent').style.display = 'block';

        // Update date range display
        document.getElementById('displayStartDate').textContent = formatDisplayDate(startDate);
        document.getElementById('displayEndDate').textContent = formatDisplayDate(endDate);

        messageModal.success('Report generated successfully');
    } catch (error) {
        console.error('Error generating report:', error);
        toast.error('Failed to generate report: ' + error.message);
    } finally {
        await loadingScreen.hide();
    }
}

function formatDisplayDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function fetchSalesSummary(startDate, endDate) {
    try {
        const response = await fetch(`/api/reports/sales/summary?start_date=${startDate}&end_date=${endDate}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch sales summary');
    }
}

async function fetchDailySales(startDate, endDate) {
    try {
        const response = await fetch(`/api/reports/sales/daily?start_date=${startDate}&end_date=${endDate}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch daily sales');
    }
}

async function fetchProductSales(startDate, endDate, categoryType = '') {
    try {
        let url = `/api/reports/sales/products?start_date=${startDate}&end_date=${endDate}`;
        if (categoryType) url += `&category_type=${categoryType}`;

        const response = await fetch(url, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch product sales');
    }
}

async function fetchPaymentMethods(startDate, endDate) {
    try {
        const response = await fetch(`/api/reports/sales/payments?start_date=${startDate}&end_date=${endDate}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch payment methods');
    }
}

async function fetchCashierPerformance(startDate, endDate) {
    try {
        const response = await fetch(`/api/reports/sales/cashiers?start_date=${startDate}&end_date=${endDate}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch cashier performance');
    }
}

async function fetchOperatorPerformance(startDate, endDate) {
    try {
        const response = await fetch(`/api/reports/sales/operators?start_date=${startDate}&end_date=${endDate}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch operator performance');
    }
}

async function fetchProfitLossData(startDate, endDate) {
    try {
        const response = await fetch(`/api/reports/profit-loss?start_date=${startDate}&end_date=${endDate}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch P&L data');
    }
}

function renderReport() {
    if (!currentReport) return;

    renderSummaryStats();
    renderTopProducts();
    renderPaymentMethodsSummary();
    renderDailySales();
    renderProductSales();
    renderPaymentDetails();
    renderCashierPerformance();
    // renderOperatorPerformance(); // Removed - Designers section no longer in UI
    // renderOperatorDailyPerformance(); // Removed - Designers section no longer in UI
    // renderSalesPersonPerformance(); // REMOVED
    // renderSalesPersonDailyPerformance(); // REMOVED
    renderProfitLossReport();
}

function getRevenueTitle() {
    // 1. Daily: If today, yesterday, or start==end
    if (['today', 'yesterday'].includes(currentPeriod) || currentStartDate === currentEndDate) {
        return 'Daily Revenue';
    }

    // 2. Weekly: If this_week, last_week, or ~7 days range (optional)
    if (['this_week', 'last_week'].includes(currentPeriod)) {
        return 'Weekly Revenue';
    }

    // 3. Monthly: If this_month, last_month, or "this month range" logic
    if (['this_month', 'last_month'].includes(currentPeriod)) {
        return 'Monthly Revenue';
    }

    // Check manual "this month range" (Start = 1st of month)
    try {
        const start = new Date(currentStartDate);
        const end = new Date(currentEndDate);
        const today = new Date();
        // If start is 1st
        if (start.getDate() === 1) {
            // And (End is Today OR End is Last of Month) AND (Start and End in same Month)
            const endOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            const isEndToday = end.toDateString() === today.toDateString();
            const isEndMonth = end.toDateString() === endOfMonth.toDateString();

            if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
                if (isEndToday || isEndMonth) {
                    return 'Monthly Revenue';
                }
            }
        }
    } catch (e) { }

    return 'Total Revenue';
}

function renderSummaryStats() {
    const { summary } = currentReport;
    const revenueTitle = getRevenueTitle();

    const statsHTML = `
        <div class="stat-card revenue">
            <div class="stat-label">${revenueTitle}</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_revenue).toFixed(2)}</div>
        </div>
        <div class="stat-card cogs">
            <div class="stat-label">Total Cost</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_cost).toFixed(2)}</div>
        </div>
        <div class="stat-card discounts">
            <div class="stat-label">Total Discounts</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_discounts || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card tax">
            <div class="stat-label">Total Tax Collected</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_tax || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card returns">
            <div class="stat-label">Total Returns</div>
            <div class="stat-value">KSh ${parseFloat(summary.returned_revenue || 0).toFixed(2)}</div>
        </div>
    `;

    document.getElementById('summaryStats').innerHTML = statsHTML;
    // Show section wrapper
    const section = document.getElementById('summaryStatsSection');
    if (section) section.style.display = 'block';
}

function renderTopProducts() {
    const { topProducts } = currentReport;

    if (topProducts.length === 0) {
        document.getElementById('topProductsTable').innerHTML = `
            <tr><td colspan="3" class="text-center" style="color: var(--gray-500); padding: 2rem;">No products sold in this period</td></tr>
        `;
        return;
    }

    const html = topProducts.map(product => `
        <tr>
            <td><strong>${product.name}</strong><br><small style="color: var(--gray-500);">${product.code}</small></td>
            <td>${product.category_name || 'N/A'}</td>
            <td><strong>KSh ${parseFloat(product.total_revenue).toFixed(2)}</strong></td>
        </tr>
    `).join('');

    document.getElementById('topProductsTable').innerHTML = html;
}

function renderPaymentMethodsSummary() {
    const { paymentMethods } = currentReport;

    if (paymentMethods.length === 0) {
        document.getElementById('paymentMethodsTable').innerHTML = `
            <tr><td colspan="4" class="text-center" style="color: var(--gray-500); padding: 2rem;">No payment data</td></tr>
        `;
        return;
    }

    const totalAmount = paymentMethods.reduce((sum, pm) => sum + parseFloat(pm.total_amount), 0);

    const html = paymentMethods.map(pm => {
        const percentage = totalAmount > 0 ? (parseFloat(pm.total_amount) / totalAmount * 100).toFixed(1) : 0;
        return `
            <tr>
                <td><strong>${formatPaymentMethod(pm.payment_method)}</strong></td>
                <td>${pm.transaction_count}</td>
                <td><strong>KSh ${parseFloat(pm.total_amount).toFixed(2)}</strong></td>
                <td>${percentage}%</td>
            </tr>
        `;
    }).join('');

    document.getElementById('paymentMethodsTable').innerHTML = html;
}

function renderDailySales() {
    const { daily } = currentReport;

    if (daily.length === 0) {
        document.getElementById('dailySalesTable').innerHTML = `
            <tr><td colspan="3" class="text-center" style="color: var(--gray-500); padding: 2rem;">No sales data</td></tr>
        `;
        return;
    }

    const html = daily.map(day => `
        <tr>
            <td><strong>${formatDisplayDate(day.date)}</strong></td>
            <td><strong>KSh ${parseFloat(day.revenue).toFixed(2)}</strong></td>
            <td>KSh ${parseFloat(day.total_cost).toFixed(2)}</td>
            <td>KSh ${parseFloat(day.total_discounts).toFixed(2)}</td>
            <td>KSh ${parseFloat(day.total_tax || 0).toFixed(2)}</td>
            <td style="color: #ea580c; font-weight: 500;">KSh ${parseFloat(day.petty_cash_expenses || 0).toFixed(2)}</td>
            <td style="color: #ea580c;">KSh ${parseFloat(day.returned_revenue || 0).toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('dailySalesTable').innerHTML = html;
}

function renderProductSales() {
    const { products } = currentReport;

    if (products.length === 0) {
        document.getElementById('productSalesTable').innerHTML = `
            <tr><td colspan="6" class="text-center" style="color: var(--gray-500); padding: 2rem;">No product sales data</td></tr>
        `;
        return;
    }

    const html = products.map(product => `
        <tr>
            <td>${product.code}</td>
            <td><strong>${product.name}</strong></td>
            <td><span class="badge badge-info">${product.category_name || 'N/A'}</span></td>
            <td>${product.total_quantity_sold}</td>
            <td><strong>KSh ${parseFloat(product.total_revenue).toFixed(2)}</strong></td>
            <td>KSh ${parseFloat(product.total_cost).toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('productSalesTable').innerHTML = html;
}

function renderPaymentDetails() {
    const { payments } = currentReport;

    if (payments.length === 0) {
        document.getElementById('paymentDetailTable').innerHTML = `
            <tr><td colspan="5" class="text-center" style="color: var(--gray-500); padding: 2rem;">No payment data</td></tr>
        `;
        return;
    }

    const html = payments.map(pm => `
        <tr>
            <td><strong>${formatPaymentMethod(pm.payment_method)}</strong></td>
            <td><strong>KSh ${parseFloat(pm.total_amount).toFixed(2)}</strong></td>
        </tr>
    `).join('');

    document.getElementById('paymentDetailTable').innerHTML = html;
}

function renderCashierPerformance() {
    const { cashiers } = currentReport;

    if (cashiers.length === 0) {
        document.getElementById('cashierTable').innerHTML = `
            <tr><td colspan="6" class="text-center" style="color: var(--gray-500); padding: 2rem;">No cashier data</td></tr>
        `;
        return;
    }

    const html = cashiers.map(cashier => `
        <tr>
            <td><strong>${cashier.username}</strong></td>
            <td><span class="badge badge-primary">${cashier.role}</span></td>
            <td><strong>KSh ${parseFloat(cashier.total_revenue).toFixed(2)}</strong></td>
            <td>KSh ${parseFloat(cashier.total_discounts).toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('cashierTable').innerHTML = html;
}

function renderOperatorPerformance() {
    const { operators } = currentReport;

    if (!operators || operators.length === 0) {
        document.getElementById('operatorTable').innerHTML = `
            <tr><td colspan="3" class="text-center" style="color: var(--gray-500); padding: 2rem;">No operator data</td></tr>
        `;
        return;
    }

    const html = operators.map(operator => `
        <tr>
            <td><strong>${operator.operator_name}</strong></td>
            <td><strong>KSh ${parseFloat(operator.total_revenue).toFixed(2)}</strong></td>
            <td>KSh ${parseFloat(operator.total_discounts).toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('operatorTable').innerHTML = html;
}

async function fetchOperatorDailyPerformance(startDate, endDate) {
    try {
        const response = await fetch(`/api/reports/sales/operators-daily?start_date=${startDate}&end_date=${endDate}`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);
        return data.data;
    } catch (error) {
        throw new Error('Failed to fetch daily operator performance');
    }
}

function renderOperatorDailyPerformance() {
    const { operatorsDaily } = currentReport;

    if (!operatorsDaily || operatorsDaily.length === 0) {
        document.getElementById('operatorDailyTable').innerHTML = `
            <tr><td colspan="4" class="text-center" style="color: var(--gray-500); padding: 2rem;">No daily operator data</td></tr>
        `;
        return;
    }

    const html = operatorsDaily.map(operator => `
        <tr>
            <td><strong>${formatDisplayDate(operator.sale_date)}</strong></td>
            <td><strong>${operator.operator_name}</strong></td>
            <td><strong>KSh ${parseFloat(operator.total_revenue).toFixed(2)}</strong></td>
            <td>KSh ${parseFloat(operator.total_discounts).toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('operatorDailyTable').innerHTML = html;
}

// Sales Person performance functions removed

function formatPaymentMethod(method) {
    const methods = {
        'cash': 'Cash',
        'card': 'Card',
        'upi': 'UPI',
        'bank_transfer': 'Bank Transfer',
        'credit': 'Credit'
    };
    return methods[method] || method;
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });

    // Load data when switching to monthly targets tab
    if (tabName === 'targets') {
        const yearSelect = document.getElementById('targetYear');
        if (yearSelect && yearSelect.value) {
            loadMonthlyTargets();
        }
    }
}

async function filterProducts() {
    if (!currentStartDate || !currentEndDate) return;

    const categoryType = document.getElementById('categoryFilter').value;

    loadingScreen.show('Filtering products...');

    try {
        const products = await fetchProductSales(currentStartDate, currentEndDate, categoryType);
        currentReport.products = products;
        renderProductSales();
    } catch (error) {
        toast.error('Failed to filter products');
    } finally {
        await loadingScreen.hide();
    }
}

async function exportPDF() {
    toast.info('PDF export feature coming soon!');
    // TODO: Implement PDF export using a library like jsPDF or sending to backend
}

// =====================================================
// PNG EXPORT FUNCTIONALITY
// =====================================================

/**
 * Export a section of the report as PNG image
 * @param {string} sectionId - ID of the section to export
 * @param {string} sectionName - Name for the downloaded file
 */
async function exportSectionToJPEG(sectionId, sectionName) {
    const section = document.getElementById(sectionId);

    if (!section) {
        toast.error('Section not found');
        return;
    }

    // Check if html2canvas is loaded
    if (typeof html2canvas === 'undefined') {
        toast.error('Export library not loaded. Please refresh the page.');
        return;
    }

    try {
        toast.info('Generating image...');

        // Find and hide all export buttons within this section
        const exportButtons = section.querySelectorAll('button[onclick*="exportSectionToJPEG"]');
        exportButtons.forEach(btn => btn.style.display = 'none');

        // Capture Report Period from validation display
        const dateRangeDisplay = document.getElementById('dateRangeDisplay');
        let tempPeriodDiv = null;

        if (dateRangeDisplay && dateRangeDisplay.style.display !== 'none' && !section.contains(dateRangeDisplay)) {
            const periodText = dateRangeDisplay.innerText;
            tempPeriodDiv = document.createElement('div');
            tempPeriodDiv.style.textAlign = 'center';
            tempPeriodDiv.style.marginBottom = '1rem';
            tempPeriodDiv.style.color = '#666';
            tempPeriodDiv.style.fontSize = '0.9rem';
            tempPeriodDiv.style.fontWeight = 'bold';
            tempPeriodDiv.innerText = periodText;

            // Insert at top of section
            section.insertBefore(tempPeriodDiv, section.firstChild);
        }

        // Capture the section
        const canvas = await html2canvas(section, {
            backgroundColor: '#ffffff',
            scale: 3, // Ultra high quality
            logging: false,
            useCORS: true
        });

        // Remove temp period div
        if (tempPeriodDiv) {
            tempPeriodDiv.remove();
        }

        // Show export buttons again
        exportButtons.forEach(btn => btn.style.display = '');

        // Convert canvas to blob
        canvas.toBlob(function (blob) {
            // Create filename with date range if available
            let filename = sectionName.replace(/\s+/g, '_');
            if (currentStartDate && currentEndDate) {
                filename += `_${currentStartDate}_to_${currentEndDate}`;
            }
            filename += '.jpg';

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            messageModal.success(`${sectionName} exported successfully!`);
        }, 'image/jpeg', 1.0); // Maximum quality
    } catch (error) {
        console.error('Export error:', error);
        toast.error('Failed to export section');

        // Make sure to show buttons again even if there's an error
        const exportButtons = section.querySelectorAll('button[onclick*="exportSectionToJPEG"]');
        exportButtons.forEach(btn => btn.style.display = '');
    }
}

// Make export function globally accessible
window.exportSectionToJPEG = exportSectionToJPEG;


// =====================================================
// MONTHLY TARGETS FUNCTIONALITY
// =====================================================

function initializeTargetYears() {
    const currentYear = new Date().getFullYear();
    const yearSelect = document.getElementById('targetYear');

    if (!yearSelect) return;

    // Populate years (current year ± 2 years)
    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 2; i++) {
        years.push(i);
    }

    yearSelect.innerHTML = years.map(year =>
        `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`
    ).join('');
}

async function loadMonthlyTargets() {
    const year = document.getElementById('targetYear').value;

    if (!year) return;

    loadingScreen.show('Loading monthly targets...');

    try {
        const response = await fetch(`/api/reports/sales/monthly-targets?year=${year}`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (!data.success) throw new Error(data.message);

        renderMonthlyTargets(data.data);
        messageModal.success('Monthly targets loaded successfully');
    } catch (error) {
        console.error('Error loading monthly targets:', error);
        toast.error('Failed to load monthly targets: ' + error.message);
        document.getElementById('monthlyTargetsTable').innerHTML = `
            <tr><td colspan="6" class="text-center" style="color: var(--gray-500); padding: 2rem;">
                No targets found for ${year}. Click "Set Targets" to create monthly targets.
            </td></tr>
        `;
    } finally {
        await loadingScreen.hide();
    }
}

function renderMonthlyTargets(data) {
    if (!data || data.length === 0) {
        document.getElementById('monthlyTargetsTable').innerHTML = `
            <tr><td colspan="6" class="text-center" style="color: var(--gray-500); padding: 2rem;">
                No targets set for this year. Click "Set Targets" to create monthly targets.
            </td></tr>
        `;
        return;
    }

    const html = data.map(monthData => {
        const { overall, operators, variance } = monthData;
        const achieved = parseFloat(overall.achieved_percentage);

        // Status badge color
        let badgeClass = 'badge-danger';
        if (achieved >= 100) badgeClass = 'badge-success';
        else if (achieved >= 90) badgeClass = 'badge-warning';

        // Balance color
        const balanceColor = parseFloat(overall.balance) >= 0 ? 'var(--success)' : 'var(--danger)';

        return `
            <tr>
                <td><strong>${overall.month_name}</strong></td>
                <td><strong>KSh ${parseFloat(overall.overall_target).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                <td>KSh ${parseFloat(overall.actual_sales).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="color: ${balanceColor}; font-weight: bold;">
                    ${parseFloat(overall.balance) >= 0 ? '+' : ''}KSh ${parseFloat(overall.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td>
                    <span class="badge ${badgeClass}">${achieved.toFixed(1)}%</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="viewMonthDetails('${overall.month}')">
                        <i class="fas fa-eye"></i> Details
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('monthlyTargetsTable').innerHTML = html;
}

let currentTargetMonth = null;

// switchTargetTab removed

async function openSetTargetsModal() {
    const modal = document.getElementById('setTargetsModal');
    if (!modal) {
        toast.error('Target setting modal not found');
        return;
    }

    // Set default month to current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('targetMonth').value = currentMonth;
    currentTargetMonth = currentMonth;

    // Reset form
    document.getElementById('overallTargetInput').value = '';
    modalOperators = [];

    // Show modal
    modal.style.display = 'flex';

    // Add event listeners (only once)
    const monthInput = document.getElementById('targetMonth');
    monthInput.removeEventListener('change', onMonthChange);
    monthInput.addEventListener('change', onMonthChange);

    // Load existing targets for current month
    await loadExistingTargets(currentTargetMonth + '-01');
}

// loadOperatorsForModal removed

// Sales Person target loading functions removed

async function onMonthChange() {
    const monthValue = document.getElementById('targetMonth').value;
    if (!monthValue) return;

    currentTargetMonth = monthValue;
    const targetMonth = monthValue + '-01';

    // Load existing targets for this month
    await loadExistingTargets(targetMonth);
}

async function loadExistingTargets(targetMonth) {
    try {
        // Load overall target
        const overallResponse = await fetch(`/api/sales-targets/overall/${targetMonth}`, {
            credentials: 'include'
        });
        const overallData = await overallResponse.json();

        if (overallData.success && overallData.data) {
            document.getElementById('overallTargetInput').value = overallData.data.overall_target;
        }

        // Load operator targets - REMOVED
        /*
        const opResponse = await fetch(`/api/sales-targets/operators/${targetMonth}`, { credentials: 'include' });
        const opData = await opResponse.json();

        if (opData.success && opData.data) {
            opData.data.forEach(target => {
                const operator = modalOperators.find(op => op.id === target.operator_id);
                if (operator) {
                    operator.targetAmount = target.target_amount;
                }
            });
            renderOperatorTargetsTable();
        }
        */

    } catch (error) {
        console.error('Error loading existing targets:', error);
    }
}

// Unused target functions removed (updateSummary, distributeEqually, copyPreviousMonth, clearTargets)

async function saveTargets() {
    const monthValue = document.getElementById('targetMonth').value;
    const overallTarget = parseFloat(document.getElementById('overallTargetInput').value);

    if (!monthValue) {
        toast.warning('Please select a month');
        return;
    }

    const targetMonth = monthValue + '-01';

    // Collect operator targets
    const opInputs = document.querySelectorAll('.operator-target-input');
    const operatorTargets = [];
    opInputs.forEach(input => {
        const val = parseFloat(input.value);
        if (val > 0) {
            operatorTargets.push({
                operator_id: parseInt(input.dataset.operatorId),
                target_amount: val
            });
        }
    });

    // Check if at least something is being saved
    if (!overallTarget && operatorTargets.length === 0) {
        toast.warning('Please enter at least one target (overall or operator)');
        return;
    }

    loadingScreen.show('Saving targets...');
    const saveBtn = document.getElementById('saveTargetsBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        // Save overall target only if provided
        if (overallTarget && overallTarget > 0) {
            await fetch('/api/sales-targets/overall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ target_month: targetMonth, overall_target: overallTarget })
            });
        }

        // Save operator targets
        if (operatorTargets.length > 0) {
            await fetch('/api/sales-targets/operators/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ target_month: targetMonth, targets: operatorTargets })
            });
        }

        messageModal.success('Targets saved successfully!');
        closeSetTargetsModal();

        // Reload monthly targets if on that tab
        if (document.getElementById('targetsTab').classList.contains('active')) {
            loadMonthlyTargets();
        }
    } catch (error) {
        console.error('Error saving targets:', error);
        toast.error('Failed to save targets');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
        await loadingScreen.hide();
    }
}

function closeSetTargetsModal() {
    const modal = document.getElementById('setTargetsModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Reset state
    modalOperators = [];
    currentTargetMonth = null;
}

// Make functions globally accessible
window.closeSetTargetsModal = closeSetTargetsModal;
// Window exports cleaned up

window.viewMonthDetails = async function (month) {
    console.log('viewMonthDetails called with month:', month);

    // Format month to YYYY-MM-DD (first day of month) if it's a timestamp
    let formattedMonth = month;
    if (month.includes('T') || month.includes(':')) {
        // It's an ISO timestamp, convert to YYYY-MM-DD
        const date = new Date(month);
        formattedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (month.length === 7) {
        // It's YYYY-MM format, convert to YYYY-MM-DD
        formattedMonth = `${month}-01`;
    }

    console.log('Formatted month:', formattedMonth);
    loadingScreen.show('Loading month details...');

    try {
        console.log('Fetching data from API...');
        const response = await fetch(`/api/reports/sales/monthly-targets?month=${formattedMonth}`, {
            credentials: 'include'
        });
        const data = await response.json();
        console.log('API Response:', data);

        if (!data.success) throw new Error(data.message);

        if (data.data && data.data.length > 0) {
            const monthData = data.data[0];
            console.log('Month data:', monthData);
            console.log('Calling showMonthDetailsModal...');
            showMonthDetailsModal(monthData);
            console.log('showMonthDetailsModal completed');
        } else {
            console.log('No data returned from API');
            toast.error('No data available for this month');
        }
    } catch (error) {
        console.error('Error in viewMonthDetails:', error);
        toast.error('Failed to load month details: ' + error.message);
    } finally {
        await loadingScreen.hide();
    }
};

function showMonthDetailsModal(monthData) {
    console.log('showMonthDetailsModal called with:', monthData);
    const { overall, operators, operators_without_targets, sales_persons, sales_persons_without_targets, variance } = monthData;

    // Operators HTML
    let operatorsHTML = '';
    if (operators && operators.length > 0) {
        operatorsHTML = operators.map((op, index) => {
            const achieved = parseFloat(op.achieved_percentage);
            let badgeClass = 'badge-danger';
            if (achieved >= 100) badgeClass = 'badge-success';
            else if (achieved >= 90) badgeClass = 'badge-warning';

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${op.operator_name}</strong></td>
                    <td>KSh ${parseFloat(op.target).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>KSh ${parseFloat(op.actual_sales).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="color: ${parseFloat(op.balance) >= 0 ? 'var(--success)' : 'var(--danger)'}">
                        KSh ${parseFloat(op.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td><span class="badge ${badgeClass}">${achieved.toFixed(1)}%</span></td>
                    <td>${op.contribution_to_overall.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
    } else {
        operatorsHTML = '<tr><td colspan="7" class="text-center">No operator targets set</td></tr>';
    }

    // Sales Persons HTML generation removed

    // Company sales breakdown
    const totalActualSales = parseFloat(overall.actual_sales);
    const target = parseFloat(overall.overall_target);
    const balance = target - totalActualSales;
    const achievedPercent = target > 0 ? (totalActualSales / target * 100) : 0;


    const modalContent = `
        <div class="modal-overlay show" id="monthDetailsModal">
            <div class="modal-container" style="max-width: 1200px;" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2>${overall.month_name} - Detailed Performance</h2>
                    <div style="margin-left: auto; display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn btn-sm btn-secondary" onclick="exportModalToJPEG('monthDetailsModalBody', 'Monthly_Report_${overall.month}')">
                            <i class="fas fa-file-image"></i> Export to JPEG
                        </button>
                        <button class="modal-close" onclick="document.getElementById('monthDetailsModal').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="modal-body" id="monthDetailsModalBody" style="max-height: 70vh; overflow-y: auto; background: white;">
                    <!-- Overall Summary -->
                    <div style="background: var(--gray-50); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;" id="monthOverallSummary">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h3 style="margin: 0;">Overall Performance</h3>
                            <button class="btn btn-sm btn-secondary" onclick="exportModalToJPEG('monthOverallSummary', 'Monthly_Target_Overall_${overall.month}')">
                                <i class="fas fa-file-image"></i> Export to JPEG
                            </button>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                            <div>
                                <div style="color: var(--gray-600); font-size: 0.875rem;">Target</div>
                                <div style="font-size: 1.5rem; font-weight: bold;">KSh ${target.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div>
                                <div style="color: var(--gray-600); font-size: 0.875rem;">Actual Sales</div>
                                <div style="font-size: 1.5rem; font-weight: bold;">KSh ${totalActualSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div>
                                <div style="color: var(--gray-600); font-size: 0.875rem;">Balance</div>
                                <div style="font-size: 1.5rem; font-weight: bold; color: ${balance >= 0 ? 'var(--success)' : 'var(--danger)'}">KSh ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div>
                                <div style="color: var(--gray-600); font-size: 0.875rem;">Achievement</div>
                                <div style="font-size: 1.5rem; font-weight: bold;">${achievedPercent.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>


                    <!-- Sales Person Performance Section Removed -->

                </div>
            </div>
        </div>
    `;

    console.log('Modal HTML created, length:', modalContent.length);

    // Remove existing modal if any
    const existingModal = document.getElementById('monthDetailsModal');
    if (existingModal) {
        console.log('Removing existing modal');
        existingModal.remove();
    }

    // Add new modal
    console.log('Inserting modal into DOM');
    document.body.insertAdjacentHTML('beforeend', modalContent);

    // Verify modal was added
    const insertedModal = document.getElementById('monthDetailsModal');
    console.log('Modal inserted successfully:', !!insertedModal);
}


// Export modal content to JPEG
window.exportModalToJPEG = async function (elementId, fileName) {
    try {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Show loading state
        const originalText = event.target.innerHTML;
        const btn = event.target.closest('button');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            btn.disabled = true;
        }

        // Use html2canvas
        const canvas = await html2canvas(element, {
            scale: 2, // Better quality
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight
        });

        // Convert to blob and download
        const link = document.createElement('a');
        link.download = `${fileName}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Restore button
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }

        toast.success('Report exported as JPEG');
    } catch (error) {
        console.error('Export failed:', error);
        toast.error('Failed to export report');

        // Restore button on error
        const btn = event.target.closest('button');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-file-image"></i> Export to JPEG';
            btn.disabled = false;
        }
    }
};

function renderProfitLossReport() {
    const { profitLoss } = currentReport;
    if (!profitLoss) return;

    const { summary, daily, categories } = profitLoss;

    // Render Stats
    const statsHTML = `
        <div class="stat-card revenue">
            <div class="stat-label">Total Revenue</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_revenue).toFixed(2)}</div>
        </div>
        <div class="stat-card cogs">
            <div class="stat-label">Total COGS</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_cogs).toFixed(2)}</div>
        </div>
        <div class="stat-card profit">
            <div class="stat-label">Gross Profit</div>
            <div class="stat-value">KSh ${parseFloat(summary.gross_profit).toFixed(2)}</div>
        </div>
        <div class="stat-card tax">
            <div class="stat-label">Total Tax Collected</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_tax || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Revenue Net of Tax</div>
            <div class="stat-value">KSh ${parseFloat(summary.revenue_net_of_tax || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Other Monthly Costs</div>
            <div class="stat-value">KSh ${parseFloat(summary.total_monthly_costs).toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Petty Cash Expenses</div>
            <div class="stat-value" style="color: #ea580c;">KSh ${parseFloat(summary.total_petty_cash_costs || 0).toFixed(2)}</div>
        </div>
        <div class="stat-card net-profit">
            <div class="stat-label">
                Net Profit
                <button class="btn btn-sm btn-icon" onclick="openProfitLossBreakdownModal()" title="View Breakdown" style="margin-left: 5px; background: none; border: none; cursor: pointer; color: var(--primary-600);">
                    <i class="fas fa-expand-alt"></i>
                </button>
            </div>
            <div class="stat-value">KSh ${parseFloat(summary.net_profit).toFixed(2)}</div>
            <div style="font-size: 0.8rem; margin-top: 0.25rem; color: var(--gray-600);">Margin: ${summary.profit_margin}%</div>
        </div>
    `;
    const statsContainer = document.getElementById('profitLossStats');
    if (statsContainer) statsContainer.innerHTML = statsHTML;

    // Render Daily Profit
    const dailyTable = document.getElementById('dailyProfitTable');
    if (dailyTable) {
        if (daily && daily.length > 0) {
            const dailyHTML = daily.map(day => `
                <tr>
                    <td><strong>${formatDisplayDate(day.date)}</strong></td>
                    <td>KSh ${parseFloat(day.revenue).toFixed(2)}</td>
                    <td>KSh ${parseFloat(day.cogs).toFixed(2)}</td>
                    <td>KSh ${parseFloat(day.petty_cash_expenses || 0).toFixed(2)}</td>
                    <td style="color: ${parseFloat(day.gross_profit - (day.petty_cash_expenses || 0)) >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">
                        KSh ${parseFloat(day.gross_profit - (day.petty_cash_expenses || 0)).toFixed(2)}
                    </td>
                </tr>
            `).join('');
            dailyTable.innerHTML = dailyHTML;
        } else {
            dailyTable.innerHTML = '<tr><td colspan="5" class="text-center">No data available</td></tr>';
        }
    }

    // Render Category Profit
    const categoryTable = document.getElementById('categoryProfitTable');
    if (categoryTable) {
        if (categories && categories.length > 0) {
            const categoryHTML = categories.map(cat => `
                <tr>
                    <td><strong>${cat.category_name}</strong></td>
                    <td>KSh ${parseFloat(cat.revenue).toFixed(2)}</td>
                    <td>KSh ${parseFloat(cat.cogs).toFixed(2)}</td>
                    <td style="color: ${parseFloat(cat.profit) >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: bold;">
                        KSh ${parseFloat(cat.profit).toFixed(2)}
                    </td>
                </tr>
            `).join('');
            categoryTable.innerHTML = categoryHTML;
        } else {
            categoryTable.innerHTML = '<tr><td colspan="4" class="text-center">No data available</td></tr>';
        }
    }

    // Sales Person Profit Section Removed
}

// P&L Breakdown Modal Functions
window.openProfitLossBreakdownModal = function () {
    const { profitLoss } = currentReport;
    if (!profitLoss) {
        toast.error('No P&L data available for breakdown.');
        return;
    }

    const { summary } = profitLoss;
    const modal = document.getElementById('profitLossBreakdownModal');

    document.getElementById('breakdownTotalRevenue').textContent = `KSh ${parseFloat(summary.total_revenue).toFixed(2)}`;
    document.getElementById('breakdownTotalTax').textContent = `KSh ${parseFloat(summary.total_tax || 0).toFixed(2)}`;
    document.getElementById('breakdownRevenueNetOfTax').textContent = `KSh ${parseFloat(summary.revenue_net_of_tax || 0).toFixed(2)}`;
    document.getElementById('breakdownTotalCogs').textContent = `KSh ${parseFloat(summary.total_cogs).toFixed(2)}`;
    document.getElementById('breakdownGrossProfit').textContent = `KSh ${parseFloat(summary.gross_profit).toFixed(2)}`;

    const monthlyCostsList = document.getElementById('breakdownMonthlyCostsList');
    monthlyCostsList.innerHTML = '';
    if (summary.individual_monthly_costs && summary.individual_monthly_costs.length > 0) {
        summary.individual_monthly_costs.forEach(cost => {
            const costItem = document.createElement('div');
            costItem.className = 'summary-item';
            const catBadge = `<span style="display: inline-block; font-size: 0.725rem; font-weight: 700; color: #0e4a35; background: rgba(14, 74, 53, 0.08); padding: 0.15rem 0.5rem; border-radius: 12px; border: 1px solid rgba(14, 74, 53, 0.18); margin-left: 0.4rem;">${cost.category_name || 'General Overhead'}</span>`;
            costItem.innerHTML = `
                <span class="label" style="display: flex; align-items: center; gap: 0.25rem;">${cost.name} ${catBadge}:</span>
                <span class="value">KSh ${parseFloat(cost.amount).toFixed(2)}</span>
            `;
            monthlyCostsList.appendChild(costItem);
        });
    } else {
        monthlyCostsList.innerHTML = '<p>No monthly costs recorded for this period.</p>';
    }

    document.getElementById('breakdownTotalMonthlyCosts').textContent = `KSh ${parseFloat(summary.total_monthly_costs).toFixed(2)}`;

    const pettyCashList = document.getElementById('breakdownPettyCashList');
    pettyCashList.innerHTML = '';
    if (summary.petty_cash_categories && summary.petty_cash_categories.length > 0) {
        summary.petty_cash_categories.forEach(cat => {
            const catItem = document.createElement('div');
            catItem.className = 'summary-item';
            catItem.innerHTML = `
                <span class="label">${cat.category_name}:</span>
                <span class="value">KSh ${parseFloat(cat.amount).toFixed(2)}</span>
            `;
            pettyCashList.appendChild(catItem);
        });
    } else {
        pettyCashList.innerHTML = '<p>No petty cash expenses recorded for this period.</p>';
    }

    document.getElementById('breakdownTotalPettyCash').textContent = `KSh ${parseFloat(summary.total_petty_cash_costs || 0).toFixed(2)}`;
    document.getElementById('breakdownNetProfit').textContent = `KSh ${parseFloat(summary.net_profit).toFixed(2)}`;
    document.getElementById('breakdownProfitMargin').textContent = `${summary.profit_margin}%`;

    modal.style.display = 'flex';
};

window.closeProfitLossBreakdownModal = function () {
    const modal = document.getElementById('profitLossBreakdownModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

async function exportDailySalesToExcel() {
    const { daily } = currentReport;
    
    if (!daily || daily.length === 0) {
        toast.error('No daily sales data available to export');
        return;
    }

    if (typeof ExcelJS === 'undefined') {
        toast.error('Excel library not loaded.');
        return;
    }

    try {
        toast.info('Generating Excel workbook...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Daily Sales Breakdown');

        worksheet.columns = [
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Revenue', key: 'revenue', width: 20 },
            { header: 'Total Cost', key: 'cost', width: 20 },
            { header: 'Discounts', key: 'discounts', width: 20 },
            { header: 'Tax', key: 'tax', width: 20 },
            { header: 'Petty Cash', key: 'petty_cash', width: 20 },
            { header: 'Returns', key: 'returns', width: 20 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        daily.forEach(day => {
            worksheet.addRow({
                date: formatDisplayDate(day.date),
                revenue: parseFloat(day.revenue || 0),
                cost: parseFloat(day.total_cost || 0),
                discounts: parseFloat(day.total_discounts || 0),
                tax: parseFloat(day.total_tax || 0),
                petty_cash: parseFloat(day.petty_cash_expenses || 0),
                returns: parseFloat(day.returned_revenue || 0)
            });
        });

        // Format numeric columns
        const numericColumns = ['revenue', 'cost', 'discounts', 'tax', 'petty_cash', 'returns'];
        numericColumns.forEach(col => {
            worksheet.getColumn(col).numFmt = '#,##0.00';
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const filename = `Daily_Sales_Breakdown_${new Date().toISOString().split('T')[0]}.xlsx`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        messageModal.success('Daily Sales Breakdown exported to Excel!');
    } catch (error) {
        console.error('Excel export error:', error);
        toast.error('Failed to export to Excel: ' + error.message);
    }
}

async function genericExportToExcel(data, columns, filenamePrefix, sheetName, emptyMessage) {
    if (!data || data.length === 0) {
        toast.error(emptyMessage || 'No data available to export');
        return;
    }
    if (typeof ExcelJS === 'undefined') {
        toast.error('Excel library not loaded.');
        return;
    }
    try {
        toast.info('Generating Excel workbook...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);

        worksheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width || 20 }));
        
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        data.forEach(row => {
            worksheet.addRow(row);
        });

        // Format numeric columns
        columns.forEach(col => {
            if (col.isNumeric) worksheet.getColumn(col.key).numFmt = '#,##0.00';
            if (col.isInteger) worksheet.getColumn(col.key).numFmt = '#,##0';
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const filename = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        messageModal.success(`${sheetName} exported to Excel!`);
    } catch (error) {
        console.error('Excel export error:', error);
        toast.error('Failed to export to Excel: ' + error.message);
    }
}

window.exportTopProductsToExcel = () => {
    const data = (currentReport.topProducts || []).map(p => ({
        product: p.name,
        code: p.code,
        category: p.category_name || 'N/A',
        revenue: parseFloat(p.total_revenue || 0)
    }));
    genericExportToExcel(data, [
        { header: 'Product', key: 'product', width: 30 },
        { header: 'Code', key: 'code', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Revenue', key: 'revenue', width: 20, isNumeric: true }
    ], 'Top_Selling_Products', 'Top Selling Products');
};

window.exportPaymentMethodsOverviewToExcel = () => {
    const data = (currentReport.paymentMethods || []).map(pm => ({
        method: formatPaymentMethod(pm.payment_method),
        transactions: parseInt(pm.transaction_count || 0),
        amount: parseFloat(pm.total_amount || 0)
    }));
    genericExportToExcel(data, [
        { header: 'Payment Method', key: 'method', width: 20 },
        { header: 'Transactions', key: 'transactions', width: 15, isInteger: true },
        { header: 'Amount', key: 'amount', width: 20, isNumeric: true }
    ], 'Payment_Methods_Overview', 'Payment Methods');
};

window.exportPaymentMethodsDetailToExcel = () => {
    const data = (currentReport.payments || []).map(pm => ({
        method: formatPaymentMethod(pm.payment_method),
        amount: parseFloat(pm.total_amount || 0)
    }));
    genericExportToExcel(data, [
        { header: 'Payment Method', key: 'method', width: 20 },
        { header: 'Amount', key: 'amount', width: 20, isNumeric: true }
    ], 'Payment_Methods_Detail', 'Payment Methods Detail');
};

window.exportProductSalesToExcel = () => {
    const data = (currentReport.products || []).map(p => ({
        code: p.code,
        product: p.name,
        category: p.category_name || 'N/A',
        qty: parseInt(p.total_quantity_sold || 0),
        revenue: parseFloat(p.total_revenue || 0),
        cost: parseFloat(p.total_cost || 0)
    }));
    genericExportToExcel(data, [
        { header: 'Code', key: 'code', width: 15 },
        { header: 'Product', key: 'product', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Qty Sold', key: 'qty', width: 15, isInteger: true },
        { header: 'Revenue', key: 'revenue', width: 20, isNumeric: true },
        { header: 'Total Cost', key: 'cost', width: 20, isNumeric: true }
    ], 'Product_Sales', 'Product Sales');
};

window.exportCashierPerformanceToExcel = () => {
    const data = (currentReport.cashiers || []).map(c => ({
        cashier: c.username,
        role: c.role,
        revenue: parseFloat(c.total_revenue || 0),
        discounts: parseFloat(c.total_discounts || 0)
    }));
    genericExportToExcel(data, [
        { header: 'Cashier', key: 'cashier', width: 25 },
        { header: 'Role', key: 'role', width: 15 },
        { header: 'Revenue', key: 'revenue', width: 20, isNumeric: true },
        { header: 'Discounts', key: 'discounts', width: 20, isNumeric: true }
    ], 'Cashier_Performance', 'Cashier Performance');
};

window.exportDailyProfitLossToExcel = () => {
    const data = (currentReport.profitLoss?.daily || []).map(d => ({
        date: formatDisplayDate(d.date),
        revenue: parseFloat(d.revenue || 0),
        cogs: parseFloat(d.cogs || 0),
        petty_cash: parseFloat(d.petty_cash_expenses || 0),
        net_profit: parseFloat(d.gross_profit - (d.petty_cash_expenses || 0))
    }));
    genericExportToExcel(data, [
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Revenue', key: 'revenue', width: 20, isNumeric: true },
        { header: 'COGS', key: 'cogs', width: 20, isNumeric: true },
        { header: 'Petty Cash Expenses', key: 'petty_cash', width: 25, isNumeric: true },
        { header: 'Net Profit', key: 'net_profit', width: 20, isNumeric: true }
    ], 'Daily_Profit_Loss', 'Daily Profit Loss');
};

window.exportProfitByCategoryToExcel = () => {
    const data = (currentReport.profitLoss?.categories || []).map(c => ({
        category: c.category_name,
        revenue: parseFloat(c.revenue || 0),
        cogs: parseFloat(c.cogs || 0),
        profit: parseFloat(c.profit || 0)
    }));
    genericExportToExcel(data, [
        { header: 'Category', key: 'category', width: 25 },
        { header: 'Revenue', key: 'revenue', width: 20, isNumeric: true },
        { header: 'COGS', key: 'cogs', width: 20, isNumeric: true },
        { header: 'Profit', key: 'profit', width: 20, isNumeric: true }
    ], 'Profit_By_Category', 'Profit By Category');
};

window.exportDailySalesToExcel = exportDailySalesToExcel;
