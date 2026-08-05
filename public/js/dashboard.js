/**
 * Dashboard page functionality
 */

import auth from '../js/auth.js';
import api from '../js/api.js';
import loadingScreen from '../js/loading-screen.js';
import Pagination from './pagination.js';

let salesPagination = null;
let salesTrendChartInstance = null;
let paymentMethodsChartInstance = null;
let allSalesTrendData = [];
let allPaymentMethodsData = [];

export default async function initDashboard() {
    // Reset chart instances to avoid state carryovers
    if (salesTrendChartInstance) {
        salesTrendChartInstance.destroy();
        salesTrendChartInstance = null;
    }
    if (paymentMethodsChartInstance) {
        paymentMethodsChartInstance.destroy();
        paymentMethodsChartInstance = null;
    }
    allSalesTrendData = [];
    allPaymentMethodsData = [];

    // Check authentication
    const isAuthenticated = await auth.checkAuth();
    if (!isAuthenticated) {
        return;
    }

    // Get current user
    const user = auth.getCurrentUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        if (nameEl) nameEl.textContent = user.username;
        if (roleEl) roleEl.textContent = user.role;
    }

    // Hide users link if not admin
    const usersLink = document.getElementById('usersLink');
    if (user.role !== 'Admin' && usersLink) {
        usersLink.style.display = 'none';
    }

    // Logout handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.logout();
        });
    }

    // Setup chart time filter dropdown listeners independently
    const salesTrendFilter = document.getElementById('salesTrendFilter');
    if (salesTrendFilter) {
        salesTrendFilter.addEventListener('change', (e) => {
            updateSalesTrendChart(e.target.value);
        });
    }

    const paymentMethodsFilter = document.getElementById('paymentMethodsFilter');
    if (paymentMethodsFilter) {
        paymentMethodsFilter.addEventListener('change', (e) => {
            updatePaymentMethodsChart(e.target.value);
        });
    }

    // Initialize pagination for sales table
    salesPagination = new Pagination('salesPaginationContainer', {
        itemsPerPage: 5,
        onPageChange: (page) => {
            loadRecentSales(page);
        }
    });

    // Load dashboard data
    try {
        await Promise.all([
            loadDashboardMetrics(),
            loadRecentSales(1)
        ]);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadDashboardMetrics() {
    try {
        const response = await api.reports.dashboard();

        if (response.success) {
            const { todaySales, lowStockCount, pendingPOsCount, pendingInvoicesCount, charts } = response.data;

            document.getElementById('todaySales').textContent = formatCurrency(todaySales);
            document.getElementById('lowStock').textContent = lowStockCount;
            document.getElementById('pendingPOs').textContent = pendingPOsCount;
            document.getElementById('pendingInvoices').textContent = pendingInvoicesCount;

            // Save metrics data and render charts
            if (charts) {
                allSalesTrendData = charts.salesTrend || [];
                allPaymentMethodsData = charts.paymentMethods || [];
                
                // Get selected values from dropdowns and render
                const trendFilterEl = document.getElementById('salesTrendFilter');
                const initialTrendFilter = trendFilterEl ? trendFilterEl.value : '7d';
                updateSalesTrendChart(initialTrendFilter);

                const paymentsFilterEl = document.getElementById('paymentMethodsFilter');
                const initialPaymentsFilter = paymentsFilterEl ? paymentsFilterEl.value : '7d';
                updatePaymentMethodsChart(initialPaymentsFilter);
            }
        }
    } catch (error) {
        console.error('Error loading metrics:', error);
    }
}

function aggregateSalesTrendByDate(data) {
    const map = new Map();
    data.forEach(item => {
        const date = item.date;
        const total = parseFloat(item.total) || 0;
        map.set(date, (map.get(date) || 0) + total);
    });
    return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, total]) => ({ date, total }));
}

function updateSalesTrendChart(filterValue) {
    const filteredSales = filterDataByRange(allSalesTrendData, filterValue);
    const aggregatedSales = aggregateSalesTrendByDate(filteredSales);
    renderSalesTrendChart(aggregatedSales);
}

function updatePaymentMethodsChart(filterValue) {
    const filteredPayments = filterDataByRange(allPaymentMethodsData, filterValue);
    const aggregatedPayments = aggregatePayments(filteredPayments);
    renderPaymentMethodsChart(aggregatedPayments);
}

function filterDataByRange(data, filterValue) {
    const today = new Date();
    
    const getYearMonthDay = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const todayStr = getYearMonthDay(today);
    
    // Last 7 days helper
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    const sevenDaysAgoStr = getYearMonthDay(sevenDaysAgo);

    // Last 30 days helper
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 29);
    const thirtyDaysAgoStr = getYearMonthDay(thirtyDaysAgo);

    // This month bounds (starts with YYYY-MM)
    const thisMonthPrefix = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');

    // Last month bounds (starts with YYYY-MM)
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthPrefix = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0');

    return data.filter(item => {
        const itemDate = item.date; // Format: 'YYYY-MM-DD'
        
        switch (filterValue) {
            case 'today':
                return itemDate === todayStr;
            case '7d':
                return itemDate >= sevenDaysAgoStr && itemDate <= todayStr;
            case '30d':
                return itemDate >= thirtyDaysAgoStr && itemDate <= todayStr;
            case 'thisMonth':
                return itemDate.startsWith(thisMonthPrefix);
            case 'lastMonth':
                return itemDate.startsWith(lastMonthPrefix);
            default:
                return true;
        }
    });
}

