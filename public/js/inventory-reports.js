/**
 * Enterprise Inventory Reports functionality
 * Telemetry, visual health indicators, and instant multi-attribute filtering.
 */

import auth from './auth.js';
import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import messageModal from './message-modal.js';

// Global state for reports
let rawCurrentStockData = [];
let rawLowStockData = [];
let categoriesList = [];

export default async function init() {
    // Check authentication
    if (!(await auth.requireAuth())) {
        return;
    }

    // Initialize UI listeners and controls
    setupTabSwitching();
    setupFilterListeners();

    // Fetch categories and initial reports automatically
    try {
        await loadCategories();
        await refreshAllReports();
    } catch (error) {
        console.error('Initialization error in inventory reports:', error);
    }
}

/**
 * Load Categories for Filter Dropdowns
 */
async function loadCategories() {
    try {
        const response = await api.categories.getAll();
        if (response.success) {
            categoriesList = response.data || [];
            populateCategoryDropdowns(categoriesList);
        }
    } catch (error) {
        console.error('Error fetching categories for report filter:', error);
    }
}

function populateCategoryDropdowns(categories) {
    const stockCatSelect = document.getElementById('stockCategoryFilter');
    const lowCatSelect = document.getElementById('lowStockCategoryFilter');

    const optionsHtml = '<option value="">All Categories</option>' + 
        categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    if (stockCatSelect) stockCatSelect.innerHTML = optionsHtml;
    if (lowCatSelect) lowCatSelect.innerHTML = optionsHtml;
}

/**
 * Tab Switching Logic
 */
function setupTabSwitching() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = '#f1f5f9';
                t.style.color = '#64748b';
                t.style.border = '1px solid #cbd5e1';
                t.style.boxShadow = 'none';
                t.style.fontWeight = '600';
                const icon = t.querySelector('i');
                if (icon) {
                    if (t.dataset.tab === 'lowStock') icon.style.color = '#f59e0b';
                    else icon.style.color = '#64748b';
                }
            });

            tab.classList.add('active');
            tab.style.background = 'linear-gradient(135deg, #041710 0%, #0e4a35 100%)';
            tab.style.color = '#ffffff';
            tab.style.border = 'none';
            tab.style.boxShadow = '0 4px 14px rgba(14, 74, 53, 0.3)';
            tab.style.fontWeight = '700';

            const activeIcon = tab.querySelector('i');
            if (activeIcon) {
                if (tab.dataset.tab === 'currentStock') activeIcon.style.color = '#a3e635';
                else if (tab.dataset.tab === 'lowStock') activeIcon.style.color = '#fbbf24';
            }

            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));

            const targetId = tab.dataset.tab + 'Tab';
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}


/**
 * Filter Input Listeners
 */
function setupFilterListeners() {
    // Current Stock Filters
    const stockSearch = document.getElementById('stockSearchInput');
    const stockCategory = document.getElementById('stockCategoryFilter');
    const stockStatus = document.getElementById('stockStatusFilter');

    if (stockSearch) stockSearch.addEventListener('input', applyCurrentStockFilters);
    if (stockCategory) stockCategory.addEventListener('change', applyCurrentStockFilters);
    if (stockStatus) stockStatus.addEventListener('change', applyCurrentStockFilters);

    // Low Stock Filters
    const lowSearch = document.getElementById('lowStockSearchInput');
    const lowCategory = document.getElementById('lowStockCategoryFilter');

    if (lowSearch) lowSearch.addEventListener('input', applyLowStockFilters);
    if (lowCategory) lowCategory.addEventListener('change', applyLowStockFilters);

    // Global Refresh Button
    const refreshBtn = document.getElementById('refreshReportBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await refreshAllReports(true);
        });
    }
}

/**
 * Fetch fresh data for both reports
 */
async function refreshAllReports(isManualRefresh = false) {
    loadingScreen.show('Gathering inventory telemetry...');
    try {
        await Promise.all([
            fetchCurrentStockData(),
            fetchLowStockData()
        ]);
        if (isManualRefresh) {
            messageModal.success('Inventory reports and stock telemetry updated successfully.', 'Data Refreshed');
        }
    } catch (error) {
        console.error('Error loading inventory reports:', error);
        if (isManualRefresh) {
            messageModal.error('Failed to refresh inventory reports: ' + error.message, 'Refresh Error');
        } else {
            toast.error('Failed to load reports: ' + error.message);
        }
    } finally {
        await loadingScreen.hide();
    }
}

/**
 * Fetch Current Stock Data from API
 */
async function fetchCurrentStockData() {
    const response = await fetch('/api/reports/current-stock', { credentials: 'include' });
    const data = await response.json();
    if (!data.success) throw new Error(data.message);

    rawCurrentStockData = data.data || [];
    applyCurrentStockFilters();
}

