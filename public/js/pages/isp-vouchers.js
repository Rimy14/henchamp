/**
 * ISP Vouchers page (A2, A5)
 *
 * Voucher stock management plus the device-lock controls. The "Reset Lock"
 * action is the counter-staff fix for a customer whose phone rotated its MAC
 * and can no longer use the code they paid for.
 */

import api from '../api.js';
import toast from '../toast.js';

let currentPage = 1;
let lastGeneratedCodes = [];

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function fmtBytes(bytes) {
    const n = Number(bytes || 0);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
    return `${n} B`;
}

function statusBadge(status) {
    const map = {
        unused: 'badge-secondary',
        active: 'badge-success',
        used: 'badge-dark',
        expired: 'badge-warning',
        revoked: 'badge-danger'
    };
    return `<span class="badge ${map[status] || 'badge-secondary'}">${escapeHtml(status)}</span>`;
}

// =====================================================
// LIST
// =====================================================

async function loadVouchers(page = 1) {
    currentPage = page;

    const status = document.getElementById('ispVoucherStatusFilter')?.value || '';
    const bound = document.getElementById('ispVoucherBoundFilter')?.value || '';
    const search = document.getElementById('ispVoucherSearch')?.value || '';

    const params = new URLSearchParams({ page, limit: 50 });
    if (status) params.set('status', status);
    if (bound) params.set('bound', bound);
    if (search) params.set('search', search);

    try {
        const result = await api.request(`/isp/vouchers?${params}`);
        renderVouchers(result.data);
        renderPagination(result.pagination);
    } catch (error) {
        document.getElementById('ispVouchersBody').innerHTML =
            `<tr><td colspan="10" class="text-danger">${escapeHtml(error.message)}</td></tr>`;
    }
}

function renderVouchers(vouchers) {
    const body = document.getElementById('ispVouchersBody');

    if (!vouchers || vouchers.length === 0) {
        body.innerHTML =
            `<tr><td colspan="10" class="text-muted">No vouchers found. ` +
            `Generate a batch, or seed demo data with ` +
            `<code>node scripts/isp/seed_isp_demo.js</code></td></tr>`;
        return;
    }

    body.innerHTML = vouchers.map((v) => `
        <tr>
            <td><code style="font-size: 1.05em;"><strong>${escapeHtml(v.code)}</strong></code></td>
            <td><small>${escapeHtml(v.batch_no || '—')}</small></td>
            <td>${escapeHtml(v.package_name || '—')}</td>
            <td>${statusBadge(v.status)}</td>
            <td>${v.bound_mac
                    ? `<code>${escapeHtml(v.bound_mac)}</code>`
                    : '<span class="text-muted">not locked</span>'}</td>
            <td>${Number(v.binding_resets) > 2
                    ? `<span class="badge badge-warning" title="Frequent resets can indicate sharing">${v.binding_resets}</span>`
                    : (v.binding_resets || 0)}</td>
            <td>${v.first_used_at ? new Date(v.first_used_at).toLocaleString() : '—'}</td>
            <td>${v.expires_at ? new Date(v.expires_at).toLocaleString() : '—'}</td>
            <td>${fmtBytes(v.data_used_bytes)}</td>
            <td style="white-space: nowrap;">
                ${v.bound_mac && !['revoked', 'expired'].includes(v.status)
                    ? `<button class="btn btn-sm btn-secondary isp-v-action" data-action="reset-binding"
                         data-id="${v.id}" data-code="${escapeHtml(v.code)}"
                         title="Free this code for a different device">
                         <i class="fas fa-unlock"></i> Reset Lock</button>`
                    : ''}
                ${v.status !== 'revoked'
                    ? `<button class="btn btn-sm btn-danger isp-v-action" data-action="revoke"
                         data-id="${v.id}" data-code="${escapeHtml(v.code)}"
                         title="Revoke permanently">
                         <i class="fas fa-times"></i></button>`
                    : ''}
            </td>
        </tr>
    `).join('');
}

