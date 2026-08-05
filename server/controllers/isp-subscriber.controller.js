/**
 * ISP Subscriber Controller
 *
 * PPPoE / fixed subscriber accounts (A1, A3) and the lifecycle actions that
 * cut service on and off (feeding B1/B2).
 *
 * Lifecycle endpoints delegate to services/isp/lifecycle.service.js — the
 * same functions Dev 2's billing engine calls — so a manual suspend from the
 * admin UI and an automatic suspend from the billing cron take an identical
 * code path. There is no second implementation to drift.
 */

import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import * as lifecycle from '../services/isp/lifecycle.service.js';
import * as provisioning from '../services/isp/provisioning.service.js';
import * as accounting from '../services/isp/accounting.service.js';
import * as nasService from '../services/isp/nas.service.js';
import * as radius from '../services/isp/radius.service.js';
import { encrypt, generateSecret } from '../services/isp/crypto.js';
import { getAuditTrail, recordAudit } from '../services/isp/audit.js';

/**
 * List subscribers with their package and live status.
 */
export async function getAllSubscribers(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 25;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (req.query.status) {
            whereClause += ' AND s.status = ?';
            params.push(req.query.status);
        }
        if (req.query.package_id) {
            whereClause += ' AND s.package_id = ?';
            params.push(req.query.package_id);
        }
        if (req.query.search) {
            whereClause += ' AND (s.full_name LIKE ? OR s.phone LIKE ? OR s.subscriber_code LIKE ? OR s.radius_username LIKE ?)';
            const term = `%${req.query.search}%`;
            params.push(term, term, term, term);
        }

        const countResult = await query(
            `SELECT COUNT(*) as total FROM isp_subscribers s ${whereClause}`,
            params
        );
        const totalItems = countResult[0].total;

        const subscribers = await query(
            `SELECT s.id, s.subscriber_code, s.customer_id, s.full_name, s.phone, s.email,
                    s.service_type, s.radius_username, s.package_id, s.status, s.status_reason,
                    s.billing_cycle_start, s.billing_cycle_end, s.grace_until,
                    s.static_ip, s.installed_at, s.created_at,
                    p.name AS package_name, p.code AS package_code,
                    p.price AS package_price, p.currency,
                    p.rate_up_kbps, p.rate_down_kbps,
                    EXISTS (
                        SELECT 1 FROM isp_sessions sess
                         WHERE sess.subscriber_id = s.id AND sess.stopped_at IS NULL
                    ) AS is_online
               FROM isp_subscribers s
               LEFT JOIN isp_packages p ON p.id = s.package_id
               ${whereClause}
               ORDER BY s.created_at DESC
               LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({
            success: true,
            data: subscribers,
            pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
        });
    } catch (error) {
        logger.error('Error fetching ISP subscribers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * One subscriber, with package, recent sessions, usage and audit history.
 *
 * Note radius_secret_enc is never selected — the encrypted secret must not
 * leave the server, even to an authenticated admin.
 */
export async function getSubscriberById(req, res) {
    try {
        const { id } = req.params;

        const rows = await query(
            `SELECT s.id, s.subscriber_code, s.customer_id, s.full_name, s.phone, s.email,
                    s.national_id, s.address, s.service_type, s.radius_username,
                    s.package_id, s.status, s.status_reason, s.status_changed_at,
                    s.billing_cycle_start, s.billing_cycle_end, s.grace_until,
                    s.static_ip, s.installed_at, s.notes, s.created_at, s.updated_at,
                    p.name AS package_name, p.code AS package_code, p.price AS package_price,
                    p.currency, p.rate_up_kbps, p.rate_down_kbps, p.data_cap_mb,
                    c.name AS customer_name
               FROM isp_subscribers s
               LEFT JOIN isp_packages p ON p.id = s.package_id
               LEFT JOIN customers c    ON c.id = s.customer_id
              WHERE s.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Subscriber not found' });
        }

        const subscriber = rows[0];

        const [sessions, usage, audit] = await Promise.all([
            query(
                `SELECT acct_unique_id, framed_ip, calling_station_id, started_at,
                        stopped_at, session_seconds, input_octets, output_octets, terminate_cause
                   FROM isp_sessions WHERE subscriber_id = ?
                  ORDER BY started_at DESC LIMIT 20`,
                [id]
            ),
            accounting.getSubscriberUsage(Number(id), {}),
            getAuditTrail('subscriber', Number(id), 20)
        ]);

        res.json({
            success: true,
            data: { ...subscriber, recent_sessions: sessions, usage, audit }
        });
    } catch (error) {
        logger.error('Error fetching ISP subscriber:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Create a subscriber and provision them into RADIUS.
 *
 * The RADIUS password is generated, never supplied. RADIUS needs the
 * cleartext for CHAP, so a customer-chosen password would put a credential
 * they may have reused elsewhere into a recoverable store. The generated
 * secret is returned ONCE here so it can be given to the installer.
 */
export async function createSubscriber(req, res) {
    try {
        const {
            full_name, phone, email, national_id, address,
            customer_id, package_id, service_type = 'pppoe',
            radius_username, static_ip, notes
        } = req.body;

        if (!full_name || !phone || !package_id) {
            return res.status(400).json({
                success: false,
                message: 'full_name, phone and package_id are required'
            });
        }

        const packages = await query(
            `SELECT * FROM isp_packages WHERE id = ? AND status = 'active'`,
            [package_id]
        );
        if (packages.length === 0) {
            return res.status(400).json({ success: false, message: 'Active package not found' });
        }
        const pkg = packages[0];

        const username = (radius_username || phone).trim().toLowerCase();
        const secret = generateSecret(16);
        const subscriberCode = await nextSubscriberCode();

        const result = await query(
            `INSERT INTO isp_subscribers
                (subscriber_code, customer_id, full_name, phone, email, national_id, address,
                 service_type, radius_username, radius_secret_enc, package_id, status, static_ip, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [
                subscriberCode, customer_id || null, full_name, phone, email || null,
                national_id || null, address || null, service_type, username,
                encrypt(secret), package_id, static_ip || null, notes || null
            ]
        );

        const created = (await query('SELECT * FROM isp_subscribers WHERE id = ?', [result.insertId]))[0];
        await provisioning.provisionSubscriber(created, pkg);

        await recordAudit({
            entityType: 'subscriber',
            entityId: created.id,
            action: 'create',
            actorUserId: req.user?.userId,
            detail: { code: subscriberCode, username, package: pkg.code }
        });

        const { radius_secret_enc, ...safe } = created;

        res.status(201).json({
            success: true,
            data: {
                ...safe,
                // Shown once. Not retrievable later.
                radius_password: secret,
                _notice: 'Record this password now — it cannot be retrieved again.'
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'A subscriber with that username already exists'
            });
        }
        logger.error('Error creating ISP subscriber:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Update subscriber details.
 *
 * Status is NOT settable here — it only moves through the lifecycle
 * endpoints, so that every transition provisions RADIUS and writes an audit
 * row. Allowing a bare UPDATE on status is how a database says "suspended"
 * while the customer is still happily online.
 */
export async function updateSubscriber(req, res) {
    try {
        const { id } = req.params;
        const existing = await query('SELECT * FROM isp_subscribers WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Subscriber not found' });
        }

        const current = existing[0];
        const {
            full_name = current.full_name,
            phone = current.phone,
            email = current.email,
            national_id = current.national_id,
            address = current.address,
            customer_id = current.customer_id,
            static_ip = current.static_ip,
            notes = current.notes,
            package_id = current.package_id
        } = req.body;

        const packageChanged = Number(package_id) !== Number(current.package_id);
        let newPackage = null;

        if (packageChanged) {
            const packages = await query(
                `SELECT * FROM isp_packages WHERE id = ? AND status = 'active'`,
                [package_id]
            );
            if (packages.length === 0) {
                return res.status(400).json({ success: false, message: 'Active package not found' });
            }
            newPackage = packages[0];
        }

        await query(
            `UPDATE isp_subscribers
                SET full_name = ?, phone = ?, email = ?, national_id = ?, address = ?,
                    customer_id = ?, static_ip = ?, notes = ?, package_id = ?
              WHERE id = ?`,
            [full_name, phone, email, national_id, address, customer_id, static_ip, notes, package_id, id]
        );

        if (packageChanged) {
            await provisioning.changeSubscriberPackage(current, newPackage);
            await recordAudit({
                entityType: 'subscriber',
                entityId: Number(id),
                action: 'change_package',
                actorUserId: req.user?.userId,
                detail: { from: current.package_id, to: Number(package_id) }
            });
        }

        const updated = (await query(
            `SELECT id, subscriber_code, full_name, phone, email, service_type,
                    radius_username, package_id, status, billing_cycle_end
               FROM isp_subscribers WHERE id = ?`,
            [id]
        ))[0];

        res.json({
            success: true,
            data: updated,
            ...(packageChanged && {
                notice: 'New speed applies at the subscriber\'s next authentication. ' +
                        'Disconnect them to apply it immediately.'
            })
        });
    } catch (error) {
        logger.error('Error updating ISP subscriber:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

// =====================================================
// LIFECYCLE ACTIONS
// =====================================================

/** Activate — put into service. */
export async function activateSubscriber(req, res) {
    await runLifecycle(req, res, () =>
        lifecycle.activateSubscriber(Number(req.params.id), {
            periodStart: req.body.period_start,
            periodEnd: req.body.period_end,
            reason: req.body.reason || 'manual activation',
            actorUserId: req.user?.userId
        })
    );
}

/** Suspend — blocks future auth AND kicks the live session. */
export async function suspendSubscriber(req, res) {
    await runLifecycle(req, res, () =>
        lifecycle.suspendSubscriber(Number(req.params.id), {
            reason: req.body.reason || 'manual suspension',
            disconnectNow: req.body.disconnect_now !== false,
            actorUserId: req.user?.userId
        })
    );
}

/** Restore — the payment-received path. Idempotent. */
export async function restoreSubscriber(req, res) {
    await runLifecycle(req, res, () =>
        lifecycle.restoreSubscriber(Number(req.params.id), {
            reason: req.body.reason || 'manual restore',
            extendCycle: req.body.extend_cycle !== false,
            extendDays: req.body.extend_days || null,
            actorUserId: req.user?.userId
        })
    );
}

/** Grace — overdue but still online. */
export async function graceSubscriber(req, res) {
    if (!req.body.until) {
        return res.status(400).json({ success: false, message: '`until` date is required' });
    }
    await runLifecycle(req, res, () =>
        lifecycle.setGrace(Number(req.params.id), {
            until: req.body.until,
            reason: req.body.reason || 'payment overdue',
            actorUserId: req.user?.userId
        })
    );
}

/** Terminate — permanent closure. */
export async function terminateSubscriber(req, res) {
    await runLifecycle(req, res, () =>
        lifecycle.terminateSubscriber(Number(req.params.id), {
            reason: req.body.reason || 'account closed',
            actorUserId: req.user?.userId
        })
    );
}

/**
 * Kick live sessions without changing status.
 *
 * Used to force a package change to take effect immediately, or to clear a
 * wedged session.
 */
export async function disconnectSubscriber(req, res) {
    try {
        const rows = await query(
            'SELECT radius_username, subscriber_code FROM isp_subscribers WHERE id = ?',
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Subscriber not found' });
        }

        const result = await nasService.disconnectUserEverywhere(rows[0].radius_username);

        await recordAudit({
            entityType: 'subscriber',
            entityId: Number(req.params.id),
            action: 'disconnect',
            actorUserId: req.user?.userId,
            detail: { disconnected: result.disconnected, errors: result.errors }
        });

        res.json({
            success: true,
            data: result,
            message: `Disconnected ${result.disconnected} session(s)`
        });
    } catch (error) {
        logger.error('Error disconnecting subscriber:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

// =====================================================
// DIAGNOSTICS
// =====================================================

/**
 * Compare our state with RADIUS's. Answers "why can this suspended person
 * still get online?" without reading RADIUS debug output.
 */
export async function checkSubscriberSync(req, res) {
    try {
        const rows = await query('SELECT * FROM isp_subscribers WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Subscriber not found' });
        }

        const result = await provisioning.checkSubscriberSync(rows[0]);
        const authHistory = await radius.getAuthHistory(rows[0].radius_username, 10);

        res.json({ success: true, data: { ...result, authHistory } });
    } catch (error) {
        logger.error('Error checking subscriber sync:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Force RADIUS to match our state. */
export async function repairSubscriber(req, res) {
    try {
        const rows = await query('SELECT * FROM isp_subscribers WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Subscriber not found' });
        }

        await provisioning.repairSubscriber(rows[0]);
        const result = await provisioning.checkSubscriberSync(rows[0]);

        await recordAudit({
            entityType: 'subscriber',
            entityId: Number(req.params.id),
            action: 'repair',
            actorUserId: req.user?.userId,
            detail: { inSync: result.inSync }
        });

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error repairing subscriber:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Usage for one subscriber. */
export async function getSubscriberUsage(req, res) {
    try {
        const usage = await accounting.getSubscriberUsage(Number(req.params.id), {
            from: req.query.from || null,
            to: req.query.to || null
        });
        res.json({ success: true, data: usage });
    } catch (error) {
        logger.error('Error fetching subscriber usage:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Subscribers due for billing. Read endpoint for Dev 2's billing engine.
 */
export async function getBillableSubscribers(req, res) {
    try {
        const subscribers = await lifecycle.getBillableSubscribers({
            dueBefore: req.query.due_before || null,
            statuses: req.query.statuses ? req.query.statuses.split(',') : undefined
        });

        res.json({
            success: true,
            data: subscribers.map(({ radius_secret_enc, ...safe }) => safe)
        });
    } catch (error) {
        logger.error('Error fetching billable subscribers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Shared wrapper for lifecycle endpoints.
 *
 * `changed: false` is a success, not an error — it means the requested state
 * was already in place. Dev 2's retrying webhooks depend on that being a
 * 200, otherwise a duplicate M-Pesa callback would look like a failure and
 * be retried forever.
 */
async function runLifecycle(req, res, action) {
    try {
        const result = await action();
        const { radius_secret_enc, ...subscriber } = result.subscriber || {};

        res.json({
            success: true,
            data: { ...result, subscriber },
            message: result.changed ? 'State changed' : 'Already in requested state (no-op)'
        });
    } catch (error) {
        if (/not found/i.test(error.message)) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (/terminated/i.test(error.message)) {
            return res.status(409).json({ success: false, message: error.message });
        }
        logger.error('ISP lifecycle action failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Next subscriber code (HC-ISP-00001).
 *
 * Derived from MAX rather than COUNT so deleting a subscriber cannot cause
 * the next one to reuse a retired code.
 */
async function nextSubscriberCode() {
    const rows = await query(
        `SELECT subscriber_code FROM isp_subscribers
          WHERE subscriber_code LIKE 'HC-ISP-%'
          ORDER BY CAST(SUBSTRING(subscriber_code, 8) AS UNSIGNED) DESC LIMIT 1`,
        []
    );

    const next = rows.length ? parseInt(rows[0].subscriber_code.slice(7), 10) + 1 : 1;
    return `HC-ISP-${String(next).padStart(5, '0')}`;
}