/**
 * Fetch Low Stock Data from API
 */
async function fetchLowStockData() {
    const response = await fetch('/api/reports/low-stock', { credentials: 'include' });
    const data = await response.json();
    if (!data.success) throw new Error(data.message);

    rawLowStockData = data.data || [];
    applyLowStockFilters();
}

/**
 * Filter & Render Current Stock
 */
function applyCurrentStockFilters() {
    const search = (document.getElementById('stockSearchInput')?.value || '').toLowerCase().trim();
    const category = document.getElementById('stockCategoryFilter')?.value || '';
    const status = document.getElementById('stockStatusFilter')?.value || '';

    const filtered = rawCurrentStockData.filter(item => {
        const matchesSearch = !search || 
            (item.code && item.code.toLowerCase().includes(search)) ||
            (item.name && item.name.toLowerCase().includes(search));

        const matchesCategory = !category || item.category_name === category;
        const matchesStatus = !status || item.status === status;

        return matchesSearch && matchesCategory && matchesStatus;
    });

    renderCurrentStockReport(filtered, rawCurrentStockData);
}

/**
 * Filter & Render Low Stock
 */
function applyLowStockFilters() {
    const search = (document.getElementById('lowStockSearchInput')?.value || '').toLowerCase().trim();
    const category = document.getElementById('lowStockCategoryFilter')?.value || '';

    const filtered = rawLowStockData.filter(item => {
        const matchesSearch = !search || 
            (item.code && item.code.toLowerCase().includes(search)) ||
            (item.name && item.name.toLowerCase().includes(search));

        const matchesCategory = !category || item.category_name === category;

        return matchesSearch && matchesCategory;
    });

    renderLowStockReport(filtered, rawLowStockData);
}

/**
 * Visual Health Progress Meter Builder
 */
function buildStockHealthMeter(shopStock, reorderLevel) {
    const stock = parseFloat(shopStock || 0);
    const reorder = parseFloat(reorderLevel || 0);

    let percent = 100;
    let barColor = '#10b981'; // Green
    let label = 'Optimal';

    if (stock === 0) {
        percent = 0;
        barColor = '#ef4444'; // Red
        label = 'Depleted';
    } else if (reorder > 0) {
        // Scale metric based on reorder level (100% = 2x reorder point)
        const ratio = stock / (reorder * 2);
        percent = Math.min(Math.max(Math.round(ratio * 100), 10), 100);

        if (stock <= reorder) {
            barColor = '#f59e0b'; // Amber
            label = 'Low Stock';
        }
    }

    return `
        <div style="display: flex; flex-direction: column; gap: 0.25rem; min-width: 120px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748b; font-weight: 500;">
                <span>${label}</span>
                <span>${stock} / ${reorder || 'N/A'}</span>
            </div>
            <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${percent}%; height: 100%; background: ${barColor}; transition: width 0.3s ease;"></div>
            </div>
        </div>
    `;
}

/**
 * Render Current Stock Report Table & Summary Cards
 */
