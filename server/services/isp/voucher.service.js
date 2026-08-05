/**
 * Voucher Service — hotspot access codes (A2) and single-device locking (A5)
 *
 * The client's requirement, verbatim from the brief:
 *   "each voucher/code must lock to one device and not be reshareable"
 *
 * How that is enforced, in two independent layers:
 *   1. MAC BINDING — on first successful login we capture the client MAC
 *      (RADIUS Calling-Station-Id) and write it as a `==` check attribute.
 *      Any later login from a different device is rejected by FreeRADIUS.
 *   2. Simultaneous-Use := 1 on the package group, so even the bound device
 *      cannot run two concurrent sessions.
 *
 * ⚠️ HONEST LIMITS — these are documented for the client, not hidden:
 *
 *   * MAC addresses are trivially spoofable. Any laptop can change its MAC
 *     in one command. This stops casual code-sharing between friends, which
 *     is the actual revenue loss, but it is not a cryptographic guarantee
 *     and no vendor's implementation is.
 *
 *   * Modern phones randomise their MAC per SSID (iOS "Private Wi-Fi
 *     Address", Android "Randomized MAC"). It is normally stable for a given
 *     SSID so binding works day to day — but a user who toggles the setting
 *     or forgets the network gets a NEW MAC and is locked out of a voucher
 *     they paid for. That is why resetBinding() exists and why counter staff
 *     must know about it. A feature that locks out paying customers is worse
 *     than the sharing it prevents unless there is a ten-second fix.
 */

import { query, transaction } from '../../config/database.js';
import logger from '../../utils/logger.js';
import * as radius from './radius.service.js';
import * as provisioning from './provisioning.service.js';
import { encrypt, generateVoucherCode, generateSecret } from './crypto.js';
import { normaliseMac, tryNormaliseMac } from './radius-attributes.js';
import { recordAudit } from './audit.js';

/** Guards against a pathological retry loop if the code space is exhausted. */
const MAX_CODE_ATTEMPTS = 10;

// =====================================================
// GENERATION
// =====================================================

/**
 * Generate a batch of vouchers and provision them into RADIUS.
 *
 * @param {object} options
 * @param {number} options.packageId
 * @param {number} options.quantity
 * @param {number} [options.codeLength=8]
 * @param {number} [options.userId] - who generated them
 * @param {string} [options.notes]
 * @returns {Promise<{batch: object, vouchers: Array, provisioning: object}>}
 */
