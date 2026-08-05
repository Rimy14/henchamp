import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import auth from './auth.js';
import messageModal from './message-modal.js';

let availableCostCategories = [];
let currentCategoryFilter = 'all';
let currentCategorySearch = '';

export default async function init() {
    const addCostBtn = document.getElementById('add-cost-btn');
    const modal = document.getElementById('add-cost-modal');
    const form = document.getElementById('add-cost-form');
    const monthFilter = document.getElementById('month-filter');

    // Set default month to current month
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM
    if (monthFilter) {
        monthFilter.value = currentMonth;
        monthFilter.addEventListener('change', loadCosts);
    }

    const dateInput = document.getElementById('cost-date');
    if (dateInput) {
        dateInput.max = new Date().toISOString().split('T')[0];
    }

    if (addCostBtn) {
        addCostBtn.addEventListener('click', () => {
            if (modal) {
                modal.style.display = 'block';
                if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
                document.getElementById('cost-name')?.focus();
            }
        });
    }

    // Modal close handlers
    document.querySelectorAll('.close-btn, .close-btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal') || btn.closest('.modal')?.id;
            if (modalId) {
                const targetModal = document.getElementById(modalId);
                if (targetModal) targetModal.style.display = 'none';
            }
        });
    });

    // Save Monthly Cost Form submission
    if (form) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const costName = document.getElementById('cost-name').value.trim();
            const costAmount = parseFloat(document.getElementById('cost-amount').value);
            const costDate = document.getElementById('cost-date').value;
            const categorySelect = document.getElementById('cost-category');
            
            const selectedOption = categorySelect?.options[categorySelect.selectedIndex];
            const categoryId = selectedOption?.value || null;
            const categoryName = selectedOption?.getAttribute('data-name') || null;

            if (!costName || !costAmount) {
                messageModal.warning('Cost name and amount are required');
                return;
            }

            loadingScreen.show('Saving monthly cost...');
            try {
                const res = await api.post('/monthly-costs', {
                    name: costName,
                    amount: costAmount,
                    date: costDate,
                    category_id: categoryId,
                    category: categoryName
                });

                if (res.success) {
                    messageModal.success('Monthly cost recorded successfully');
                    if (modal) modal.style.display = 'none';
                    form.reset();
                    await loadCosts();
                } else {
                    messageModal.error(res.message || 'Failed to record cost');
                }
            } catch (error) {
                messageModal.error('Error saving cost: ' + (error.message || 'Server error'));
            } finally {
                loadingScreen.hide();
            }
        });
    }

    // Void Cost Form Submit
    const voidForm = document.getElementById('void-cost-form');
    const voidModal = document.getElementById('void-cost-modal');
    if (voidForm) {
        voidForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('void-cost-id').value;
            const reason = document.getElementById('void-cost-reason').value.trim();

            if (!reason) {
                messageModal.warning('Reason for voiding is required');
                return;
            }

            loadingScreen.show('Voiding monthly cost...');
            try {
                const res = await api.patch(`/monthly-costs/void/${id}`, { void_reason: reason });
                if (res.success) {
                    messageModal.success('Monthly cost voided successfully');
                    if (voidModal) voidModal.style.display = 'none';
                    voidForm.reset();
                    await loadCosts();
                } else {
                    messageModal.error(res.message || 'Failed to void cost');
                }
            } catch (err) {
                messageModal.error('Error voiding cost: ' + (err.message || 'Server error'));
            } finally {
                loadingScreen.hide();
            }
        });
    }

    // Category Management Listeners
    setupCategoryEventListeners();

    // Initial data loading
    await loadCostCategories();
    await loadCosts();
}

/**
 * Load categories from backend
 */
async function loadCostCategories() {
    try {
        const res = await api.get('/monthly-costs/categories?include_inactive=true');
        if (res.success) {
            availableCostCategories = res.data || [];
            renderCostCategoryOptions();
            renderCostCategoryTable();
        }
    } catch (err) {
        console.error('Error loading monthly cost categories:', err);
    }
}

/**
 * Render select options into Add Cost form
 */
function renderCostCategoryOptions(selectedId = null) {
    const select = document.getElementById('cost-category');
    if (!select) return;

    const activeCategories = availableCostCategories.filter(c => Boolean(c.is_active));
    
    if (activeCategories.length === 0) {
        select.innerHTML = '<option value="">General Overhead (No active categories)</option>';
        return;
    }

    select.innerHTML = activeCategories.map(cat => `
        <option value="${cat.id}" data-name="${cat.name}">${cat.name}</option>
    `).join('');

    if (selectedId) {
        select.value = selectedId;
    }
}

