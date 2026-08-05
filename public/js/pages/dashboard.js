/**
 * Dashboard Page Module
 * Loaded dynamically by app shell router
 */

import api from '../api.js';
import Pagination from '../pagination.js';

let salesPagination = null;

export async function initDashboard() {
    // Initialize pagination for sales table
    salesPagination = new Pagination('salesPaginationContainer', {
        itemsPerPage: 5,
        onPageChange: (page) => {
            loadRecentSales(page);
        }
    });

    // Load dashboard data
    await loadDashboardMetrics();
    await loadRecentSales(1);
}

async function loadDashboardMetrics() {
    try {
        const response = await api.reports.dashboard();

        if (response.success) {
            const { todaySales, lowStockCount, pendingPOsCount } = response.data;

            document.getElementById('todaySales').textContent = formatCurrency(todaySales);
            document.getElementById('lowStock').textContent = lowStockCount;
            document.getElementById('pendingPOs').textContent = pendingPOsCount;
        }
    } catch (error) {
        console.error('Error loading metrics:', error);
    }
}

async function loadRecentSales(page = 1) {
    try {
        const { limit } = salesPagination ? salesPagination.getState() : { limit: 5 };

        const params = {
            page: page,
            limit: limit
        };

        const response = await api.get('/sales', { params });

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

// Default export for router
export default initDashboard;
