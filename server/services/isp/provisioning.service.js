/**
 * Provisioning Service
 *
 * Projects our business objects (packages, subscribers, vouchers) into the
 * RADIUS policy rows that FreeRADIUS reads.
 *
 * Everything here is IDEMPOTENT and CONVERGENT. Re-provisioning an object
 * must produce the same end state, never duplicates and never a leftover
 * attribute from a previous definition. That property is what makes it safe
 * to re-run provisioning as a repair action when the RADIUS side has drifted
 * — which it will, because two databases cannot be updated in one
 * transaction.
 *
 * Consistency model: our tables are the source of truth. If a write to the
 * RADIUS side fails, the app-side row is rolled back where possible, and
 * reprovision*() can always be called to force convergence.
 */

import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';
import * as radius from './radius.service.js';
import { decrypt } from './crypto.js';
import {
    buildGroupCheckAttributes,
    buildGroupReplyAttributes
} from './radius-attributes.js';

// =====================================================
// PACKAGES -> RADIUS GROUPS
// =====================================================

/**
 * Write a package's definition into its RADIUS group.
 *
 * Called on package create and on every package edit. Because
 * replaceGroupPolicy() wipes and rewrites, editing a package from "10 Mbps
 * capped at 20 GB" to "10 Mbps uncapped" correctly removes the data-cap
 * attributes rather than leaving them behind.
 *
 * @param {object} pkg - row from isp_packages
 */
export async function provisionPackage(pkg) {
    const check = buildGroupCheckAttributes(pkg);
    const reply = buildGroupReplyAttributes(pkg);

    await radius.replaceGroupPolicy(pkg.radius_group, check, reply);

    logger.info('Provisioned package', {
        code: pkg.code,
        group: pkg.radius_group,
        rateLimit: reply.find((a) => a.attribute === 'Mikrotik-Rate-Limit')?.value ?? 'none'
    });
}

/**
 * Re-provision every active package. Used by the repair endpoint and after a
 * RADIUS database restore.
 *
 * @returns {Promise<{provisioned: number, failed: Array}>}
 */
export async function provisionAllPackages() {
    const packages = await query(
        `SELECT * FROM isp_packages WHERE status = 'active'`,
        []
    );

    const failed = [];
    let provisioned = 0;

    for (const pkg of packages) {
        try {
            await provisionPackage(pkg);
            provisioned++;
        } catch (error) {
            failed.push({ code: pkg.code, error: error.message });
            logger.error('Failed to provision package', { code: pkg.code, error: error.message });
        }
    }

    return { provisioned, failed };
}

// =====================================================
// SUBSCRIBERS -> RADIUS USERS
// =====================================================

/**
 * Write a subscriber's credentials and package membership into RADIUS.
 *
 * Does NOT decide whether they are allowed online — that is the lifecycle
 * service's job via block/unblock. Provisioning only establishes identity
 * and tariff.
 *
 * @param {object} subscriber - row from isp_subscribers (with radius_secret_enc)
 * @param {object} [pkg] - the package row; fetched if omitted
 */
export async function provisionSubscriber(subscriber, pkg = null) {
    const targetPackage = pkg || (await getPackage(subscriber.package_id));

    if (!targetPackage) {
        throw new Error(`Package ${subscriber.package_id} not found for subscriber ${subscriber.subscriber_code}`);
    }

    const secret = decrypt(subscriber.radius_secret_enc);

    await radius.setUserPassword(subscriber.radius_username, secret);
    await radius.setUserGroup(subscriber.radius_username, targetPackage.radius_group);

    logger.info('Provisioned subscriber', {
        code: subscriber.subscriber_code,
        username: subscriber.radius_username,
        group: targetPackage.radius_group
    });
}

/**
 * Move a subscriber onto a different package.
 *
 * Only touches group membership — the credential stays the same, so an
 * upgrade does not force the customer to reconfigure their home router.
 *
 * The new speed applies at their next authentication. Existing sessions keep
 * the old rate limit until they reconnect; changing a live session's speed
 * requires a RADIUS CoA-Request, which is planned for v2. Callers that need
 * it immediate should disconnect the subscriber afterwards.
 *
 * @param {object} subscriber
 * @param {object} newPackage
 */
export async function changeSubscriberPackage(subscriber, newPackage) {
    await radius.setUserGroup(subscriber.radius_username, newPackage.radius_group);

    logger.info('Changed subscriber package', {
        code: subscriber.subscriber_code,
        group: newPackage.radius_group
    });
}

/**
 * Remove a subscriber's RADIUS presence entirely. Accounting history in
 * radacct is preserved.
 *
 * @param {object} subscriber
 */
