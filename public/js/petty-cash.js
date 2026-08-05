import api from './api.js';
import loadingScreen from './loading-screen.js';
import toast from './toast.js';
import auth from './auth.js';
import messageModal from './message-modal.js';
import Pagination from './pagination.js';

let activeFund = null;
let currentUser = null;
let pagination = null;
let allTransactions = [];
let availableCategories = [];

export default async function init() {
    currentUser = auth.getCurrentUser();
    
    // Initialize Pagination
    pagination = new Pagination('paginationContainer', {
        itemsPerPage: 10,
        onPageChange: (page) => {
            renderCurrentPage();
        }
    });

    setupEventListeners();
    await loadCategories();
    await checkFundStatus();
}

/**
 * Load categories from backend (including inactive for management view)
 */
async function loadCategories() {
    try {
        const res = await api.get('/petty-cash/categories?include_inactive=true');
        if (res.success) {
            availableCategories = res.data || [];
            renderCategoryOptions();
        }
    } catch (err) {
        console.error('Error loading petty cash categories:', err);
    }
}

/**
 * Render category options into select dropdown & manage table
 */
function renderCategoryOptions(selectedCategoryName = null) {
    const select = document.getElementById('tx-category');
    if (select) {
        const activeCategories = availableCategories.filter(c => Boolean(c.is_active));
        select.innerHTML = activeCategories.map(cat => `
            <option value="${cat.name}">${cat.name}</option>
        `).join('');

        if (selectedCategoryName) {
            select.value = selectedCategoryName;
        }
    }

    renderCategoryTable();
}

/**
 * Render category management table with Activate/Deactivate toggles & dynamic stats
 */
function renderCategoryTable() {
    const tableBody = document.getElementById('categories-table-body');
    if (!tableBody) return;

    // Update stats counters
    const totalCount = availableCategories.length;
    const activeCount = availableCategories.filter(c => Boolean(c.is_active)).length;
    const inactiveCount = totalCount - activeCount;

    const totalElem = document.getElementById('cat-stat-total');
    const activeElem = document.getElementById('cat-stat-active');
    const inactiveElem = document.getElementById('cat-stat-inactive');

    if (totalElem) totalElem.textContent = totalCount;
    if (activeElem) activeElem.textContent = activeCount;
    if (inactiveElem) inactiveElem.textContent = inactiveCount;

    if (availableCategories.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center" style="color: var(--gray-500); padding: 2.5rem;">No expense categories configured.</td></tr>';
        return;
    }

    const canToggle = ['Admin', 'Coordinator'].includes(currentUser?.role);

    tableBody.innerHTML = availableCategories.map(cat => {
        const isActive = Boolean(cat.is_active);
        const statusBadge = isActive
            ? `<span class="badge badge-success" style="background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 6px; font-size: 0.75rem;"><i class="fas fa-check-circle"></i> Active</span>`
            : `<span class="badge badge-secondary" style="background: rgba(107, 114, 128, 0.12); color: #6b7280; border: 1px solid rgba(107, 114, 128, 0.2); font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 6px; font-size: 0.75rem;"><i class="fas fa-power-off"></i> Inactive</span>`;

        const actionBtn = isActive
            ? `<button type="button" class="btn btn-sm btn-secondary toggle-cat-btn" data-id="${cat.id}" data-action="deactivate" style="border: 1px solid var(--border-color); font-weight: 600; font-size: 0.775rem; border-radius: 6px; padding: 0.3rem 0.65rem;">
                    <i class="fas fa-toggle-on" style="color: #10b981;"></i> Deactivate
               </button>`
            : `<button type="button" class="btn btn-sm btn-success toggle-cat-btn" data-id="${cat.id}" data-action="activate" style="font-weight: 600; font-size: 0.775rem; border-radius: 6px; padding: 0.3rem 0.65rem;">
                    <i class="fas fa-toggle-off"></i> Activate
               </button>`;

        return `
            <tr style="border-bottom: 1px solid var(--border-color); opacity: ${isActive ? '1' : '0.65'}; transition: background 0.15s ease;">
                <td style="font-weight: 600; padding: 0.85rem 1.15rem; color: var(--text-primary);">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(14, 74, 53, 0.08); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">
                            <i class="fas fa-tag"></i>
                        </div>
                        <span>${cat.name}</span>
                    </div>
                </td>
                <td style="color: var(--gray-600); font-size: 0.85rem; padding: 0.85rem 1.15rem;">${cat.description || '<span style="color: var(--gray-400); font-style: italic;">No description provided</span>'}</td>
                <td style="text-align: center; padding: 0.85rem 1.15rem;">${statusBadge}</td>
                <td style="text-align: center; padding: 0.85rem 1.15rem;">${canToggle ? actionBtn : '—'}</td>
            </tr>
        `;
    }).join('');

    // Wire toggle buttons
    document.querySelectorAll('.toggle-cat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const action = btn.getAttribute('data-action');

            loadingScreen.show(`${action === 'deactivate' ? 'Deactivating' : 'Activating'} category...`);
            try {
                const res = await api.patch(`/petty-cash/categories/toggle/${id}`);
                if (res.success) {
                    messageModal.success(res.message);
                    await loadCategories();
                } else {
                    messageModal.error(res.message || 'Failed to update category status');
                }
            } catch (err) {
                messageModal.error('Error updating category status');
            } finally {
                loadingScreen.hide();
            }
        });
    });
}

