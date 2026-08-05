/**
 * Subscriber Lifecycle Service
 *
 * ⚠️ THIS IS THE INTEGRATION SURFACE WITH DEV 2 (Section B — billing).
 * Signatures here are a contract. Changing one breaks the billing engine, so
 * changes go through a conversation, not a commit. See docs/ISP_PLAN.md §4.
 *
 * Dev 2 calls:
 *   activateSubscriber()   after first payment clears
 *   suspendSubscriber()    when a cycle ends unpaid past grace
 *   restoreSubscriber()    when a payment webhook confirms settlement
 *   setGrace()             when a cycle ends but grace is allowed
 *   getBillableSubscribers() from the nightly billing cron
 *
 * ── IDEMPOTENCY IS NOT OPTIONAL ──────────────────────────────────────────
 * M-Pesa Daraja retries webhooks. Every one of these functions WILL be
 * called two or three times for a single real-world payment. Each therefore
 * checks current state first and no-ops if already there. Critically,
 * restoreSubscriber() must never extend a billing cycle twice — that would
 * hand the customer a free month for each duplicate webhook.
 *
 * ── SUSPENSION IS TWO LAYERS ─────────────────────────────────────────────
 *   1. RADIUS policy change  -> blocks the NEXT authentication
 *   2. Live session kick     -> ends the session happening RIGHT NOW
 * Doing only (1) is the classic bug: a PPPoE session can stay up for weeks
 * and never re-authenticates, so the "suspended" customer stays online.
 */

import { query, transaction } from '../../config/database.js';
import logger from '../../utils/logger.js';
import * as radius from './radius.service.js';
import * as provisioning from './provisioning.service.js';
import * as nasService from './nas.service.js';
import { recordAudit } from './audit.js';

/** The shared vocabulary. Dev 2 must not invent values outside this set. */
export const SUBSCRIBER_STATUS = Object.freeze({
    PENDING: 'pending',
    ACTIVE: 'active',
    GRACE: 'grace',
    SUSPENDED: 'suspended',
    TERMINATED: 'terminated'
});

/** Statuses in which a subscriber is permitted to authenticate. */
const ONLINE_STATUSES = new Set([SUBSCRIBER_STATUS.ACTIVE, SUBSCRIBER_STATUS.GRACE]);

// =====================================================
// ACTIVATE
// =====================================================

/**
 * Put a subscriber into service.
 *
 * Idempotent: activating an already-active subscriber whose cycle covers the
 * requested period returns without extending anything.
 *
 * @param {number} subscriberId
 * @param {object} options
 * @param {string|Date} [options.periodStart] - defaults to today
 * @param {string|Date} [options.periodEnd]   - defaults to package validity_days
 * @param {string} [options.reason]
 * @param {number|null} [options.actorUserId]
 * @returns {Promise<{subscriber: object, changed: boolean}>}
 */
export async function activateSubscriber(subscriberId, {
    periodStart = null,
    periodEnd = null,
    reason = 'activation',
    actorUserId = null
} = {}) {
    const subscriber = await getSubscriber(subscriberId);
    if (!subscriber) throw new Error(`Subscriber ${subscriberId} not found`);

    if (subscriber.status === SUBSCRIBER_STATUS.TERMINATED) {
        throw new Error(
            `Subscriber ${subscriber.subscriber_code} is terminated and cannot be activated. ` +
            `Create a new subscriber record instead.`
        );
    }

    const pkg = await getPackage(subscriber.package_id);
    const start = toDate(periodStart) || new Date();
    const end = toDate(periodEnd) || addDays(start, pkg?.validity_days || 30);

    // Already active and already covered — a duplicate call. Do nothing.
    if (
        subscriber.status === SUBSCRIBER_STATUS.ACTIVE &&
        subscriber.billing_cycle_end &&
        new Date(subscriber.billing_cycle_end) >= end
    ) {
        logger.info('activateSubscriber: already active and covered, no-op', {
            code: subscriber.subscriber_code
        });
        return { subscriber, changed: false };
    }

    await provisioning.provisionSubscriber(subscriber, pkg);
    await radius.unblockUser(subscriber.radius_username);

    await query(
        `UPDATE isp_subscribers
            SET status = 'active', status_reason = ?, status_changed_at = NOW(),
                billing_cycle_start = ?, billing_cycle_end = ?, grace_until = NULL,
                installed_at = COALESCE(installed_at, NOW())
          WHERE id = ?`,
        [reason, toSqlDate(start), toSqlDate(end), subscriberId]
    );

    await recordAudit({
        entityType: 'subscriber',
        entityId: subscriberId,
        action: 'activate',
        actorUserId,
        detail: {
            code: subscriber.subscriber_code,
            previousStatus: subscriber.status,
            periodStart: toSqlDate(start),
            periodEnd: toSqlDate(end),
            reason
        }
    });

    logger.info('Activated subscriber', {
        code: subscriber.subscriber_code,
        until: toSqlDate(end)
    });

    return { subscriber: await getSubscriber(subscriberId), changed: true };
}