/**
 * Render category management directory table
 */
function renderCostCategoryTable() {
    const tableBody = document.getElementById('cost-categories-table-body');
    if (!tableBody) return;

    const totalCount = availableCostCategories.length;
    const activeCount = availableCostCategories.filter(c => Boolean(c.is_active)).length;
    const inactiveCount = totalCount - activeCount;

    const totalElem = document.getElementById('cost-cat-stat-total');
    const activeElem = document.getElementById('cost-cat-stat-active');
    const inactiveElem = document.getElementById('cost-cat-stat-inactive');

    if (totalElem) totalElem.textContent = totalCount;
    if (activeElem) activeElem.textContent = activeCount;
    if (inactiveElem) inactiveElem.textContent = inactiveCount;

    let filtered = availableCostCategories;
    if (currentCategorySearch.trim()) {
        const q = currentCategorySearch.toLowerCase().trim();
        filtered = filtered.filter(c =>
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.description && c.description.toLowerCase().includes(q))
        );
    }

    if (currentCategoryFilter === 'active') {
        filtered = filtered.filter(c => Boolean(c.is_active));
    } else if (currentCategoryFilter === 'inactive') {
        filtered = filtered.filter(c => !Boolean(c.is_active));
    }

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 3rem 1.5rem; color: #94a3b8;">
                    <div style="width: 48px; height: 48px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: inline-flex; align-items: center; justify-content: center; font-size: 1.35rem; margin-bottom: 0.65rem;">
                        <i class="fas fa-tags"></i>
                    </div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: #334155;">No cost categories found</div>
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.2rem;">
                        ${currentCategorySearch ? 'No match found for "' + currentCategorySearch + '"' : 'Try switching filter tabs or create a new category.'}
                    </div>
                </td>
            </tr>`;
        return;
    }

    const currentUser = auth.getCurrentUser();
    const canToggle = ['Admin', 'Coordinator'].includes(currentUser?.role);

    tableBody.innerHTML = filtered.map(cat => {
        const isActive = Boolean(cat.is_active);
        const statusBadge = isActive
            ? `<span style="background: rgba(16, 185, 129, 0.1); color: #047857; border: 1px solid rgba(16, 185, 129, 0.25); font-weight: 700; padding: 0.28rem 0.7rem; border-radius: 20px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                    <i class="fas fa-circle" style="font-size: 0.45rem; color: #10b981;"></i> Active
               </span>`
            : `<span style="background: rgba(107, 114, 128, 0.1); color: #4b5563; border: 1px solid rgba(107, 114, 128, 0.25); font-weight: 700; padding: 0.28rem 0.7rem; border-radius: 20px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                    <i class="fas fa-power-off" style="font-size: 0.65rem;"></i> Inactive
               </span>`;

        const actionBtn = isActive
            ? `<button type="button" class="toggle-cost-cat-btn" data-id="${cat.id}" data-action="deactivate" style="background: #ffffff; border: 1px solid #cbd5e1; color: #475569; font-weight: 600; font-size: 0.775rem; border-radius: 8px; padding: 0.35rem 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; transition: all 0.2s ease;">
                    <i class="fas fa-toggle-on" style="color: #10b981; font-size: 0.95rem;"></i> Deactivate
               </button>`
            : `<button type="button" class="toggle-cost-cat-btn" data-id="${cat.id}" data-action="activate" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); color: #047857; font-weight: 600; font-size: 0.775rem; border-radius: 8px; padding: 0.35rem 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; transition: all 0.2s ease;">
                    <i class="fas fa-toggle-off" style="font-size: 0.95rem;"></i> Activate
               </button>`;

        return `
            <tr style="border-bottom: 1px solid #f1f5f9; opacity: ${isActive ? '1' : '0.65'}; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="font-weight: 600; padding: 0.85rem 1.15rem; color: #0f172a;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, rgba(14, 74, 53, 0.1), rgba(132, 204, 22, 0.15)); color: #0e4a35; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; border: 1px solid rgba(14, 74, 53, 0.15);">
                            <i class="fas fa-tag"></i>
                        </div>
                        <span style="font-size: 0.875rem;">${cat.name}</span>
                    </div>
                </td>
                <td style="color: #64748b; font-size: 0.835rem; padding: 0.85rem 1.15rem;">${cat.description || '<span style="color: #cbd5e1; font-style: italic;">No description provided</span>'}</td>
                <td style="text-align: center; padding: 0.85rem 1.15rem;">${statusBadge}</td>
                <td style="text-align: center; padding: 0.85rem 1.15rem;">${canToggle ? actionBtn : '—'}</td>
            </tr>
        `;
    }).join('');

    // Wire toggle status buttons
    document.querySelectorAll('.toggle-cost-cat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const action = btn.getAttribute('data-action');

            loadingScreen.show(`${action === 'deactivate' ? 'Deactivating' : 'Activating'} category...`);
            try {
                const res = await api.patch(`/monthly-costs/categories/toggle/${id}`);
                if (res.success) {
                    messageModal.success(res.message);
                    await loadCostCategories();
                } else {
                    messageModal.error(res.message || 'Failed to update status');
                }
            } catch (err) {
                messageModal.error('Error updating status');
            } finally {
                loadingScreen.hide();
            }
        });
    });
}

function setupCategoryEventListeners() {
    const manageCatBtn = document.getElementById('manage-cost-categories-btn');
    const manageCatModal = document.getElementById('manage-cost-categories-modal');
    if (manageCatBtn) {
        manageCatBtn.addEventListener('click', () => {
            renderCostCategoryTable();
            if (manageCatModal) manageCatModal.style.display = 'block';
        });
    }

    const searchInput = document.getElementById('cost-cat-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentCategorySearch = e.target.value;
            renderCostCategoryTable();
        });
    }

    document.querySelectorAll('.cost-cat-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cost-cat-filter-tab').forEach(t => {
                t.style.background = 'transparent';
                t.style.color = '#64748b';
                t.style.boxShadow = 'none';
                t.style.fontWeight = '600';
            });
            tab.style.background = '#ffffff';
            tab.style.color = '#0f172a';
            tab.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            tab.style.fontWeight = '700';

            currentCategoryFilter = tab.getAttribute('data-filter') || 'all';
            renderCostCategoryTable();
        });
    });

    const openAddCatBtn = document.getElementById('open-add-cost-cat-btn');
    const quickAddCatBtn = document.getElementById('quick-add-cost-cat-btn');
    const inlineCard = document.getElementById('inline-add-cost-cat-card');
    const closeInlineBtn = document.getElementById('close-inline-cost-cat-btn');
    const cancelInlineBtn = document.getElementById('cancel-inline-cost-cat-btn');

    const toggleInlineCard = (show) => {
        if (!inlineCard) return;
        inlineCard.style.display = show ? 'block' : 'none';
        if (show) document.getElementById('inline-cost-cat-name')?.focus();
    };

    if (openAddCatBtn) {
        openAddCatBtn.addEventListener('click', () => {
            const isHidden = inlineCard?.style.display === 'none';
            toggleInlineCard(isHidden);
        });
    }

    if (quickAddCatBtn) {
        quickAddCatBtn.addEventListener('click', () => {
            if (manageCatModal) manageCatModal.style.display = 'block';
            toggleInlineCard(true);
        });
    }

    if (closeInlineBtn) closeInlineBtn.addEventListener('click', () => toggleInlineCard(false));
    if (cancelInlineBtn) cancelInlineBtn.addEventListener('click', () => toggleInlineCard(false));

    const inlineForm = document.getElementById('inline-add-cost-cat-form');
    if (inlineForm) {
        inlineForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('inline-cost-cat-name').value.trim();
            const description = document.getElementById('inline-cost-cat-desc').value.trim();

            if (!name) {
                messageModal.warning('Category name is required');
                return;
            }

            loadingScreen.show('Creating category...');
            try {
                const res = await api.post('/monthly-costs/categories', { name, description });
                if (res.success) {
                    messageModal.success('Category created successfully');
                    document.getElementById('inline-cost-cat-name').value = '';
                    document.getElementById('inline-cost-cat-desc').value = '';
                    toggleInlineCard(false);
                    await loadCostCategories();
                    renderCostCategoryOptions(res.data?.id);
                } else {
                    messageModal.error(res.message || 'Failed to create category');
                }
            } catch (err) {
                messageModal.error('Error creating category: ' + (err.message || 'Server error'));
            } finally {
                loadingScreen.hide();
            }
        });
    }
}

async function loadCosts() {
    loadingScreen.show('Loading monthly costs...');
    try {
        const monthFilter = document.getElementById('month-filter');
        let query = '';
        let displayDate = new Date();

        if (monthFilter && monthFilter.value) {
            const [year, month] = monthFilter.value.split('-');
            query = `?month=${month}&year=${year}`;
            displayDate = new Date(year, month - 1);
        }

        const monthDisplay = document.getElementById('current-month-display');
        if (monthDisplay) {
            monthDisplay.textContent = displayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        const response = await api.get(`/monthly-costs${query}`);
        if (response.success) {
            renderCosts(response.data || []);
            updateTotal(response.data || []);
        }
    } catch (error) {
        toast.error('Failed to load costs');
        console.error(error);
    } finally {
        loadingScreen.hide();
    }
}

function updateTotal(costs) {
    const totalEl = document.getElementById('total-cost-display');
    if (!totalEl) return;

    // Filter out voided costs from total sum
    const activeCosts = costs.filter(c => !Boolean(c.is_voided));
    const total = activeCosts.reduce((sum, cost) => sum + parseFloat(cost.amount || 0), 0);
    totalEl.textContent = `KSh ${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderCosts(costs) {
    const tbody = document.getElementById('costs-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (costs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 3rem 1.5rem; color: #94a3b8;">
                    <div style="width: 48px; height: 48px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: inline-flex; align-items: center; justify-content: center; font-size: 1.35rem; margin-bottom: 0.65rem;">
                        <i class="fas fa-wallet"></i>
                    </div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: #334155;">No monthly costs recorded for this month</div>
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.2rem;">Click "Record Monthly Cost" above to log operational overheads.</div>
                </td>
            </tr>`;
        return;
    }

    const currentUser = auth.getCurrentUser();
    const canVoid = ['Admin', 'Coordinator'].includes(currentUser?.role);

    costs.forEach(cost => {
        const date = new Date(cost.created_at);
        const categoryName = cost.display_category || cost.category || 'General Overhead';
        const isVoided = Boolean(cost.is_voided);

        const titleCell = isVoided
            ? `<div style="display: flex; align-items: center; gap: 0.4rem;">
                    <span style="text-decoration: line-through; color: #94a3b8; font-weight: 600;">${cost.name}</span>
                    <span title="Reason: ${cost.void_reason || 'N/A'} (Voided by ${cost.voided_by || 'Admin'})" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25); font-weight: 700; padding: 0.18rem 0.55rem; border-radius: 12px; font-size: 0.675rem; cursor: help;">
                        <i class="fas fa-ban"></i> VOIDED
                    </span>
               </div>`
            : `<span style="font-weight: 600; color: #0f172a;">${cost.name}</span>`;

        const amountCell = isVoided
            ? `<span style="text-decoration: line-through; color: #94a3b8; font-weight: 700;">KSh ${parseFloat(cost.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
            : `KSh ${parseFloat(cost.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const actionCell = isVoided
            ? `<span style="color: #94a3b8; font-size: 0.775rem; font-style: italic;">Voided</span>`
            : (canVoid ? `<button type="button" class="void-cost-btn" data-id="${cost.id}" data-name="${cost.name}" style="background: #ffffff; border: 1px solid #fca5a5; color: #dc2626; font-weight: 600; font-size: 0.775rem; border-radius: 8px; padding: 0.32rem 0.65rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; transition: all 0.2s ease;">
                    <i class="fas fa-ban"></i> Void
               </button>` : '—');

        const row = `
            <tr style="border-bottom: 1px solid #f1f5f9; opacity: ${isVoided ? '0.6' : '1'}; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding: 0.9rem 1.25rem;">${titleCell}</td>
                <td style="padding: 0.9rem 1.25rem;">
                    <span style="background: rgba(14, 74, 53, 0.08); color: #0e4a35; border: 1px solid rgba(14, 74, 53, 0.2); font-weight: 600; padding: 0.28rem 0.75rem; border-radius: 20px; font-size: 0.775rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                        <i class="fas fa-tag" style="font-size: 0.7rem;"></i> ${categoryName}
                    </span>
                </td>
                <td style="color: #64748b; font-size: 0.85rem; text-align: center; padding: 0.9rem 1.25rem;">${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td style="text-align: right; font-weight: 800; font-size: 0.95rem; color: #0f172a; padding: 0.9rem 1.25rem;">${amountCell}</td>
                <td style="text-align: center; padding: 0.9rem 1.25rem;">${actionCell}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    // Wire Void buttons
    document.querySelectorAll('.void-cost-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const voidModal = document.getElementById('void-cost-modal');
            if (voidModal) {
                document.getElementById('void-cost-id').value = id;
                document.getElementById('void-cost-reason').value = '';
                voidModal.style.display = 'block';
                document.getElementById('void-cost-reason')?.focus();
            }
        });
    });
}