function setupEventListeners() {
    // Setup modal close actions
    const bindCloseButtons = () => {
        document.querySelectorAll('.close-btn, .close-btn-cancel').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
        });
        document.querySelectorAll('.close-btn, .close-btn-cancel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = btn.getAttribute('data-modal') || btn.closest('.modal').id;
                const modal = document.getElementById(modalId);
                if (modal) modal.style.display = 'none';
            });
        });
    };
    bindCloseButtons();
    window.bindCloseButtons = bindCloseButtons;

    // Category Management Modals
    const manageCatBtn = document.getElementById('manage-categories-btn');
    const manageCatModal = document.getElementById('manage-categories-modal');
    if (manageCatBtn) {
        manageCatBtn.addEventListener('click', () => {
            renderCategoryOptions();
            if (manageCatModal) manageCatModal.style.display = 'block';
        });
    }

    const openAddCatBtn = document.getElementById('open-add-cat-btn');
    const quickAddCatBtn = document.getElementById('quick-add-category-btn');
    const addCatModal = document.getElementById('add-category-modal');

    const triggerAddCategory = () => {
        if (addCatModal) {
            document.getElementById('new-category-name').value = '';
            document.getElementById('new-category-desc').value = '';
            addCatModal.style.display = 'block';
            document.getElementById('new-category-name').focus();
        }
    };

    if (openAddCatBtn) openAddCatBtn.addEventListener('click', triggerAddCategory);
    if (quickAddCatBtn) quickAddCatBtn.addEventListener('click', triggerAddCategory);

    // Save Category Form Submit
    const addCatForm = document.getElementById('add-category-form');
    if (addCatForm) {
        addCatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-category-name').value.trim();
            const description = document.getElementById('new-category-desc').value.trim();

            if (!name) {
                messageModal.warning('Category name is required');
                return;
            }

            loadingScreen.show('Saving category...');
            try {
                const res = await api.post('/petty-cash/categories', { name, description });
                if (res.success) {
                    messageModal.success('Category created successfully');
                    if (addCatModal) addCatModal.style.display = 'none';
                    await loadCategories();
                    renderCategoryOptions(res.data?.name || name);
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

    // Open float buttons
    const openBtn = document.getElementById('open-fund-btn');
    const openBannerBtn = document.getElementById('open-fund-banner-btn');
    const openModal = document.getElementById('open-fund-modal');

    const triggerOpen = () => {
        if (openModal) {
            openModal.style.display = 'block';
            document.getElementById('opening-balance').value = '';
            document.getElementById('opening-balance').focus();
        }
    };

    if (openBtn) openBtn.addEventListener('click', triggerOpen);
    if (openBannerBtn) openBannerBtn.addEventListener('click', triggerOpen);

    // Open Form Submit
    const openForm = document.getElementById('open-fund-form');
    if (openForm) {
        openForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const balance = parseFloat(document.getElementById('opening-balance').value);
            
            loadingScreen.show('Opening float...');
            try {
                const res = await api.post('/petty-cash/fund/open', { opening_balance: balance });
                if (res.success) {
                    messageModal.success('Petty cash float opened successfully');
                    openModal.style.display = 'none';
                    await checkFundStatus();
                } else {
                    messageModal.error(res.message || 'Failed to open float');
                }
            } catch (err) {
                messageModal.error('Error opening float');
            } finally {
                loadingScreen.hide();
            }
        });
    }

    // Close Float Action
    const closeBtn = document.getElementById('close-fund-btn');
    const closeModal = document.getElementById('close-fund-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (closeModal && activeFund) {
                document.getElementById('expected-closing-balance').textContent = `KSh ${parseFloat(activeFund.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                document.getElementById('closing-note').value = '';
                closeModal.style.display = 'block';
            }
        });
    }

    // Close Form Submit
    const closeForm = document.getElementById('close-fund-form');
    if (closeForm) {
        closeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const note = document.getElementById('closing-note').value;
            
            loadingScreen.show('Closing float...');
            try {
                const res = await api.patch(`/petty-cash/fund/close/${activeFund.id}`, { closing_note: note });
                if (res.success) {
                    messageModal.success('Float closed and reconciled successfully');
                    closeModal.style.display = 'none';
                    await checkFundStatus();
                } else {
                    messageModal.error(res.message || 'Failed to close float');
                }
            } catch (err) {
                messageModal.error('Error closing float');
            } finally {
                loadingScreen.hide();
            }
        });
    }

    // Add Transaction button triggers
    const addDisbursementBtn = document.getElementById('add-disbursement-btn');
    const addReplenishmentBtn = document.getElementById('add-replenishment-btn');
    const txModal = document.getElementById('tx-modal');

    const showTxModal = (type) => {
        if (!txModal) return;
        document.getElementById('tx-type').value = type;
        document.getElementById('tx-description').value = '';
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-ref').value = '';
        document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];

        const catGroup = document.getElementById('tx-category-group');
        const submitBtn = document.getElementById('tx-submit-btn');

        if (type === 'disbursement') {
            document.getElementById('tx-modal-title').textContent = 'Record Expense (Disbursement)';
            if (catGroup) catGroup.style.display = 'block';
            if (submitBtn) {
                submitBtn.className = 'btn btn-primary';
                submitBtn.textContent = 'Save Expense';
            }
        } else {
            document.getElementById('tx-modal-title').textContent = 'Record Top-up (Replenishment)';
            if (catGroup) catGroup.style.display = 'none';
            if (submitBtn) {
                submitBtn.className = 'btn btn-success';
                submitBtn.textContent = 'Save Top-up';
            }
        }
        txModal.style.display = 'block';
    };

    if (addDisbursementBtn) addDisbursementBtn.addEventListener('click', () => showTxModal('disbursement'));
    if (addReplenishmentBtn) addReplenishmentBtn.addEventListener('click', () => showTxModal('replenishment'));

    // Transaction form submit
    const txForm = document.getElementById('tx-form');
    if (txForm) {
        txForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!activeFund) return;

            const type = document.getElementById('tx-type').value;
            const category = type === 'disbursement' ? document.getElementById('tx-category').value : null;
            const description = document.getElementById('tx-description').value;
            const amount = parseFloat(document.getElementById('tx-amount').value);
            const ref = document.getElementById('tx-ref').value;
            const date = document.getElementById('tx-date').value;

            loadingScreen.show('Saving transaction...');
            try {
                const res = await api.post('/petty-cash/transactions', {
                    fund_id: activeFund.id,
                    type,
                    category,
                    description,
                    amount,
                    reference_no: ref,
                    transaction_date: date
                });

                if (res.success) {
                    messageModal.success('Transaction saved successfully');
                    txModal.style.display = 'none';
                    await checkFundStatus();
                } else {
                    messageModal.error(res.message || 'Failed to save transaction');
                }
            } catch (err) {
                messageModal.error('Error saving transaction');
            } finally {
                loadingScreen.hide();
            }
        });
    }

    // Void form submit
    const voidForm = document.getElementById('void-tx-form');
    const voidModal = document.getElementById('void-tx-modal');
    if (voidForm) {
        voidForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const txId = document.getElementById('void-tx-id').value;
            const reason = document.getElementById('void-reason').value;

            loadingScreen.show('Voiding transaction...');
            try {
                const res = await api.patch(`/petty-cash/transactions/void/${txId}`, { void_reason: reason });
                if (res.success) {
                    messageModal.success('Transaction voided successfully');
                    voidModal.style.display = 'none';
                    await checkFundStatus();
                } else {
                    messageModal.error(res.message || 'Failed to void transaction');
                }
            } catch (err) {
                messageModal.error('Error voiding transaction');
            } finally {
                loadingScreen.hide();
            }
        });
    }
}

async function checkFundStatus() {
    try {
        const res = await api.get('/petty-cash/fund/current');
        const badge = document.getElementById('active-fund-badge');
        const openBtn = document.getElementById('open-fund-btn');
        const closeBtn = document.getElementById('close-fund-btn');
        const dashboard = document.getElementById('active-fund-dashboard');
        const opsPanel = document.getElementById('fund-operations-panel');
        const banner = document.getElementById('no-fund-banner');
        const ledger = document.getElementById('ledger-container');

        const canManageFunds = ['Admin', 'Coordinator'].includes(currentUser?.role);

        if (res.success && res.status === 'open') {
            activeFund = res.fund;

            if (badge) {
                badge.textContent = `Active Period: ${activeFund.reference_no}`;
                badge.className = 'badge badge-success';
            }

            if (openBtn) openBtn.style.display = 'none';
            if (closeBtn) closeBtn.style.display = canManageFunds ? 'block' : 'none';
            if (banner) banner.style.display = 'none';
            if (dashboard) dashboard.style.display = 'grid';
            if (opsPanel) opsPanel.style.display = 'block';
            if (ledger) ledger.style.display = 'block';

            document.getElementById('current-balance-display').textContent = `KSh ${parseFloat(activeFund.current_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            document.getElementById('opening-balance-label').textContent = `Opening: KSh ${parseFloat(activeFund.opening_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            await loadTransactions();
        } else {
            activeFund = null;
            if (badge) {
                badge.textContent = 'Float Closed';
                badge.className = 'badge badge-danger';
            }

            if (openBtn) openBtn.style.display = canManageFunds ? 'block' : 'none';
            if (closeBtn) closeBtn.style.display = 'none';
            if (dashboard) dashboard.style.display = 'none';
            if (opsPanel) opsPanel.style.display = 'none';
            if (ledger) ledger.style.display = 'none';
            if (banner) banner.style.display = 'block';

            const bannerBtn = document.getElementById('open-fund-banner-btn');
            if (bannerBtn) bannerBtn.style.display = canManageFunds ? 'inline-block' : 'none';
        }
    } catch (err) {
        console.error('Error checking fund status:', err);
        toast.error('Could not load petty cash details');
    }
}

async function loadTransactions() {
    if (!activeFund) return;
    try {
        const res = await api.get(`/petty-cash/transactions?fundId=${activeFund.id}`);
        if (res.success) {
            allTransactions = res.data;
            updateSummaryCards(allTransactions);
            
            pagination.reset();
            pagination.update({
                page: 1,
                total: allTransactions.length,
                totalPages: Math.ceil(allTransactions.length / 10)
            });
            renderCurrentPage();
        }
    } catch (err) {
        console.error('Error loading ledger:', err);
    }
}

function updateSummaryCards(transactions) {
    let totalIn = 0;
    let totalOut = 0;

    const activeTx = transactions.filter(t => !t.is_voided);

    activeTx.forEach((tx) => {
        if (tx.type === 'replenishment') {
            if (tx.category !== 'Opening Balance') {
                totalIn += parseFloat(tx.amount);
            }
        } else if (tx.type === 'disbursement') {
            totalOut += parseFloat(tx.amount);
        }
    });

    document.getElementById('total-in-display').textContent = `KSh ${totalIn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('total-out-display').textContent = `KSh ${totalOut.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderCurrentPage() {
    const state = pagination.getState();
    const sliced = allTransactions.slice(state.offset, state.offset + state.limit);
    renderLedger(sliced);
}

function renderLedger(transactions) {
    const tbody = document.getElementById('ledger-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color: var(--gray-500); padding: 2rem;">No transactions recorded.</td></tr>';
        return;
    }

    const canVoid = ['Admin', 'Coordinator'].includes(currentUser?.role);

    transactions.forEach((tx, idx) => {
        const date = new Date(tx.created_at).toLocaleString();
        const typeBadge = tx.type === 'replenishment' 
            ? '<span class="badge badge-success" style="font-size:0.75rem;">Top-up</span>' 
            : '<span class="badge badge-warning" style="font-size:0.75rem;">Expense</span>';

        let rowStyle = '';
        let statusBadge = '';
        let actionButtons = `<button class="btn btn-sm btn-secondary view-tx-btn" data-index="${idx}" style="margin-right: 0.5rem;"><i class="fas fa-eye"></i> View</button>`;

        if (tx.is_voided) {
            rowStyle = 'style="opacity: 0.5; text-decoration: line-through;"';
            statusBadge = ` <small class="badge badge-danger" title="Void reason: ${tx.void_reason}">Voided</small>`;
        } else if (canVoid && tx.category !== 'Opening Balance') {
            actionButtons += `<button class="btn btn-sm btn-danger void-tx-btn" data-id="${tx.id}"><i class="fas fa-ban"></i> Void</button>`;
        }

        const row = `
            <tr ${rowStyle}>
                <td>${date}</td>
                <td>${typeBadge}${statusBadge}</td>
                <td><span class="badge badge-info">${tx.category || '—'}</span></td>
                <td style="text-align: right; font-weight:600; color: ${tx.type === 'disbursement' ? '#ea580c' : 'var(--success)'};">
                    ${tx.type === 'disbursement' ? '-' : '+'}KSh ${parseFloat(tx.amount).toFixed(2)}
                </td>
                <td style="text-align: right; font-weight:600;">KSh ${parseFloat(tx.balance_after).toFixed(2)}</td>
                <td style="text-align: center;">${actionButtons}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    document.querySelectorAll('.view-tx-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            const tx = transactions[index];
            if (!tx) return;

            document.getElementById('view-tx-date').textContent = new Date(tx.created_at).toLocaleString();
            document.getElementById('view-tx-type').textContent = tx.type === 'replenishment' ? 'Top-up (Replenishment)' : 'Expense (Disbursement)';
            document.getElementById('view-tx-category').textContent = tx.category || '—';
            document.getElementById('view-tx-amount').textContent = `${tx.type === 'disbursement' ? '-' : '+'}KSh ${parseFloat(tx.amount).toFixed(2)}`;
            document.getElementById('view-tx-balance').textContent = `KSh ${parseFloat(tx.balance_after).toFixed(2)}`;
            document.getElementById('view-tx-ref').textContent = tx.reference_no || '—';
            document.getElementById('view-tx-recorder').textContent = tx.recorded_by_name;
            document.getElementById('view-tx-description').textContent = tx.description;

            const modal = document.getElementById('tx-details-modal');
            if (modal) modal.style.display = 'block';
        });
    });

    document.querySelectorAll('.void-tx-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const txId = btn.getAttribute('data-id');
            const voidModal = document.getElementById('void-tx-modal');
            
            if (voidModal) {
                document.getElementById('void-tx-id').value = txId;
                document.getElementById('void-reason').value = '';
                voidModal.style.display = 'block';
            }
        });
    });
}
