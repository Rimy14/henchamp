/**
 * NAS Registry Service
 *
 * Manages the routers we control. Each router exists in two places:
 *   * isp_nas          — ours: RouterOS API credentials, health, status
 *   * freeradius.nas   — theirs: the RADIUS shared secret
 *
 * Both are written together, because a router registered in only one of them
 * fails in a confusing way: missing from FreeRADIUS means authentication is
 * silently ignored with no log line at all.
 */

import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';
import * as radius from './radius.service.js';
import { RouterOSClient, RouterOSError } from './routeros.service.js';
import { encrypt, decrypt } from './crypto.js';
import { recordAudit } from './audit.js';

/**
 * Register or update a router.
 *
 * @param {object} input
 * @param {number|null} [userId]
 * @returns {Promise<object>} the stored row (secrets stripped)
 */
export async function upsertNas(input, userId = null) {
    const {
        id = null,
        name,
        shortname,
        nas_ip,
        radius_secret,
        api_host,
        api_port = 443,
        api_user,
        api_password,
        api_use_tls = 1,
        coa_port = 1700,
        status = 'active'
    } = input;

    let nasId = id;

    if (id) {
        // Secrets are optional on update — an admin editing the router's name
        // should not have to retype credentials, and a blank field must not
        // silently wipe them.
        const existing = await getNasRow(id);
        if (!existing) throw new Error(`NAS ${id} not found`);

        await query(
            `UPDATE isp_nas
                SET name = ?, shortname = ?, nas_ip = ?,
                    radius_secret_enc = ?, api_host = ?, api_port = ?,
                    api_user = ?, api_password_enc = ?, api_use_tls = ?,
                    coa_port = ?, status = ?
              WHERE id = ?`,
            [
                name, shortname, nas_ip,
                radius_secret ? encrypt(radius_secret) : existing.radius_secret_enc,
                api_host, api_port, api_user,
                api_password ? encrypt(api_password) : existing.api_password_enc,
                api_use_tls ? 1 : 0, coa_port, status, id
            ]
        );
    } else {
        if (!radius_secret) throw new Error('radius_secret is required when creating a NAS');
        if (!api_password) throw new Error('api_password is required when creating a NAS');

        const result = await query(
            `INSERT INTO isp_nas
                (name, shortname, nas_ip, radius_secret_enc, api_host, api_port,
                 api_user, api_password_enc, api_use_tls, coa_port, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, shortname, nas_ip, encrypt(radius_secret),
                api_host, api_port, api_user, encrypt(api_password),
                api_use_tls ? 1 : 0, coa_port, status
            ]
        );
        nasId = result.insertId;
    }

    // Mirror into FreeRADIUS. Without this row the router's RADIUS packets
    // are dropped without any log entry — the single most common cause of
    // "the router is configured but nothing happens".
    const stored = await getNasRow(nasId);
    await radius.upsertNas({
        nasname: stored.nas_ip,
        shortname: stored.shortname,
        secret: decrypt(stored.radius_secret_enc),
        description: stored.name
    });

    await recordAudit({
        entityType: 'nas',
        entityId: nasId,
        action: id ? 'update' : 'create',
        actorUserId: userId,
        detail: { shortname, nas_ip, api_host }
    });

    return sanitiseNas(stored);
}

/**
 * Verify a router is reachable and record what we found.
 *
 * @param {number} nasId
 * @returns {Promise<{reachable: boolean, info?: object, error?: string}>}
 */
export async function testNasConnection(nasId) {
    const nas = await getNasRow(nasId);
    if (!nas) throw new Error(`NAS ${nasId} not found`);

    const client = buildClient(nas);

    try {
        const info = await client.getSystemInfo();

        await query(
            `UPDATE isp_nas SET last_seen_at = NOW(), last_error = NULL, routeros_version = ? WHERE id = ?`,
            [info.version, nasId]
        );

        logger.info('NAS reachable', { shortname: nas.shortname, version: info.version });
        return { reachable: true, info };
    } catch (error) {
        const message = error instanceof RouterOSError ? error.message : String(error.message);

        await query(`UPDATE isp_nas SET last_error = ? WHERE id = ?`, [message.slice(0, 255), nasId]);

        logger.warn('NAS unreachable', { shortname: nas.shortname, error: message });
        return { reachable: false, error: message };
    }
}

/**
 * A RouterOS client for one router, with credentials decrypted.
 * @param {object} nasRow
 */
export function buildClient(nasRow) {
    return RouterOSClient.fromNasRow({
        api_host: nasRow.api_host,
        api_port: nasRow.api_port,
        api_user: nasRow.api_user,
        api_password: decrypt(nasRow.api_password_enc),
        api_use_tls: nasRow.api_use_tls
    });
}

/**
 * Clients for every active router.
 *
 * The deployment is expected to have one or two routers, so operations that
 * need "all of them" simply iterate. If this ever grows to many sites,
 * sessions should be routed to a specific NAS via isp_sessions.nas_id
 * instead of fanning out.
 *
 * @returns {Promise<Array<{nas: object, client: RouterOSClient}>>}
 */
export async function getActiveClients() {
    const rows = await query(`SELECT * FROM isp_nas WHERE status = 'active'`, []);
    return rows.map((nas) => ({ nas, client: buildClient(nas) }));
}

/**
 * Disconnect a username from every active router.
 *
 * Fans out because we cannot always know which router a subscriber is on —
 * hotspot users roam between sites. Failures are collected rather than
 * thrown: one unreachable router must not prevent the disconnect succeeding
 * on the others, and the caller decides what a partial result means.
 *
 * @param {string} username
 * @returns {Promise<{disconnected: number, errors: Array<{nas: string, error: string}>}>}
 */
export async function disconnectUserEverywhere(username) {
    const clients = await getActiveClients();
    let disconnected = 0;
    const errors = [];

    for (const { nas, client } of clients) {
        try {
            disconnected += await client.disconnectUser(username);
        } catch (error) {
            errors.push({ nas: nas.shortname, error: error.message });
            logger.warn('Disconnect failed on NAS', {
                nas: nas.shortname,
                username,
                error: error.message
            });
        }
    }

    return { disconnected, errors };
}

/**
 * Live sessions across every active router, straight from the routers
 * themselves (not from accounting).
 *
 * This is the ground truth for "who is online right now" — accounting can
 * lag by an interim-update interval, and stale radacct rows can claim
 * sessions that no longer exist.
 */
export async function getAllLiveSessions() {
    const clients = await getActiveClients();
    const sessions = [];
    const errors = [];

    for (const { nas, client } of clients) {
        try {
            const found = await client.getActiveSessions();
            sessions.push(...found.map((s) => ({ ...s, nasId: nas.id, nasName: nas.shortname })));
        } catch (error) {
            errors.push({ nas: nas.shortname, error: error.message });
        }
    }

    return { sessions, errors };
}

// =====================================================
// QUERIES
// =====================================================

export async function getNasRow(id) {
    const rows = await query('SELECT * FROM isp_nas WHERE id = ?', [id]);
    return rows.length ? rows[0] : null;
}

export async function listNas() {
    const rows = await query('SELECT * FROM isp_nas ORDER BY name', []);
    return rows.map(sanitiseNas);
}

export async function deleteNas(id, userId = null) {
    const nas = await getNasRow(id);
    if (!nas) throw new Error(`NAS ${id} not found`);

    await radius.removeNas(nas.shortname);
    await query('DELETE FROM isp_nas WHERE id = ?', [id]);

    await recordAudit({
        entityType: 'nas',
        entityId: id,
        action: 'delete',
        actorUserId: userId,
        detail: { shortname: nas.shortname }
    });
}

/**
 * Strip encrypted columns before anything leaves the service layer.
 * Router admin credentials must never reach an API response.
 */
function sanitiseNas(row) {
    if (!row) return row;
    const { radius_secret_enc, api_password_enc, ...safe } = row;
    return {
        ...safe,
        has_radius_secret: Boolean(radius_secret_enc),
        has_api_password: Boolean(api_password_enc)
    };
}

export { sanitiseNas };