export async function generateBatch({ packageId, quantity, codeLength = 8, userId = null, notes = null }) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
        throw new RangeError('quantity must be an integer between 1 and 1000');
    }

    const packages = await query(
        `SELECT * FROM isp_packages WHERE id = ? AND status = 'active'`,
        [packageId]
    );
    if (packages.length === 0) {
        throw new Error(`Active package ${packageId} not found`);
    }
    const pkg = packages[0];

    if (pkg.service_type !== 'hotspot') {
        throw new Error(
            `Package ${pkg.code} is a ${pkg.service_type} package — vouchers are for hotspot packages only`
        );
    }

    const batchNo = await nextBatchNumber();

    // The whole batch is created in one transaction: a partially-created
    // batch would leave codes printed on paper that do not exist in the
    // system, or exist without a batch to reconcile them against.
    const created = await transaction(async (conn) => {
        const [batchResult] = await conn.execute(
            `INSERT INTO isp_voucher_batches (batch_no, package_id, quantity, generated_by, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [batchNo, packageId, quantity, userId, notes]
        );
        const batchId = batchResult.insertId;

        const vouchers = [];
        for (let i = 0; i < quantity; i++) {
            const { code, secret } = await insertUniqueVoucher(conn, {
                batchId,
                packageId,
                codeLength,
                price: pkg.price
            });
            vouchers.push({ code, secret });
        }

        return { batchId, vouchers };
    });

    // Provision outside the app transaction. RADIUS lives in a separate
    // database, so it cannot participate in this transaction anyway — and
    // holding the app transaction open across hundreds of RADIUS round-trips
    // would lock isp_vouchers for the duration.
    const rows = await query(
        `SELECT * FROM isp_vouchers WHERE batch_id = ? ORDER BY id`,
        [created.batchId]
    );
    const result = await provisioning.provisionVoucherBatch(rows, pkg);

    await recordAudit({
        entityType: 'voucher_batch',
        entityId: created.batchId,
        action: 'generate',
        actorUserId: userId,
        detail: { batchNo, quantity, packageCode: pkg.code, provisioned: result.provisioned }
    });

    const batch = (await query('SELECT * FROM isp_voucher_batches WHERE id = ?', [created.batchId]))[0];

    logger.info('Generated voucher batch', {
        batchNo,
        quantity,
        package: pkg.code,
        provisioned: result.provisioned
    });

    return {
        batch,
        // Plaintext codes are returned ONCE, for printing. They are not
        // retrievable later — secret_enc is encrypted and the API never
        // exposes it.
        vouchers: created.vouchers,
        provisioning: result
    };
}

/**
 * Insert one voucher, retrying on code collision.
 *
 * Collisions are astronomically unlikely (30^8 code space) but the unique
 * index is the actual guarantee — randomness alone is not a uniqueness
 * proof, and a duplicate here would mean two customers sharing an account.
 */
async function insertUniqueVoucher(conn, { batchId, packageId, codeLength, price }) {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const code = generateVoucherCode(codeLength);
        const secret = generateSecret(12);

        try {
            await conn.execute(
                `INSERT INTO isp_vouchers (batch_id, code, secret_enc, package_id, price, status)
                 VALUES (?, ?, ?, ?, ?, 'unused')`,
                [batchId, code, encrypt(secret), packageId, price]
            );
            return { code, secret };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') continue;
            throw error;
        }
    }

    throw new Error(
        `Could not generate a unique voucher code after ${MAX_CODE_ATTEMPTS} attempts — ` +
        `increase codeLength`
    );
}

async function nextBatchNumber() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `HC-VB-${today}`;

    const rows = await query(
        `SELECT batch_no FROM isp_voucher_batches
          WHERE batch_no LIKE ? ORDER BY batch_no DESC LIMIT 1`,
        [`${prefix}%`]
    );

    const sequence = rows.length ? parseInt(rows[0].batch_no.slice(-3), 10) + 1 : 1;
    return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

// =====================================================
// A5 — DEVICE BINDING
// =====================================================

/**
 * Bind a voucher to the first device that used it.
 *
 * Called by the accounting ingester when it sees a session for a voucher
 * that has no binding yet. Doing it from our own poller rather than the
 * FreeRADIUS-side cron/exec/SQL-trigger hacks common in MikroTik tutorials
 * keeps the logic in one language, under test, and auditable.
 *
 * Idempotent and race-safe: the UPDATE is conditional on bound_mac still
 * being NULL, so two concurrent ingests cannot bind different devices. The
 * loser observes `changedRows === 0` and leaves the winner's binding intact.
 *
 * @param {number} voucherId
 * @param {string} mac - raw Calling-Station-Id from accounting
 * @returns {Promise<{bound: boolean, mac: string|null, reason?: string}>}
 */
export async function bindVoucherToDevice(voucherId, mac) {
    const normalised = tryNormaliseMac(mac);

    if (!normalised) {
        // Some firmware omits Calling-Station-Id on PPPoE. Not an error —
        // there is simply nothing to bind to.
        logger.debug('Skipping voucher binding: no usable MAC', { voucherId, mac });
        return { bound: false, mac: null, reason: 'no_mac' };
    }

    const result = await query(
        `UPDATE isp_vouchers
            SET bound_mac = ?, bound_at = NOW(),
                status = CASE WHEN status = 'unused' THEN 'active' ELSE status END,
                first_used_at = COALESCE(first_used_at, NOW())
          WHERE id = ? AND bound_mac IS NULL`,
        [normalised, voucherId]
    );

    if (result.affectedRows === 0) {
        return { bound: false, mac: null, reason: 'already_bound' };
    }

    const voucher = await getVoucherById(voucherId);
    await radius.bindUserToMac(voucher.code, normalised);
    await applyExpiry(voucher);

    await recordAudit({
        entityType: 'voucher',
        entityId: voucherId,
        action: 'bind_mac',
        detail: { mac: normalised, code: voucher.code }
    });

    logger.info('Bound voucher to device', { code: voucher.code, mac: normalised });
    return { bound: true, mac: normalised };
}

/**
 * Clear a voucher's device lock so it can be used from a different device.
 *
 * The support action for the MAC-randomisation problem described at the top
 * of this file. Deliberately counted (binding_resets) and audited — a
 * voucher reset ten times is being shared, and the counter should see that.
 *
 * @param {number} voucherId
 * @param {number|null} userId
 * @param {string} [reason]
 */
export async function resetBinding(voucherId, userId = null, reason = 'support request') {
    const voucher = await getVoucherById(voucherId);
    if (!voucher) throw new Error(`Voucher ${voucherId} not found`);

    if (voucher.status === 'revoked' || voucher.status === 'expired') {
        throw new Error(`Cannot reset binding on a ${voucher.status} voucher`);
    }

    const previousMac = voucher.bound_mac;

    await query(
        `UPDATE isp_vouchers
            SET bound_mac = NULL, bound_at = NULL, binding_resets = binding_resets + 1
          WHERE id = ?`,
        [voucherId]
    );

    await radius.unbindUserMac(voucher.code);

    await recordAudit({
        entityType: 'voucher',
        entityId: voucherId,
        action: 'reset_binding',
        actorUserId: userId,
        detail: {
            code: voucher.code,
            previousMac,
            reason,
            resetCount: voucher.binding_resets + 1
        }
    });

    logger.info('Reset voucher binding', {
        code: voucher.code,
        previousMac,
        resetCount: voucher.binding_resets + 1
    });

    return { code: voucher.code, previousMac, resetCount: voucher.binding_resets + 1 };
}

/**
 * Would this device be allowed to use this voucher?
 *
 * FreeRADIUS is what actually enforces the rule; this mirrors the logic for
 * the admin UI and for tests, so support staff can answer "why was I
 * rejected?" without reading RADIUS debug output.
 *
 * @param {object} voucher
 * @param {string} mac
 * @returns {{allowed: boolean, reason: string}}
 */
export function evaluateDeviceAccess(voucher, mac) {
    if (voucher.status === 'revoked') return { allowed: false, reason: 'voucher_revoked' };
    if (voucher.status === 'expired') return { allowed: false, reason: 'voucher_expired' };
    if (voucher.status === 'used') return { allowed: false, reason: 'voucher_used' };

    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
        return { allowed: false, reason: 'voucher_expired' };
    }

    if (!voucher.bound_mac) {
        return { allowed: true, reason: 'unbound_first_use' };
    }

    const candidate = tryNormaliseMac(mac);
    if (!candidate) return { allowed: false, reason: 'invalid_mac' };

    return candidate === voucher.bound_mac
        ? { allowed: true, reason: 'bound_device' }
        : { allowed: false, reason: 'different_device' };
}

// =====================================================
// LIFECYCLE
// =====================================================

/**
 * Set expires_at once a voucher is first used.
 *
 * Validity is measured from FIRST USE, not from generation. A shop can print
 * a month of stock in advance without it decaying on the shelf, which is how
 * the client actually wants to sell these.
 */
async function applyExpiry(voucher) {
    const packages = await query('SELECT * FROM isp_packages WHERE id = ?', [voucher.package_id]);
    if (packages.length === 0) return;

    const pkg = packages[0];
    let expiresAt = null;

    if (pkg.validity_minutes) {
        expiresAt = new Date(Date.now() + pkg.validity_minutes * 60_000);
    } else if (pkg.validity_days) {
        expiresAt = new Date(Date.now() + pkg.validity_days * 86_400_000);
    }

    if (expiresAt) {
        await query('UPDATE isp_vouchers SET expires_at = ? WHERE id = ? AND expires_at IS NULL', [
            expiresAt,
            voucher.id
        ]);
    }
}

/**
 * Revoke a voucher — immediate, permanent, removes it from RADIUS.
 * Used when a code is leaked or a sale is reversed.
 *
 * @param {number} voucherId
 * @param {number|null} userId
 * @param {string} [reason]
 */
export async function revokeVoucher(voucherId, userId = null, reason = 'revoked by admin') {
    const voucher = await getVoucherById(voucherId);
    if (!voucher) throw new Error(`Voucher ${voucherId} not found`);
    if (voucher.status === 'revoked') return voucher;   // idempotent

    await query(`UPDATE isp_vouchers SET status = 'revoked' WHERE id = ?`, [voucherId]);
    await provisioning.deprovisionVoucher(voucher);

    await recordAudit({
        entityType: 'voucher',
        entityId: voucherId,
        action: 'revoke',
        actorUserId: userId,
        detail: { code: voucher.code, reason, previousStatus: voucher.status }
    });

    logger.info('Revoked voucher', { code: voucher.code, reason });
    return getVoucherById(voucherId);
}

/**
 * Expire vouchers whose validity window has closed. Run by the expiry job.
 *
 * @returns {Promise<{expired: number}>}
 */
export async function expireDueVouchers() {
    const due = await query(
        `SELECT * FROM isp_vouchers
          WHERE status IN ('active','unused')
            AND expires_at IS NOT NULL
            AND expires_at <= NOW()`,
        []
    );

    let expired = 0;
    for (const voucher of due) {
        try {
            await query(`UPDATE isp_vouchers SET status = 'expired' WHERE id = ?`, [voucher.id]);
            await provisioning.deprovisionVoucher(voucher);
            await recordAudit({
                entityType: 'voucher',
                entityId: voucher.id,
                action: 'expire',
                detail: { code: voucher.code, expiresAt: voucher.expires_at }
            });
            expired++;
        } catch (error) {
            logger.error('Failed to expire voucher', { code: voucher.code, error: error.message });
        }
    }

    if (expired > 0) logger.info('Expired vouchers', { expired });
    return { expired };
}

// =====================================================
// QUERIES
// =====================================================

export async function getVoucherById(id) {
    const rows = await query('SELECT * FROM isp_vouchers WHERE id = ?', [id]);
    return rows.length ? rows[0] : null;
}

export async function getVoucherByCode(code) {
    const rows = await query('SELECT * FROM isp_vouchers WHERE code = ?', [code]);
    return rows.length ? rows[0] : null;
}

/**
 * Aggregate state of a batch, for the print/reconcile view.
 * @param {number} batchId
 */
export async function getBatchSummary(batchId) {
    const rows = await query(
        `SELECT b.*, p.name AS package_name, p.code AS package_code, u.username AS generated_by_name,
                COUNT(v.id) AS total,
                SUM(v.status = 'unused')  AS unused,
                SUM(v.status = 'active')  AS active,
                SUM(v.status = 'used')    AS used,
                SUM(v.status = 'expired') AS expired,
                SUM(v.status = 'revoked') AS revoked,
                SUM(v.bound_mac IS NOT NULL) AS bound
           FROM isp_voucher_batches b
           LEFT JOIN isp_packages p ON p.id = b.package_id
           LEFT JOIN users u        ON u.id = b.generated_by
           LEFT JOIN isp_vouchers v ON v.batch_id = b.id
          WHERE b.id = ?
          GROUP BY b.id`,
        [batchId]
    );
    return rows.length ? rows[0] : null;
}

/**
 * Normalise a MAC for callers outside this module (controllers validating
 * user input). Re-exported so the validation rule lives in one place.
 */
export { normaliseMac };