function aggregatePayments(paymentsList) {
    const aggregated = {};
    paymentsList.forEach(p => {
        const method = p.payment_method;
        const amount = parseFloat(p.total) || 0;
        aggregated[method] = (aggregated[method] || 0) + amount;
    });
    
    return Object.keys(aggregated).map(method => ({
        payment_method: method,
        total: aggregated[method]
    }));
}

function renderSalesTrendChart(dataToUse) {
    const canvas = document.getElementById('salesTrendChart');
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
        console.error('[Dashboard] Chart.js library is not loaded.');
        return;
    }

    const labels = dataToUse.map(d => formatDateLabel(d.date));
    const values = dataToUse.map(d => parseFloat(d.total) || 0);

    if (salesTrendChartInstance) {
        salesTrendChartInstance.destroy();
    }

    // Fallback if no data
    if (labels.length === 0) {
        labels.push('No Sales');
        values.push(0);
    }

    salesTrendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales Revenue',
                data: values,
                borderColor: '#166044', // Indigo primary-600
                backgroundColor: 'rgba(132, 204, 22, 0.08)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#166044',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return 'Revenue: ' + formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.04)'
                    },
                    ticks: {
                        callback: function (value) {
                            return 'KSh ' + value.toLocaleString('en-KE');
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderPaymentMethodsChart(paymentData) {
    const canvas = document.getElementById('paymentMethodsChart');
    if (!canvas) return;

    if (typeof Chart === 'undefined') {
        console.error('[Dashboard] Chart.js library is not loaded.');
        return;
    }

    if (paymentMethodsChartInstance) {
        paymentMethodsChartInstance.destroy();
    }

    // Clean up data or fallback
    const validPayments = paymentData.filter(p => parseFloat(p.total) > 0.01);
    
    if (validPayments.length === 0) {
        validPayments.push({ payment_method: 'No Sales', total: 1 });
    }

    const labels = validPayments.map(p => p.payment_method);
    const values = validPayments.map(p => parseFloat(p.total) || 0);

    const paymentColors = {
        'Cash': '#10b981',        // Emerald/Success
        'Card': '#0ea5e9',        // Sky/Info
        'Bank Transfer': '#166044', // Indigo/Secondary
        'Credit': '#f59e0b',       // Amber/Warning
        'No Sales': '#e2e8f0'
    };

    const backgroundColors = labels.map(label => paymentColors[label] || '#94a3b8');

    paymentMethodsChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderWidth: 1,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        font: {
                            family: 'Inter, sans-serif',
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const val = context.raw;
                            const percentage = total > 0 ? Math.round((val / total) * 100) : 0;
                            if (context.label === 'No Sales') return 'No sales recorded';
                            return ` ${context.label}: ${formatCurrency(val)} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

function formatDateLabel(dateStr) {
    if (dateStr === 'No Sales') return dateStr;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadRecentSales(page = 1) {
    try {
        const { limit } = salesPagination ? salesPagination.getState() : { limit: 10 };

        const params = {
            page: page,
            limit: limit
        };

        const response = await api.sales.getAll(params);

        if (response.success && response.data.length > 0) {
            const tableBody = document.getElementById('recentSalesTable');

            tableBody.innerHTML = response.data.map(sale => `
                <tr>
                    <td><strong>${sale.invoice_number}</strong></td>
                    <td>${formatDate(sale.sale_date)}</td>
                    <td>${sale.customer_name || 'Walk-in'}</td>
                    <td><strong>${formatCurrency(sale.total_amount)}</strong></td>
                    <td><span class="badge badge-${getPaymentBadge(sale.payment_method)}">${sale.payment_method}</span></td>
                    <td>${sale.cashier_name}</td>
                </tr>
            `).join('');

            if (salesPagination && response.pagination) {
                salesPagination.update({
                    page: response.pagination.page,
                    limit: response.pagination.limit,
                    total: response.pagination.totalItems || response.pagination.total,
                    totalPages: response.pagination.totalPages
                });
            }
        } else {
            document.getElementById('recentSalesTable').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">No recent sales</td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Error loading recent sales:', error);
        document.getElementById('recentSalesTable').innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger">Error loading sales</td>
            </tr>
        `;
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES'
    }).format(amount || 0);
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function getPaymentBadge(method) {
    const badges = {
        'Cash': 'success',
        'Card': 'info',
        'Bank Transfer': 'secondary',
        'Credit': 'warning'
    };
    return badges[method] || 'secondary';
}
