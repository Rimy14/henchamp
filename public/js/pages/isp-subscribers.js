/**
 * ISP Subscribers page (A1, A3)
 *
 * Lifecycle buttons call the same service functions Dev 2's billing engine
 * calls, so a manual suspend here and an automatic one from the billing cron
 * take an identical path. There is no second implementation to drift.
 */

import api from '../api.js';
import toast from '../toast.js';

let currentPage = 1;
let packages = [];

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
        active: 'badge-success',
        grace: 'badge-warning',
        suspended: 'badge-danger',
        pending: 'badge-secondary',
        terminated: 'badge-dark'
    };
    return `<span class="badge ${map[status] || 'badge-secondary'}">${escapeHtml(status)}</span>`;
}

function speedLabel(sub) {
    if (!sub.rate_down_kbps) return '—';
    const down = sub.rate_down_kbps >= 1000
        ? `${sub.rate_down_kbps / 1000}M` : `${sub.rate_down_kbps}k`;
    const up = sub.rate_up_kbps >= 1000
        ? `${sub.rate_up_kbps / 1000}M` : `${sub.rate_up_kbps}k`;
    // Presented download-first because that is how plans are sold, even
    // though the RADIUS attribute is written upload-first.
    return `${down} ↓ / ${up} ↑`;
}

// =====================================================
// LIST
// =====================================================

async function loadSubscribers(page = 1) {
    currentPage = page;

    const status = document.getElementById('ispSubStatusFilter')?.value || '';
    const search = document.getElementById('ispSubSearch')?.value || '';

    const params = new URLSearchParams({ page, limit: 25 });
    if (status) params.set('status', status);
    if (search) params.set('search', search);

    try {
        const result = await api.request(`/isp/subscribers?${params}`);
        renderSubscribers(result.data);
        renderPagination(result.pagination);
    } catch (error) {
        console.error('Failed to load subscribers:', error);
        toast.error(`Could not load subscribers: ${error.message}`);
        document.getElementById('ispSubscribersBody').innerHTML =
            `<tr><td colspan="9" class="text-danger">${escapeHtml(error.message)}</td></tr>`;
    }
}

function renderSubscribers(subscribers) {
    const body = document.getElementById('ispSubscribersBody');

    if (!subscribers || subscribers.length === 0) {
        body.innerHTML =
            `<tr><td colspan="9" class="text-muted">No subscribers found. ` +
            `Seed demo data with <code>node scripts/isp/seed_isp_demo.js</code></td></tr>`;
        return;
    }

    body.innerHTML = subscribers.map((sub) => `
        <tr data-id="${sub.id}">
            <td><code>${escapeHtml(sub.subscriber_code)}</code></td>
            <td><a href="#" class="isp-sub-detail" data-id="${sub.id}">
                <strong>${escapeHtml(sub.full_name)}</strong></a></td>
            <td>${escapeHtml(sub.phone)}</td>
            <td>${escapeHtml(sub.package_name || '—')}</td>
            <td>${speedLabel(sub)}</td>
            <td>${sub.billing_cycle_end
                    ? new Date(sub.billing_cycle_end).toLocaleDateString() : '—'}</td>
            <td>${sub.grace_until
                    ? new Date(sub.grace_until).toLocaleDateString() : '—'}</td>
            <td>${statusBadge(sub.status)}</td>
            <td>${Number(sub.is_online)
                    ? '<span class="badge badge-success">online</span>'
                    : '<span class="text-muted">offline</span>'}</td>
            <td style="white-space: nowrap;">
                ${lifecycleButtons(sub)}
            </td>
        </tr>
    `).join('');
}

/** Only offer transitions that are valid from the current status. */
function lifecycleButtons(sub) {
    const buttons = [];

    if (sub.status === 'pending') {
        buttons.push(`<button class="btn btn-sm btn-success isp-action" data-action="activate"
                        data-id="${sub.id}" title="Put into service">
                        <i class="fas fa-play"></i></button>`);
    }
    if (['active', 'grace'].includes(sub.status)) {
        buttons.push(`<button class="btn btn-sm btn-danger isp-action" data-action="suspend"
                        data-id="${sub.id}" title="Suspend — blocks auth and kicks the live session">
                        <i class="fas fa-ban"></i></button>`);
    }
    if (['suspended', 'grace'].includes(sub.status)) {
        buttons.push(`<button class="btn btn-sm btn-success isp-action" data-action="restore"
                        data-id="${sub.id}" title="Restore service">
                        <i class="fas fa-redo"></i></button>`);
    }
    if (sub.status !== 'terminated') {
        buttons.push(`<button class="btn btn-sm btn-secondary isp-action" data-action="disconnect"
                        data-id="${sub.id}" title="Kick live sessions without changing status">
                        <i class="fas fa-plug"></i></button>`);
    }

    buttons.push(`<button class="btn btn-sm btn-secondary isp-action" data-action="sync"
                    data-id="${sub.id}" title="Check this subscriber against RADIUS">
                    <i class="fas fa-stethoscope"></i></button>`);

    return buttons.join(' ');
}

