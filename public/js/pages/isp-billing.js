import api from '../api.js';
import toast from '../toast.js';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"\/]/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;'
    }[c]));
}

function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
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

function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

async function loadBillableSubscribers() {
    const dueBefore = document.getElementById('ispBillingDueBefore')?.value;
    const status = document.getElementById('ispBillingStatusFilter')?.value;
    const params = new URLSearchParams();
    if (dueBefore) params.set('due_before', dueBefore);
    if (status) params.set('statuses', status);

    try {
        const endpoint = `/isp/subscribers/billable${params.toString() ? `?${params}` : ''}`;
        const result = await api.get(endpoint);
        const subscribers = result.data || [];

        renderBillingSummary(subscribers);
        renderBillingTable(subscribers);
    } catch (error) {
        console.error('Failed to load billable subscribers:', error);
        toast.error(`Could not load due subscribers: ${error.message}`);
        document.getElementById('ispBillingBody').innerHTML =
            `<tr><td colspan="10" class="text-danger">${escapeHtml(error.message)}</td></tr>`;
    }
}

function renderBillingSummary(subscribers) {
    const total = subscribers.length;
    const active = subscribers.filter((sub) => sub.status === 'active').length;
    const grace = subscribers.filter((sub) => sub.status === 'grace').length;
    const overdue = subscribers.filter((sub) => {
        const end = sub.billing_cycle_end ? new Date(sub.billing_cycle_end) : null;
        return end && end < startOfToday();
    }).length;

    document.getElementById('ispBillingTotalDue').textContent = total;
    document.getElementById('ispBillingActiveDue').textContent = active;
    document.getElementById('ispBillingGraceDue').textContent = grace;
    document.getElementById('ispBillingOverdueCount').textContent = overdue;
}

function renderBillingTable(subscribers) {
    const body = document.getElementById('ispBillingBody');

    if (!subscribers || subscribers.length === 0) {
        body.innerHTML =
            `<tr><td colspan="10" class="text-muted">No due subscribers found for the selected filters.</td></tr>`;
        return;
    }

    body.innerHTML = subscribers.map((sub) => {
        const amount = sub.package_price != null ? `${escapeHtml(sub.currency || 'KES')} ${escapeHtml(sub.package_price.toString())}` : '—';
        return `
            <tr data-id="${sub.id}">
                <td><code>${escapeHtml(sub.subscriber_code)}</code></td>
                <td>${escapeHtml(sub.full_name)}</td>
                <td>${escapeHtml(sub.phone)}</td>
                <td>${escapeHtml(sub.package_name || '—')}</td>
                <td>${fmtDate(sub.billing_cycle_end)}</td>
                <td>${fmtDate(sub.grace_until)}</td>
                <td>${amount}</td>
                <td>${statusBadge(sub.status)}</td>
                <td>${escapeHtml(sub.status_reason || '—')}</td>
                <td style="white-space: nowrap;">${billingButtons(sub)}</td>
            </tr>`;
    }).join('');
}

function billingButtons(sub) {
    const buttons = [];
    if (sub.status === 'active') {
        buttons.push(`<button class="btn btn-sm btn-danger isp-billing-action" data-action="suspend" data-id="${sub.id}" title="Suspend this subscriber">` +
            `<i class="fas fa-ban"></i></button>`);
    }
    if (sub.status === 'grace') {
        buttons.push(`<button class="btn btn-sm btn-success isp-billing-action" data-action="restore" data-id="${sub.id}" title="Restore service after payment">` +
            `<i class="fas fa-redo"></i></button>`);
        buttons.push(`<button class="btn btn-sm btn-danger isp-billing-action" data-action="suspend" data-id="${sub.id}" title="Suspend after grace expires">` +
            `<i class="fas fa-ban"></i></button>`);
    }
    return buttons.join(' ');
}

async function runBillingAction(action, id) {
    if (!id || !action) return;

    const prompts = {
        suspend: 'Suspend this subscriber? This will block future logins and disconnect live sessions.',
        restore: 'Restore this subscriber after payment? This will allow them to connect again.'
    };

    if (prompts[action] && !window.confirm(prompts[action])) return;

    try {
        const result = await api.request(`/isp/subscribers/${id}/${action}`, {
            method: 'POST',
            body: { reason: `manual ${action} from billing dashboard` }
        });

        toast.success(result.message || `${action} completed`);
        await loadBillableSubscribers();
    } catch (error) {
        toast.error(`${action} failed: ${error.message}`);
    }
}

export function initIspBilling() {
    const todayField = document.getElementById('ispBillingDueBefore');
    if (todayField) {
        const today = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        todayField.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    }

    document.getElementById('ispBillingRefreshBtn')?.addEventListener('click', loadBillableSubscribers);
    document.getElementById('ispBillingFilterBtn')?.addEventListener('click', loadBillableSubscribers);

    document.addEventListener('click', (event) => {
        const actionButton = event.target.closest('.isp-billing-action');
        if (!actionButton) return;
        event.preventDefault();
        runBillingAction(actionButton.dataset.action, actionButton.dataset.id);
    });

    loadBillableSubscribers();
}

initIspBilling();

export default { initIspBilling };
