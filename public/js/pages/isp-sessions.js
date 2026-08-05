/**
 * ISP Sessions page (A6)
 *
 * Shows both "live on the routers" and "open per accounting" side by side,
 * deliberately. Collapsing them into one number would hide the failure mode
 * where a router died without sending Accounting-Stop and a phantom session
 * is holding a subscriber's only Simultaneous-Use slot.
 */

import api from '../api.js';
import toast from '../toast.js';

let autoRefreshTimer = null;

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

async function loadLiveSessions() {
    const body = document.getElementById('ispLiveSessionsBody');
    const warning = document.getElementById('ispLiveWarning');

    try {
        const result = await api.request('/isp/sessions/live');
        const sessions = result.data;
        const meta = result.meta;

        document.getElementById('ispLiveCount').textContent = sessions.length;

        // An empty list because every router is unreachable must never read
        // as "nobody is online".
        if (!meta.complete) {
            warning.innerHTML = `
                <div class="alert alert-warning" style="padding: 0.6rem; margin-bottom: 0.5rem;
                     border-left: 4px solid #ff9800; background: rgba(255,152,0,0.1);">
                    <strong>Incomplete.</strong> Could not reach:
                    ${meta.routerErrors.map((e) =>
                        `<code>${escapeHtml(e.nas)}</code> (${escapeHtml(e.error)})`).join(', ')}
                    — this list may be missing sessions.
                </div>`;
        } else {
            warning.innerHTML = '';
        }

        if (sessions.length === 0) {
            body.innerHTML = `<tr><td colspan="7" class="text-muted">${
                meta.complete
                    ? 'No live sessions. Routers reachable and reporting nothing online.'
                    : 'No data — routers unreachable (see above).'
            }</td></tr>`;
            return;
        }

        body.innerHTML = sessions.map((s) => `
            <tr>
                <td><code>${escapeHtml(s.username || '—')}</code><br>
                    <small class="text-muted">${escapeHtml(s.identity?.label || 'unknown')}</small></td>
                <td><span class="badge badge-secondary">${escapeHtml(s.service)}</span></td>
                <td>${escapeHtml(s.address || '—')}</td>
                <td><code>${escapeHtml(s.callerId || '—')}</code></td>
                <td>${escapeHtml(s.uptime || '—')}</td>
                <td>${escapeHtml(s.nasName || '—')}</td>
                <td>
                    <button class="btn btn-sm btn-danger isp-kill"
                            data-nas="${s.nasId}" data-session="${escapeHtml(s.id)}"
                            data-service="${escapeHtml(s.service)}"
                            data-user="${escapeHtml(s.username || '')}"
                            title="Terminate this session now">
                        <i class="fas fa-plug"></i> Kick
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        body.innerHTML = `<tr><td colspan="7" class="text-danger">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function loadOpenSessions() {
    const body = document.getElementById('ispOpenSessionsBody');

    try {
        const result = await api.request('/isp/sessions/open');
        const sessions = result.data;

        document.getElementById('ispOpenCount').textContent = sessions.length;

        if (sessions.length === 0) {
            body.innerHTML =
                `<tr><td colspan="8" class="text-muted">No open sessions in accounting. ` +
                `Simulate one with <code>node scripts/isp/simulate_radius_session.js ` +
                `--scenario basic --user &lt;username&gt; --keep-open</code></td></tr>`;
            return;
        }

        body.innerHTML = sessions.map((s) => `
            <tr>
                <td><code>${escapeHtml(s.username)}</code></td>
                <td>${s.subscriber_code
                        ? `${escapeHtml(s.full_name)} <small class="text-muted">(${escapeHtml(s.subscriber_code)})</small>`
                        : s.voucher_code
                            ? `<span class="badge badge-secondary">voucher</span> <code>${escapeHtml(s.voucher_code)}</code>`
                            : '<span class="text-muted">unknown</span>'}</td>
                <td>${escapeHtml(s.framed_ip || '—')}</td>
                <td><code>${escapeHtml(s.calling_station_id || '—')}</code></td>
                <td>${s.started_at ? new Date(s.started_at).toLocaleString() : '—'}</td>
                <td>${s.last_update_at ? new Date(s.last_update_at).toLocaleString() : '—'}</td>
                <td>${fmtBytes(s.input_octets)}</td>
                <td>${fmtBytes(s.output_octets)}</td>
            </tr>
        `).join('');
    } catch (error) {
        body.innerHTML = `<tr><td colspan="8" class="text-danger">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function refreshAll() {
    await Promise.all([loadLiveSessions(), loadOpenSessions()]);
    document.getElementById('ispSessUpdated').textContent =
        `Updated ${new Date().toLocaleTimeString()}`;
}

async function killSession(nasId, sessionId, service, username) {
    if (!window.confirm(`Disconnect ${username || 'this session'} now?`)) return;

    try {
        await api.request(
            `/isp/sessions/${nasId}/${encodeURIComponent(sessionId)}?service=${service}`,
            { method: 'DELETE' }
        );
        toast.success('Session terminated');
        await refreshAll();
    } catch (error) {
        toast.error(`Could not terminate session: ${error.message}`);
    }
}

export function initIspSessions() {
    refreshAll();

    document.getElementById('ispSessRefreshBtn')?.addEventListener('click', refreshAll);

    document.getElementById('ispSessAutoRefresh')?.addEventListener('change', (e) => {
        if (e.target.checked) {
            autoRefreshTimer = setInterval(refreshAll, 15000);
        } else {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
    });

    document.addEventListener('click', (event) => {
        const kill = event.target.closest('.isp-kill');
        if (kill) {
            event.preventDefault();
            killSession(kill.dataset.nas, kill.dataset.session, kill.dataset.service, kill.dataset.user);
        }
    });
}

initIspSessions();

export default { initIspSessions };