export async function deprovisionSubscriber(subscriber) {
    await radius.deprovisionUser(subscriber.radius_username);
    logger.info('Deprovisioned subscriber', { code: subscriber.subscriber_code });
}

// =====================================================
// VOUCHERS -> RADIUS USERS
// =====================================================

/**
 * Provision one voucher as a RADIUS user.
 *
 * The printed code is the username. Any existing MAC binding is re-applied
 * so that repairing a voucher does not accidentally unlock it for a
 * different device.
 *
 * @param {object} voucher - row from isp_vouchers
 * @param {object} [pkg]
 */
export async function provisionVoucher(voucher, pkg = null) {
    const targetPackage = pkg || (await getPackage(voucher.package_id));

    if (!targetPackage) {
        throw new Error(`Package ${voucher.package_id} not found for voucher ${voucher.code}`);
    }

    const secret = decrypt(voucher.secret_enc);

    await radius.setUserPassword(voucher.code, secret);
    await radius.setUserGroup(voucher.code, targetPackage.radius_group);

    if (voucher.bound_mac) {
        await radius.bindUserToMac(voucher.code, voucher.bound_mac);
    }
}

/**
 * Provision a batch of vouchers.
 *
 * Sequential rather than parallel: each voucher is several statements
 * against the RADIUS pool, and a batch of 500 fired concurrently would
 * exhaust the connection pool and starve live authentication traffic.
 * Throughput is not the constraint here — batch generation is a rare,
 * operator-initiated action.
 *
 * @param {Array<object>} vouchers
 * @param {object} pkg
 * @returns {Promise<{provisioned: number, failed: Array}>}
 */
export async function provisionVoucherBatch(vouchers, pkg) {
    const failed = [];
    let provisioned = 0;

    for (const voucher of vouchers) {
        try {
            await provisionVoucher(voucher, pkg);
            provisioned++;
        } catch (error) {
            failed.push({ code: voucher.code, error: error.message });
            logger.error('Failed to provision voucher', { code: voucher.code, error: error.message });
        }
    }

    logger.info('Provisioned voucher batch', { provisioned, failed: failed.length });
    return { provisioned, failed };
}

/**
 * @param {object} voucher
 */
export async function deprovisionVoucher(voucher) {
    await radius.deprovisionUser(voucher.code);
}

// =====================================================
// DRIFT DETECTION
// =====================================================

/**
 * Compare our view of a subscriber with what RADIUS actually holds.
 *
 * Drift is expected occasionally: the two databases cannot be written in one
 * transaction, so a crash between the two writes leaves them inconsistent.
 * This powers an admin "check" action that surfaces the problem instead of
 * waiting for a subscriber to report they cannot connect.
 *
 * @param {object} subscriber
 * @returns {Promise<{inSync: boolean, issues: string[], radius: object}>}
 */
export async function checkSubscriberSync(subscriber) {
    const state = await radius.describeUser(subscriber.radius_username);
    const pkg = await getPackage(subscriber.package_id);
    const issues = [];

    if (!state.check.some((a) => a.attribute === 'Cleartext-Password')) {
        issues.push('No password set in RADIUS — subscriber cannot authenticate');
    }

    if (!state.group) {
        issues.push('No RADIUS group membership — no speed limit or session policy will apply');
    } else if (pkg && state.group !== pkg.radius_group) {
        issues.push(
            `RADIUS group "${state.group}" does not match package group "${pkg.radius_group}"`
        );
    }

    const shouldBeBlocked = ['suspended', 'terminated'].includes(subscriber.status);
    if (shouldBeBlocked && !state.blocked) {
        issues.push(`Status is "${subscriber.status}" but RADIUS still permits authentication`);
    }
    if (!shouldBeBlocked && state.blocked) {
        issues.push(`Status is "${subscriber.status}" but RADIUS is blocking authentication`);
    }

    return { inSync: issues.length === 0, issues, radius: state };
}

/**
 * Force a subscriber's RADIUS state to match ours. The repair action for
 * whatever checkSubscriberSync() reported.
 *
 * @param {object} subscriber
 */
export async function repairSubscriber(subscriber) {
    await provisionSubscriber(subscriber);

    if (['suspended', 'terminated'].includes(subscriber.status)) {
        await radius.blockUser(subscriber.radius_username);
    } else {
        await radius.unblockUser(subscriber.radius_username);
    }

    logger.info('Repaired subscriber RADIUS state', { code: subscriber.subscriber_code });
}

// =====================================================
// HELPERS
// =====================================================

async function getPackage(packageId) {
    const rows = await query('SELECT * FROM isp_packages WHERE id = ?', [packageId]);
    return rows.length ? rows[0] : null;
}