function renderPagination(pagination) {
    const container = document.getElementById('ispVoucherPagination');
    if (!pagination || pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';
    for (let p = 1; p <= pagination.totalPages; p++) {
        html += `<button class="btn btn-sm ${p === pagination.page ? 'btn-primary' : 'btn-secondary'} isp-v-page"
                    data-page="${p}">${p}</button> `;
    }
    html += `</div><small class="text-muted">${pagination.totalItems} voucher(s)</small>`;
    container.innerHTML = html;
}

// =====================================================
// ACTIONS
// =====================================================

async function resetBinding(id, code) {
    const reason = window.prompt(
        `Free voucher ${code} from its locked device?\n\n` +
        `It will re-lock to the next device that uses it.\n\n` +
        `Reason (for the audit trail):`,
        'customer device changed its MAC address'
    );
    if (reason === null) return;

    try {
        const result = await api.request(`/isp/vouchers/${id}/reset-binding`, {
            method: 'POST',
            body: { reason }
        });
        toast.success(result.message);
        await loadVouchers(currentPage);
    } catch (error) {
        toast.error(`Could not reset lock: ${error.message}`);
    }
}

async function revokeVoucher(id, code) {
    if (!window.confirm(`Revoke voucher ${code}? This is permanent and cannot be undone.`)) return;

    try {
        await api.request(`/isp/vouchers/${id}/revoke`, {
            method: 'POST',
            body: { reason: 'revoked from admin UI' }
        });
        toast.success(`Voucher ${code} revoked`);
        await loadVouchers(currentPage);
    } catch (error) {
        toast.error(`Could not revoke: ${error.message}`);
    }
}

// =====================================================
// GENERATE
// =====================================================

async function loadHotspotPackages() {
    try {
        const result = await api.request('/isp/packages?service_type=hotspot&status=active');
        const select = document.getElementById('ispVoucherPackage');
        if (select) {
            select.innerHTML = result.data.map((p) =>
                `<option value="${p.id}">${escapeHtml(p.name)} — KES ${p.price}</option>`
            ).join('');
        }
    } catch (error) {
        console.error('Failed to load hotspot packages:', error);
    }
}

async function generateBatch() {
    const payload = {
        package_id: document.getElementById('ispVoucherPackage').value,
        quantity: Number(document.getElementById('ispVoucherQty').value),
        code_length: Number(document.getElementById('ispVoucherLen').value),
        notes: document.getElementById('ispVoucherNotes').value.trim() || undefined
    };

    if (!payload.package_id || !payload.quantity) {
        toast.error('Package and quantity are required');
        return;
    }

    const button = document.getElementById('ispVoucherSaveBtn');
    button.disabled = true;
    button.textContent = 'Generating…';

    try {
        const result = await api.request('/isp/vouchers/generate', {
            method: 'POST',
            body: payload
        });

        lastGeneratedCodes = result.data.vouchers.map((v) => v.code);

        document.getElementById('ispVoucherModal').style.display = 'none';
        showGeneratedCodes(result.data.batch.batch_no, lastGeneratedCodes);

        if (result.data.provisioning?.failed?.length) {
            toast.warning(
                `${result.data.provisioning.failed.length} voucher(s) failed to provision into RADIUS`
            );
        }

        await loadVouchers(1);
    } catch (error) {
        toast.error(`Could not generate vouchers: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = 'Generate';
    }
}

function showGeneratedCodes(batchNo, codes) {
    document.getElementById('ispVoucherPrintTitle').textContent =
        `Batch ${batchNo} — ${codes.length} vouchers`;

    document.getElementById('ispVoucherPrintList').innerHTML =
        codes.map((c) => `<div style="padding: 0.4rem; border: 1px dashed #999; text-align: center;">
            ${escapeHtml(c)}</div>`).join('');

    document.getElementById('ispVoucherPrintModal').style.display = 'flex';
}

// =====================================================
// BATCHES
// =====================================================

async function showBatches() {
    const modal = document.getElementById('ispBatchModal');
    const body = document.getElementById('ispBatchBody');

    modal.style.display = 'flex';
    body.innerHTML = '<p class="text-muted">Loading…</p>';

    try {
        const result = await api.request('/isp/vouchers/batches');

        if (result.data.length === 0) {
            body.innerHTML = '<p class="text-muted">No batches yet.</p>';
            return;
        }

        body.innerHTML = `
            <table class="data-table">
                <thead><tr>
                    <th>Batch</th><th>Package</th><th>Qty</th>
                    <th>Unused</th><th>In use</th><th>Expired</th><th>Revoked</th>
                    <th>Locked</th><th>Created</th>
                </tr></thead>
                <tbody>
                    ${result.data.map((b) => `
                        <tr>
                            <td><code>${escapeHtml(b.batch_no)}</code></td>
                            <td>${escapeHtml(b.package_name || '—')}</td>
                            <td>${b.quantity}</td>
                            <td>${b.unused || 0}</td>
                            <td>${b.active || 0}</td>
                            <td>${b.expired || 0}</td>
                            <td>${b.revoked || 0}</td>
                            <td>${b.bound || 0}</td>
                            <td>${new Date(b.created_at).toLocaleDateString()}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    } catch (error) {
        body.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
    }
}

// =====================================================
// INIT
// =====================================================

export function initIspVouchers() {
    loadHotspotPackages();
    loadVouchers(1);

    document.getElementById('ispVoucherFilterBtn')?.addEventListener('click', () => loadVouchers(1));
    document.getElementById('ispVoucherSearch')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') loadVouchers(1);
    });

    document.getElementById('ispVoucherGenerateBtn')?.addEventListener('click', () => {
        document.getElementById('ispVoucherModal').style.display = 'flex';
    });
    document.getElementById('ispVoucherBatchesBtn')?.addEventListener('click', showBatches);

    for (const id of ['ispVoucherModalClose', 'ispVoucherCancelBtn']) {
        document.getElementById(id)?.addEventListener('click', () => {
            document.getElementById('ispVoucherModal').style.display = 'none';
        });
    }
    document.getElementById('ispVoucherPrintClose')?.addEventListener('click', () => {
        document.getElementById('ispVoucherPrintModal').style.display = 'none';
    });
    document.getElementById('ispBatchModalClose')?.addEventListener('click', () => {
        document.getElementById('ispBatchModal').style.display = 'none';
    });

    document.getElementById('ispVoucherSaveBtn')?.addEventListener('click', generateBatch);

    document.getElementById('ispVoucherCopyBtn')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(lastGeneratedCodes.join('\n'));
            toast.success('Codes copied to clipboard');
        } catch {
            toast.error('Clipboard unavailable — select and copy manually');
        }
    });

    document.getElementById('ispVoucherPrintBtn')?.addEventListener('click', () => window.print());

    // Delegated so handlers survive table re-renders.
    document.addEventListener('click', (event) => {
        const action = event.target.closest('.isp-v-action');
        if (action) {
            event.preventDefault();
            const { action: type, id, code } = action.dataset;
            if (type === 'reset-binding') resetBinding(id, code);
            if (type === 'revoke') revokeVoucher(id, code);
            return;
        }

        const page = event.target.closest('.isp-v-page');
        if (page) {
            event.preventDefault();
            loadVouchers(Number(page.dataset.page));
        }
    });
}

initIspVouchers();

export default { initIspVouchers };