function renderPagination(pagination) {
    const container = document.getElementById('ispSubPagination');
    if (!pagination || pagination.totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="pagination">';
    for (let p = 1; p <= pagination.totalPages; p++) {
        html += `<button class="btn btn-sm ${p === pagination.page ? 'btn-primary' : 'btn-secondary'} isp-page"
                    data-page="${p}">${p}</button> `;
    }
    html += `</div><small class="text-muted">${pagination.totalItems} subscriber(s)</small>`;
    container.innerHTML = html;
}

// =====================================================
// LIFECYCLE ACTIONS
// =====================================================

async function runAction(action, id) {
    const confirmations = {
        suspend: 'Suspend this subscriber? This blocks future logins AND disconnects them now.',
        restore: 'Restore service for this subscriber?',
        activate: 'Activate this subscriber and start their billing cycle?',
        disconnect: 'Disconnect live sessions? Their status will not change.'
    };

    if (confirmations[action] && !window.confirm(confirmations[action])) return;

    if (action === 'sync') return checkSync(id);

    try {
        const result = await api.request(`/isp/subscribers/${id}/${action}`, {
            method: 'POST',
            body: { reason: `manual ${action} from admin UI` }
        });

        // "no-op" is a success: the requested state was already in place.
        toast.success(result.message || `${action} complete`);

        if (result.data?.errors?.length) {
            toast.warning(
                `Router(s) unreachable: ${result.data.errors.map((e) => e.nas).join(', ')}. ` +
                `RADIUS policy was still updated.`
            );
        }

        await loadSubscribers(currentPage);
    } catch (error) {
        toast.error(`${action} failed: ${error.message}`);
    }
}

/** Compare our state with RADIUS's. */
async function checkSync(id) {
    try {
        const result = await api.request(`/isp/subscribers/${id}/sync`);
        const { inSync, issues, radius } = result.data;

        if (inSync) {
            toast.success('In sync with RADIUS');
        } else {
            toast.warning(`Out of sync: ${issues.join('; ')}`);
        }

        console.log('RADIUS state:', radius);
    } catch (error) {
        toast.error(`Sync check failed: ${error.message}`);
    }
}

// =====================================================
// DETAIL
// =====================================================

async function showDetail(id) {
    const modal = document.getElementById('ispSubDetailModal');
    const body = document.getElementById('ispSubDetailBody');

    modal.style.display = 'flex';
    body.innerHTML = '<p class="text-muted">Loading…</p>';

    try {
        const result = await api.request(`/isp/subscribers/${id}`);
        const s = result.data;

        document.getElementById('ispSubDetailTitle').textContent =
            `${s.full_name} — ${s.subscriber_code}`;

        body.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div>
                    <p><strong>Status:</strong> ${statusBadge(s.status)}</p>
                    <p><strong>Phone:</strong> ${escapeHtml(s.phone)}</p>
                    <p><strong>PPPoE username:</strong> <code>${escapeHtml(s.radius_username)}</code></p>
                    <p><strong>Package:</strong> ${escapeHtml(s.package_name || '—')}</p>
                    <p><strong>Speed:</strong> ${speedLabel(s)}</p>
                </div>
                <div>
                    <p><strong>Cycle:</strong>
                        ${s.billing_cycle_start || '—'} → ${s.billing_cycle_end || '—'}</p>
                    <p><strong>Grace until:</strong> ${s.grace_until || '—'}</p>
                    <p><strong>Total used:</strong> ${fmtBytes(s.usage?.totals?.totalBytes)}</p>
                    <p><strong>↑ Upload:</strong> ${fmtBytes(s.usage?.totals?.uploadBytes)}</p>
                    <p><strong>↓ Download:</strong> ${fmtBytes(s.usage?.totals?.downloadBytes)}</p>
                    <p><strong>Sessions:</strong> ${s.usage?.totals?.sessionCount ?? 0}</p>
                </div>
            </div>

            <h4 style="margin-top: 1rem;">Recent Sessions</h4>
            <table class="data-table">
                <thead><tr>
                    <th>Started</th><th>IP</th><th>MAC</th>
                    <th>↑</th><th>↓</th><th>Ended</th>
                </tr></thead>
                <tbody>
                    ${(s.recent_sessions || []).length === 0
                        ? '<tr><td colspan="6" class="text-muted">No sessions recorded</td></tr>'
                        : s.recent_sessions.map((sess) => `
                            <tr>
                                <td>${sess.started_at ? new Date(sess.started_at).toLocaleString() : '—'}</td>
                                <td>${escapeHtml(sess.framed_ip || '—')}</td>
                                <td><code>${escapeHtml(sess.calling_station_id || '—')}</code></td>
                                <td>${fmtBytes(sess.input_octets)}</td>
                                <td>${fmtBytes(sess.output_octets)}</td>
                                <td>${sess.stopped_at
                                        ? new Date(sess.stopped_at).toLocaleString()
                                        : '<span class="badge badge-success">online</span>'}</td>
                            </tr>`).join('')}
                </tbody>
            </table>

            <h4 style="margin-top: 1rem;">Audit Trail</h4>
            <table class="data-table">
                <thead><tr><th>When</th><th>Action</th><th>By</th><th>Detail</th></tr></thead>
                <tbody>
                    ${(s.audit || []).length === 0
                        ? '<tr><td colspan="4" class="text-muted">No audit entries</td></tr>'
                        : s.audit.map((a) => `
                            <tr>
                                <td>${new Date(a.created_at).toLocaleString()}</td>
                                <td><strong>${escapeHtml(a.action)}</strong></td>
                                <td>${escapeHtml(a.actor_username || 'system')}</td>
                                <td><small><code>${escapeHtml(
                                    typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail || {})
                                )}</code></small></td>
                            </tr>`).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        body.innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`;
    }
}

// =====================================================
// CREATE
// =====================================================

async function loadPackages() {
    try {
        const result = await api.request('/isp/packages?service_type=pppoe&status=active');
        packages = result.data;

        const select = document.getElementById('ispSubPackage');
        if (select) {
            select.innerHTML = packages.map((p) =>
                `<option value="${p.id}">${escapeHtml(p.name)} — KES ${p.price}</option>`
            ).join('');
        }
    } catch (error) {
        console.error('Failed to load packages:', error);
    }
}

async function saveSubscriber() {
    const payload = {
        full_name: document.getElementById('ispSubName').value.trim(),
        phone: document.getElementById('ispSubPhone').value.trim(),
        package_id: document.getElementById('ispSubPackage').value,
        radius_username: document.getElementById('ispSubUsername').value.trim() || undefined,
        email: document.getElementById('ispSubEmail').value.trim() || undefined,
        address: document.getElementById('ispSubAddress').value.trim() || undefined
    };

    if (!payload.full_name || !payload.phone || !payload.package_id) {
        toast.error('Name, phone and package are required');
        return;
    }

    try {
        const result = await api.request('/isp/subscribers', { method: 'POST', body: payload });

        // The generated password is shown once and cannot be retrieved.
        // A toast would be dismissed before it could be written down.
        window.alert(
            `Subscriber ${result.data.subscriber_code} created.\n\n` +
            `PPPoE username: ${result.data.radius_username}\n` +
            `PPPoE password: ${result.data.radius_password}\n\n` +
            `Record this now — it cannot be retrieved again.`
        );

        document.getElementById('ispSubModal').style.display = 'none';
        clearForm();
        await loadSubscribers(1);
    } catch (error) {
        toast.error(`Could not create subscriber: ${error.message}`);
    }
}

function clearForm() {
    for (const id of ['ispSubName', 'ispSubPhone', 'ispSubUsername', 'ispSubEmail', 'ispSubAddress']) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    }
}

// =====================================================
// INIT
// =====================================================

export function initIspSubscribers() {
    loadPackages();
    loadSubscribers(1);

    document.getElementById('ispSubFilterBtn')?.addEventListener('click', () => loadSubscribers(1));
    document.getElementById('ispSubSearch')?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') loadSubscribers(1);
    });

    document.getElementById('ispSubCreateBtn')?.addEventListener('click', () => {
        document.getElementById('ispSubModal').style.display = 'flex';
    });

    for (const id of ['ispSubModalClose', 'ispSubCancelBtn']) {
        document.getElementById(id)?.addEventListener('click', () => {
            document.getElementById('ispSubModal').style.display = 'none';
        });
    }

    document.getElementById('ispSubSaveBtn')?.addEventListener('click', saveSubscriber);
    document.getElementById('ispSubDetailClose')?.addEventListener('click', () => {
        document.getElementById('ispSubDetailModal').style.display = 'none';
    });

    // Delegated so it survives table re-renders.
    document.addEventListener('click', (event) => {
        const action = event.target.closest('.isp-action');
        if (action) {
            event.preventDefault();
            runAction(action.dataset.action, action.dataset.id);
            return;
        }

        const detail = event.target.closest('.isp-sub-detail');
        if (detail) {
            event.preventDefault();
            showDetail(detail.dataset.id);
            return;
        }

        const page = event.target.closest('.isp-page');
        if (page) {
            event.preventDefault();
            loadSubscribers(Number(page.dataset.page));
        }
    });
}

initIspSubscribers();

export default { initIspSubscribers };
