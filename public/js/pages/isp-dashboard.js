/**
 * ISP Dashboard (A7)
 *
 * Overview of the ISP side: subscriber states, live sessions, data used
 * today, voucher stock, router health and background-job health.
 *
 * Job health is shown prominently on purpose. If accounting ingest stops,
 * every usage figure quietly freezes at its last value — there is no visible
 * error anywhere else, and the first sign would be a billing dispute.
 */

import api from '../api.js';
import toast from '../toast.js';

/** Human-readable byte count. */
function fmtBytes(bytes) {
    const n = Number(bytes || 0);
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TB`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
    return `${n} B`;
}

/** Seconds as a compact duration. */
function fmtDuration(seconds) {
    const s = Number(seconds || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
}

function statusBadge(status) {
    const map = {
        active: 'badge-success',
        grace: 'badge-warning',
        suspended: 'badge-danger',
        pending: 'badge-secondary',
        terminated: 'badge-dark'
    };
    return `<span class="badge ${map[status] || 'badge-secondary'}">${status}</span>`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

async function loadDashboard() {
    try {
        const [summary, talkers] = await Promise.all([
            api.request('/isp/dashboard'),
            api.request('/isp/usage/top-talkers?days=7&limit=10')
        ]);

        const d = summary.data;

        // --- Subscribers ---
        document.getElementById('statActiveSubs').textContent = d.subscribers.active || 0;
        document.getElementById('statSubsBreakdown').textContent =
            `${d.subscribers.total || 0} total · ` +
            `${d.subscribers.grace || 0} grace · ` +
            `${d.subscribers.suspended || 0} suspended`;

        // --- Sessions ---
        document.getElementById('statOpenSessions').textContent = d.sessions.open;

        // --- Usage today ---
        document.getElementById('statUsageToday').textContent = fmtBytes(d.usageToday.totalBytes);
        document.getElementById('statUsageSplit').textContent =
            `↑ ${fmtBytes(d.usageToday.uploadBytes)}  ↓ ${fmtBytes(d.usageToday.downloadBytes)}`;

        // --- Vouchers ---
        document.getElementById('statVouchers').textContent = d.vouchers.total || 0;
        document.getElementById('statVoucherBreakdown').textContent =
            `${d.vouchers.unused || 0} unused · ${d.vouchers.active || 0} in use`;

        // --- Routers ---
        document.getElementById('statNas').textContent = `${d.nas.active}/${d.nas.total}`;
        const nasErrors = document.getElementById('statNasErrors');
        if (d.nas.withErrors > 0) {
            nasErrors.innerHTML = `<span class="text-danger">${d.nas.withErrors} with errors</span>`;
        } else {
            nasErrors.textContent = 'all healthy';
        }

        renderJobs(d.jobs);
        renderTopTalkers(talkers.data);

        document.getElementById('ispLastUpdated').textContent =
            `Updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Failed to load ISP dashboard:', error);
        toast.error(`Could not load ISP dashboard: ${error.message}`);
    }
}

function renderJobs(jobs) {
    const body = document.getElementById('ispJobsBody');

    if (!jobs || jobs.length === 0) {
        body.innerHTML =
            `<tr><td colspan="5" class="text-muted">` +
            `No job has run yet. Jobs start with the server when ISP_JOBS_ENABLED=true.` +
            `</td></tr>`;
        return;
    }

    body.innerHTML = jobs.map((job) => {
        const stale = job.last_run_at &&
            (Date.now() - new Date(job.last_run_at).getTime()) > 10 * 60 * 1000;

        return `
            <tr>
                <td><code>${escapeHtml(job.job_name)}</code></td>
                <td>${job.last_run_at ? new Date(job.last_run_at).toLocaleString() : '—'}
                    ${stale ? '<span class="badge badge-warning">stale</span>' : ''}</td>
                <td>${escapeHtml(job.last_status || '—')}</td>
                <td><code>${escapeHtml(job.cursor_value)}</code></td>
                <td class="${job.last_error ? 'text-danger' : 'text-muted'}">
                    ${escapeHtml(job.last_error || '—')}
                </td>
            </tr>`;
    }).join('');
}

function renderTopTalkers(talkers) {
    const body = document.getElementById('ispTopTalkersBody');

    if (!talkers || talkers.length === 0) {
        body.innerHTML =
            `<tr><td colspan="7" class="text-muted">` +
            `No usage recorded yet. Simulate traffic with: ` +
            `<code>node scripts/isp/simulate_radius_session.js --scenario all</code>` +
            `</td></tr>`;
        return;
    }

    body.innerHTML = talkers.map((t) => `
        <tr>
            <td>
                <strong>${escapeHtml(t.full_name)}</strong><br>
                <small class="text-muted">${escapeHtml(t.subscriber_code)}</small>
            </td>
            <td>${escapeHtml(t.package_name || '—')}</td>
            <td>${statusBadge(t.status)}</td>
            <td>${fmtBytes(t.upload_bytes)}</td>
            <td>${fmtBytes(t.download_bytes)}</td>
            <td><strong>${fmtBytes(t.total_bytes)}</strong></td>
            <td>${fmtDuration(t.session_seconds)}</td>
        </tr>
    `).join('');
}

async function runJob(endpoint, label, button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running…';

    try {
        const result = await api.request(endpoint, { method: 'POST', body: {} });
        toast.success(`${label}: ${JSON.stringify(result.data)}`);
        await loadDashboard();
    } catch (error) {
        toast.error(`${label} failed: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = original;
    }
}

export function initIspDashboard() {
    document.getElementById('ispRefreshBtn')
        ?.addEventListener('click', loadDashboard);

    document.getElementById('ispRunIngestBtn')
        ?.addEventListener('click', (e) =>
            runJob('/isp/jobs/accounting-ingest', 'Accounting ingest', e.currentTarget));

    document.getElementById('ispRunReaperBtn')
        ?.addEventListener('click', (e) =>
            runJob('/isp/jobs/session-reaper', 'Session reaper', e.currentTarget));

    loadDashboard();
}

// The router loads this module and calls the exported init; also run on
// direct load so the page works if opened standalone.
initIspDashboard();

export default { initIspDashboard };