// =====================================================
// SUSPEND
// =====================================================

/**
 * Cut off a subscriber.
 *
 * Both layers run: RADIUS policy is changed so the next login is refused,
 * and any live session is terminated on every active router.
 *
 * A router being unreachable does NOT fail the call. The policy change has
 * already landed, so the subscriber cannot re-authenticate; the stale
 * session is reported in `errors` and will drop on its own. Throwing here
 * would leave the database saying "active" while RADIUS says "blocked" —
 * strictly worse.
 *
 * @param {number} subscriberId
 * @param {object} options
 * @param {string} options.reason
 * @param {boolean} [options.disconnectNow=true]
 * @param {number|null} [options.actorUserId]
 * @returns {Promise<{subscriber, changed, disconnected, errors}>}
 */
export async function suspendSubscriber(subscriberId, {
    reason = 'non-payment',
    disconnectNow = true,
    actorUserId = null
} = {}) {
    const subscriber = await getSubscriber(subscriberId);
    if (!subscriber) throw new Error(`Subscriber ${subscriberId} not found`);

    if (subscriber.status === SUBSCRIBER_STATUS.SUSPENDED) {
        logger.info('suspendSubscriber: already suspended, no-op', {
            code: subscriber.subscriber_code
        });
        return { subscriber, changed: false, disconnected: 0, errors: [] };
    }

    // Layer 1 — block future authentication.
    await radius.blockUser(subscriber.radius_username);

    await query(
        `UPDATE isp_subscribers
            SET status = 'suspended', status_reason = ?, status_changed_at = NOW(), grace_until = NULL
          WHERE id = ?`,
        [reason, subscriberId]
    );

    // Layer 2 — end the session that is up right now.
    let disconnected = 0;
    let errors = [];
    if (disconnectNow) {
        const result = await nasService.disconnectUserEverywhere(subscriber.radius_username);
        disconnected = result.disconnected;
        errors = result.errors;
    }

    await recordAudit({
        entityType: 'subscriber',
        entityId: subscriberId,
        action: 'suspend',
        actorUserId,
        detail: {
            code: subscriber.subscriber_code,
            previousStatus: subscriber.status,
            reason,
            disconnected,
            routerErrors: errors
        }
    });

    logger.info('Suspended subscriber', {
        code: subscriber.subscriber_code,
        reason,
        disconnected,
        routerErrors: errors.length
    });

    return { subscriber: await getSubscriber(subscriberId), changed: true, disconnected, errors };
}

// =====================================================
// RESTORE
// =====================================================

/**
 * Reverse a suspension — the payment-received path.
 *
 * ⚠️ The cycle extension is guarded. Daraja will deliver the same payment
 * confirmation more than once; extending on every call would give away a
 * free month per duplicate. `extendCycle` only takes effect when the current
 * cycle has actually lapsed.
 *
 * @param {number} subscriberId
 * @param {object} options
 * @param {string} [options.reason]
 * @param {boolean} [options.extendCycle=true]
 * @param {number} [options.extendDays] - defaults to package validity_days
 * @param {number|null} [options.actorUserId]
 */