function renderCurrentStockReport(items, fullDataset = items) {
    const table = document.getElementById('currentStockTable');
    const resultCountEl = document.getElementById('currentStockResultCount');

    // Calculate metrics based on total available dataset vs filtered
    const totalItems = fullDataset.length;
    const totalValuation = fullDataset.reduce((sum, item) => sum + parseFloat(item.stock_value || 0), 0);
    const lowStockCount = fullDataset.filter(item => item.status === 'Low Stock').length;
    const outOfStockCount = fullDataset.filter(item => item.status === 'Out of Stock').length;

    // Update KPI Cards
    const valEl = document.getElementById('totalStockValue');
    const itemsEl = document.getElementById('totalItemsCount');
    const lowEl = document.getElementById('lowStockItemsCount');
    const outEl = document.getElementById('outOfStockCount');

    if (valEl) valEl.textContent = `KSh ${totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (itemsEl) itemsEl.textContent = totalItems;
    if (lowEl) lowEl.textContent = lowStockCount;
    if (outEl) outEl.textContent = outOfStockCount;

    if (resultCountEl) {
        resultCountEl.textContent = `Showing ${items.length} of ${totalItems} SKUs`;
    }

    if (items.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 3rem; color: #64748b;">
                    <i class="fas fa-search" style="font-size: 2rem; color: #94a3b8; margin-bottom: 0.5rem;"></i><br>
                    <strong>No stock items match your search criteria</strong><br>
                    Try resetting category or search query filters.
                </td>
            </tr>
        `;
        return;
    }

    table.innerHTML = items.map(item => {
        let statusBadgeClass = 'background: #dcfce7; color: #166534;'; // Success green
        if (item.status === 'Out of Stock') {
            statusBadgeClass = 'background: #fee2e2; color: #991b1b;'; // Danger red
        } else if (item.status === 'Low Stock') {
            statusBadgeClass = 'background: #fef3c7; color: #92400e;'; // Warning amber
        }

        const stockVal = parseFloat(item.stock_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const healthMeter = buildStockHealthMeter(item.shop_stock, item.reorder_level);

        return `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding: 0.85rem 1rem;">
                    <span style="font-family: monospace; font-weight: 700; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px; color: #0f172a;">
                        ${item.code}
                    </span>
                </td>
                <td style="padding: 0.85rem 1rem; font-weight: 600; color: #1e293b;">${item.name}</td>
                <td style="padding: 0.85rem 1rem;">
                    <span style="background: #e0f2fe; color: #0369a1; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 12px; font-weight: 600;">
                        ${item.category_name}
                    </span>
                </td>
                <td style="padding: 0.85rem 1rem; color: #64748b;">${item.unit_of_measure || 'N/A'}</td>
                <td style="padding: 0.85rem 1rem;">${healthMeter}</td>
                <td style="padding: 0.85rem 1rem; text-align: right; font-weight: 700; color: ${item.shop_stock === 0 ? '#ef4444' : '#0f172a'};">
                    ${item.shop_stock}
                </td>
                <td style="padding: 0.85rem 1rem; text-align: right; font-weight: 700; color: #0284c7;">KSh ${stockVal}</td>
                <td style="padding: 0.85rem 1rem; text-align: center;">
                    <span style="display: inline-block; font-size: 0.75rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 20px; ${statusBadgeClass}">
                        ${item.status}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Render Low Stock Report Table & Summary Cards
 */
function renderLowStockReport(items, fullDataset = items) {
    const table = document.getElementById('lowStockTable');
    const resultCountEl = document.getElementById('lowStockResultCount');

    const totalLowStock = fullDataset.length;
    const outOfStockCount = fullDataset.filter(item => item.status === 'Out of Stock').length;
    const criticalCount = fullDataset.filter(item => (item.shop_stock || 0) === 0).length;

    const countEl = document.getElementById('lowStockCount');
    const outOfStockEl = document.getElementById('outOfStockItemsCount');
    const criticalEl = document.getElementById('criticalItemsCount');

    if (countEl) countEl.textContent = totalLowStock;
    if (outOfStockEl) outOfStockEl.textContent = outOfStockCount;
    if (criticalEl) criticalEl.textContent = criticalCount;

    if (resultCountEl) {
        resultCountEl.textContent = `Showing ${items.length} of ${totalLowStock} low stock items`;
    }

    if (items.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 3rem; color: #10b981;">
                    <i class="fas fa-check-circle" style="font-size: 2.5rem; margin-bottom: 0.75rem; color: #10b981;"></i><br>
                    <strong style="font-size: 1.1rem; color: #065f46;">All Finished Goods Stocks are Optimal!</strong><br>
                    <span style="color: #64748b;">No items are currently at or below their reorder points.</span>
                </td>
            </tr>
        `;
        return;
    }

    table.innerHTML = items.map(item => {
        let statusBadgeClass = 'background: #fef3c7; color: #92400e;'; // Low stock amber
        if (item.status === 'Out of Stock') {
            statusBadgeClass = 'background: #fee2e2; color: #991b1b;'; // Out of stock red
        }

        const healthMeter = buildStockHealthMeter(item.shop_stock, item.reorder_level);

        return `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding: 0.85rem 1rem;">
                    <span style="font-family: monospace; font-weight: 700; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px; color: #0f172a;">
                        ${item.code}
                    </span>
                </td>
                <td style="padding: 0.85rem 1rem; font-weight: 600; color: #1e293b;">${item.name}</td>
                <td style="padding: 0.85rem 1rem;">
                    <span style="background: #e0f2fe; color: #0369a1; font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 12px; font-weight: 600;">
                        ${item.category_name}
                    </span>
                </td>
                <td style="padding: 0.85rem 1rem; color: #64748b;">${item.unit_of_measure || 'N/A'}</td>
                <td style="padding: 0.85rem 1rem;">${healthMeter}</td>
                <td style="padding: 0.85rem 1rem; text-align: right; color: #64748b; font-weight: 600;">${item.reorder_level}</td>
                <td style="padding: 0.85rem 1rem; text-align: right; font-weight: 700; color: ${item.shop_stock === 0 ? '#ef4444' : '#d97706'};">
                    ${item.shop_stock}
                </td>
                <td style="padding: 0.85rem 1rem; text-align: center;">
                    <span style="display: inline-block; font-size: 0.75rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 20px; ${statusBadgeClass}">
                        ${item.status}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// Global Export Wrappers
async function generateCurrentStockReport() {
    await fetchCurrentStockData();
}

async function generateLowStockReport() {
    await fetchLowStockData();
}

async function exportSectionToJPEG(sectionId, sectionName) {
    const section = document.getElementById(sectionId);
    if (!section) {
        toast.error('Section not found');
        return;
    }

    if (typeof html2canvas === 'undefined') {
        toast.error('Export library html2canvas not loaded. Please refresh.');
        return;
    }

    try {
        toast.info('Generating high-res report image...');
        const exportButtons = section.querySelectorAll('button');
        exportButtons.forEach(btn => btn.style.visibility = 'hidden');

        const canvas = await html2canvas(section, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true
        });

        exportButtons.forEach(btn => btn.style.visibility = 'visible');

        canvas.toBlob(function (blob) {
            const filename = `${sectionName}_${new Date().toISOString().split('T')[0]}.jpg`;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            messageModal.success(`${sectionName.replace(/_/g, ' ')} exported to JPEG!`);
        }, 'image/jpeg', 0.95);

    } catch (error) {
        console.error('Export error:', error);
        toast.error('Failed to export section to JPEG');
    }
}

async function exportCurrentStockToExcel() {
    if (rawCurrentStockData.length === 0) {
        toast.error('No stock data available to export');
        return;
    }

    if (typeof ExcelJS === 'undefined') {
        toast.error('Excel library not loaded.');
        return;
    }

    try {
        toast.info('Generating Excel workbook...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Current Stock Report');

        worksheet.columns = [
            { header: 'Code', key: 'code', width: 15 },
            { header: 'Item Name', key: 'name', width: 32 },
            { header: 'Category', key: 'category', width: 22 },
            { header: 'UOM', key: 'uom', width: 12 },
            { header: 'Shop Stock', key: 'stock', width: 14 },
            { header: 'Reorder Point', key: 'reorder', width: 16 },
            { header: 'Asset Valuation', key: 'value', width: 18 },
            { header: 'Status', key: 'status', width: 16 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        rawCurrentStockData.forEach(item => {
            worksheet.addRow({
                code: item.code,
                name: item.name,
                category: item.category_name,
                uom: item.unit_of_measure || 'N/A',
                stock: parseFloat(item.shop_stock || 0),
                reorder: parseFloat(item.reorder_level || 0),
                value: parseFloat(item.stock_value || 0),
                status: item.status
            });
        });

        worksheet.getColumn('stock').numFmt = '#,##0';
        worksheet.getColumn('reorder').numFmt = '#,##0';
        worksheet.getColumn('value').numFmt = '#,##0.00';

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const filename = `Current_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        messageModal.success('Current Stock Report exported to Excel!');
    } catch (error) {
        console.error('Excel export error:', error);
        toast.error('Failed to export to Excel: ' + error.message);
    }
}

async function exportLowStockToExcel() {
    if (rawLowStockData.length === 0) {
        toast.error('No low stock data available to export');
        return;
    }

    if (typeof ExcelJS === 'undefined') {
        toast.error('Excel library not loaded.');
        return;
    }

    try {
        toast.info('Generating Excel workbook...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Low Stock Report');

        worksheet.columns = [
            { header: 'Code', key: 'code', width: 15 },
            { header: 'Item Name', key: 'name', width: 32 },
            { header: 'Category', key: 'category', width: 22 },
            { header: 'UOM', key: 'uom', width: 12 },
            { header: 'Reorder Level', key: 'reorder', width: 16 },
            { header: 'Current Stock', key: 'stock', width: 16 },
            { header: 'Status', key: 'status', width: 16 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        rawLowStockData.forEach(item => {
            worksheet.addRow({
                code: item.code,
                name: item.name,
                category: item.category_name,
                uom: item.unit_of_measure || 'N/A',
                reorder: parseFloat(item.reorder_level || 0),
                stock: parseFloat(item.shop_stock || 0),
                status: item.status
            });
        });

        worksheet.getColumn('stock').numFmt = '#,##0';
        worksheet.getColumn('reorder').numFmt = '#,##0';

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const filename = `Low_Stock_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        messageModal.success('Low Stock Report exported to Excel!');
    } catch (error) {
        console.error('Excel export error:', error);
        toast.error('Failed to export to Excel: ' + error.message);
    }
}

// Bind globals for inline HTML onClick handlers
window.exportSectionToJPEG = exportSectionToJPEG;
window.generateLowStockReport = generateLowStockReport;
window.generateCurrentStockReport = generateCurrentStockReport;
window.exportCurrentStockToExcel = exportCurrentStockToExcel;
window.exportLowStockToExcel = exportLowStockToExcel;