export async function restoreSubscriber(subscriberId, {
    reason = 'payment received',
    extendCycle = true,
    extendDays = null,
    actorUserId = null
} = {}) {
    const subscriber = await getSubscriber(subscriberId);
    if (!subscriber) throw new Error(`Subscriber ${subscriberId} not found`);

    if (subscriber.status === SUBSCRIBER_STATUS.TERMINATED) {
        throw new Error(`Subscriber ${subscriber.subscriber_code} is terminated and cannot be restored`);
    }

    const alreadyActive = subscriber.status === SUBSCRIBER_STATUS.ACTIVE;
    const cycleStillValid =
        subscriber.billing_cycle_end && new Date(subscriber.billing_cycle_end) >= startOfToday();

    // Fully idempotent path: active AND still within the paid period. This is
    // what a duplicate webhook looks like, and it must change nothing.
    if (alreadyActive && cycleStillValid) {
        logger.info('restoreSubscriber: already active with a valid cycle, no-op', {
            code: subscriber.subscriber_code
        });
        return { subscriber, changed: false, cycleExtended: false };
    }

    const pkg = await getPackage(subscriber.package_id);
    let newCycleEnd = subscriber.billing_cycle_end;
    let cycleExtended = false;

    if (extendCycle && !cycleStillValid) {
        const days = extendDays || pkg?.validity_days || 30;
        // Extend from today rather than from the lapsed end date: a customer
        // who pays two weeks late gets a full period from the payment, not a
        // period already half consumed.
        newCycleEnd = addDays(new Date(), days);
        cycleExtended = true;
    }

    await radius.unblockUser(subscriber.radius_username);

    // Re-provision defensively. If the subscriber was suspended for a long
    // time, or the RADIUS database was restored from backup, their policy
    // rows may be missing entirely — unblocking alone would not be enough.
    await provisioning.provisionSubscriber(subscriber, pkg);

    await query(
        `UPDATE isp_subscribers
            SET status = 'active', status_reason = ?, status_changed_at = NOW(),
                grace_until = NULL,
                billing_cycle_end = ?,
                billing_cycle_start = COALESCE(billing_cycle_start, CURDATE())
          WHERE id = ?`,
        [reason, cycleExtended ? toSqlDate(newCycleEnd) : subscriber.billing_cycle_end, subscriberId]
    );

    await recordAudit({
        entityType: 'subscriber',
        entityId: subscriberId,
        action: 'restore',
        actorUserId,
        detail: {
            code: subscriber.subscriber_code,
            previousStatus: subscriber.status,
            reason,
            cycleExtended,
            newCycleEnd: cycleExtended ? toSqlDate(newCycleEnd) : subscriber.billing_cycle_end
        }
    });

    logger.info('Restored subscriber', {
        code: subscriber.subscriber_code,
        cycleExtended,
        reason
    });

    return { subscriber: await getSubscriber(subscriberId), changed: true, cycleExtended };
}

// =====================================================
// GRACE
// =====================================================

/**
 * Move a subscriber into grace — overdue but still online.
 *
 * Kept as a distinct status rather than a flag on `active` so reporting can
 * separate "paid up" from "we are carrying them", and so the dashboard can
 * show the client who is about to be cut off.
 *
 * @param {number} subscriberId
 * @param {object} options
 * @param {string|Date} options.until
 * @param {string} [options.reason]
 * @param {number|null} [options.actorUserId]
 */
export async function setGrace(subscriberId, { until, reason = 'payment overdue', actorUserId = null } = {}) {
    const subscriber = await getSubscriber(subscriberId);
    if (!subscriber) throw new Error(`Subscriber ${subscriberId} not found`);

    const graceUntil = toDate(until);
    if (!graceUntil) throw new TypeError('setGrace requires an `until` date');

    if (
        subscriber.status === SUBSCRIBER_STATUS.GRACE &&
        subscriber.grace_until &&
        toSqlDate(new Date(subscriber.grace_until)) === toSqlDate(graceUntil)
    ) {
        return { subscriber, changed: false };
    }

    // Grace means still online, so make sure nothing is blocking them — they
    // may be arriving here from a suspended state.
    await radius.unblockUser(subscriber.radius_username);

    await query(
        `UPDATE isp_subscribers
            SET status = 'grace', status_reason = ?, status_changed_at = NOW(), grace_until = ?
          WHERE id = ?`,
        [reason, toSqlDate(graceUntil), subscriberId]
    );

    await recordAudit({
        entityType: 'subscriber',
        entityId: subscriberId,
        action: 'grace',
        actorUserId,
        detail: {
            code: subscriber.subscriber_code,
            previousStatus: subscriber.status,
            graceUntil: toSqlDate(graceUntil),
            reason
        }
    });

    logger.info('Subscriber moved to grace', {
        code: subscriber.subscriber_code,
        until: toSqlDate(graceUntil)
    });

    return { subscriber: await getSubscriber(subscriberId), changed: true };
}

// =====================================================
// TERMINATE
// =====================================================

/**
 * Close an account permanently. Removes RADIUS presence and ends any live
 * session. Accounting history is kept.
 *
 * @param {number} subscriberId
 * @param {object} options
 */
export async function terminateSubscriber(subscriberId, { reason = 'account closed', actorUserId = null } = {}) {
    const subscriber = await getSubscriber(subscriberId);
    if (!subscriber) throw new Error(`Subscriber ${subscriberId} not found`);

    if (subscriber.status === SUBSCRIBER_STATUS.TERMINATED) {
        return { subscriber, changed: false, disconnected: 0 };
    }

    const { disconnected } = await nasService.disconnectUserEverywhere(subscriber.radius_username);
    await provisioning.deprovisionSubscriber(subscriber);

    await query(
        `UPDATE isp_subscribers
            SET status = 'terminated', status_reason = ?, status_changed_at = NOW(), grace_until = NULL
          WHERE id = ?`,
        [reason, subscriberId]
    );

    await recordAudit({
        entityType: 'subscriber',
        entityId: subscriberId,
        action: 'terminate',
        actorUserId,
        detail: { code: subscriber.subscriber_code, previousStatus: subscriber.status, reason, disconnected }
    });

    logger.info('Terminated subscriber', { code: subscriber.subscriber_code, reason });
    return { subscriber: await getSubscriber(subscriberId), changed: true, disconnected };
}

// =====================================================
// BILLING SUPPORT (read paths for Dev 2)
// =====================================================

/**
 * Subscribers whose billing cycle ends on or before `dueBefore`.
 * The input to Dev 2's nightly billing run.
 *
 * @param {object} options
 * @param {string|Date} [options.dueBefore] - defaults to today
 * @param {string[]} [options.statuses]
 * @returns {Promise<Array>}
 */
export async function getBillableSubscribers({ dueBefore = null, statuses = ['active', 'grace'] } = {}) {
    const cutoff = toSqlDate(toDate(dueBefore) || new Date());
    const placeholders = statuses.map(() => '?').join(', ');

    return query(
        `SELECT s.*, p.code AS package_code, p.name AS package_name,
                p.price AS package_price, p.currency, p.validity_days
           FROM isp_subscribers s
           JOIN isp_packages p ON p.id = s.package_id
          WHERE s.status IN (${placeholders})
            AND s.billing_cycle_end IS NOT NULL
            AND s.billing_cycle_end <= ?
          ORDER BY s.billing_cycle_end ASC`,
        [...statuses, cutoff]
    );
}

/**
 * Subscribers in grace whose grace window has now closed — the ones Dev 2's
 * cron should suspend.
 *
 * @returns {Promise<Array>}
 */
export async function getExpiredGraceSubscribers() {
    return query(
        `SELECT * FROM isp_subscribers
          WHERE status = 'grace' AND grace_until IS NOT NULL AND grace_until < CURDATE()
          ORDER BY grace_until ASC`,
        []
    );
}

/**
 * Whether a subscriber should currently be able to get online.
 * Used by the sync checker and by tests.
 *
 * @param {object} subscriber
 * @returns {boolean}
 */
export function shouldBeOnline(subscriber) {
    return ONLINE_STATUSES.has(subscriber.status);
}

// =====================================================
// HELPERS
// =====================================================

async function getSubscriber(id) {
    const rows = await query('SELECT * FROM isp_subscribers WHERE id = ?', [id]);
    return rows.length ? rows[0] : null;
}

async function getPackage(id) {
    const rows = await query('SELECT * FROM isp_packages WHERE id = ?', [id]);
    return rows.length ? rows[0] : null;
}

function toDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

/**
 * Format as YYYY-MM-DD in LOCAL time.
 *
 * Deliberately not toISOString().slice(0,10): that converts to UTC first, so
 * for a Kenya deployment (UTC+3) any time before 03:00 local would be
 * recorded as the previous day, shifting every billing boundary.
 */
function toSqlDate(date) {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

export { toSqlDate };
