/**
 * Accounting Service — A6 usage tracking
 *
 * Pipeline:  radacct  ->  isp_sessions  ->  isp_usage_daily
 *
 * We do not measure anything ourselves. The router counts bytes and reports
 * them to FreeRADIUS as Accounting-Requests (Start / Interim-Update / Stop),
 * which land in radacct. This service projects those rows into our schema.
 *
 * ── Why project instead of querying radacct directly ─────────────────────
 *   * radacct belongs to FreeRADIUS and may be rotated or purged by the
 *     RADIUS admin without telling us
 *   * cross-schema joins on every dashboard load do not scale
 *   * the username -> subscriber/voucher resolution should happen once, on
 *     ingest, not on every read
 *
 * ── The 4 GiB counter problem ────────────────────────────────────────────
 * Acct-Input-Octets and Acct-Output-Octets are 32-bit and wrap at 4 GiB.
 * RADIUS carries the high bits separately in Acct-Input-Gigawords (52) and
 * Acct-Output-Gigawords (53).
 *
 * FreeRADIUS's STOCK SQL queries already fold these together before writing
 * radacct.acctinputoctets (a BIGINT), so rows read here are normally correct
 * as-is. We do not silently trust that: assertPlausibleCounters() flags
 * values that look like they were truncated, because a site running
 * customised accounting queries would otherwise under-report every heavy
 * user forever with no visible symptom. Where WE emit limits rather than
 * read them — data caps above 4 GiB — the split is done explicitly in
 * radius-attributes.js.
 *
 * ── Usage is accumulated by DELTA, not by total ──────────────────────────
 * A PPPoE session can stay up for weeks. Attributing its whole byte count to
 * the day it started would make "usage on 14 Aug" meaningless. Instead each
 * ingest computes the change since we last saw that session and credits it
 * to today.
 */

import { query, transaction } from '../../config/database.js';
import logger from '../../utils/logger.js';
import * as radius from './radius.service.js';
import * as voucherService from './voucher.service.js';
import { tryNormaliseMac, GIGAWORD } from './radius-attributes.js';

const JOB_NAME = 'isp_accounting_ingest';
const DEFAULT_BATCH = 500;

// =====================================================
// INGEST
// =====================================================

/**
 * Pull new accounting rows and project them into isp_sessions /
 * isp_usage_daily.
 *
 * Incremental by radacctid watermark, so cost is proportional to new
 * activity rather than to table size. radacct grows without bound on a live
 * system; a full scan per poll would degrade steadily and invisibly.
 *
 * @param {object} [options]
 * @param {number} [options.batchSize]
 * @returns {Promise<{processed, sessionsCreated, sessionsUpdated, bound, watermark}>}
 */
export async function ingestAccounting({ batchSize = DEFAULT_BATCH } = {}) {
    const watermark = await getCursor();

    // Two sources, because a single id watermark is not sufficient.
    //
    //   1. NEW rows           radacctid > watermark
    //   2. CHANGED rows       every session we still believe is open
    //
    // FreeRADIUS UPDATES the existing radacct row for each Interim-Update
    // and for Accounting-Stop rather than inserting a new one. With only the
    // watermark, a session would be read once at Start and every subsequent
    // byte would be invisible — usage would appear to freeze the moment a
    // session was first seen.
    //
    // Re-reading open sessions is cheap: they are bounded by concurrent
    // users, not by the size of radacct, and a closed session can never
    // change again. Re-reading is also harmless — usage accumulates by
    // delta, so an unchanged row contributes zero.
    const openIds = await getOpenSessionUniqueIds();

    const [newRows, changedRows] = await Promise.all([
        radius.getAccountingSince(watermark, batchSize),
        radius.getAccountingByUniqueIds(openIds)
    ]);

    // Deduplicate: a session started this cycle appears in both lists.
    const byUniqueId = new Map();
    for (const row of changedRows) byUniqueId.set(row.acctuniqueid, row);
    for (const row of newRows) byUniqueId.set(row.acctuniqueid, row);

    const rows = [...byUniqueId.values()].sort((a, b) => Number(a.radacctid) - Number(b.radacctid));

    if (rows.length === 0) {
        await touchCursor(watermark, 'idle');
        return {
            processed: 0,
            sessionsCreated: 0,
            sessionsUpdated: 0,
            bound: 0,
            watermark
        };
    }

    let sessionsCreated = 0;
    let sessionsUpdated = 0;
    let bound = 0;

    // Advance only on genuinely new rows. Re-read open sessions must not
    // move the watermark, or a still-open low-id session could push it past
    // higher-id rows that have not been ingested yet.
    let highest = watermark;
    for (const row of newRows) {
        if (Number(row.radacctid) > Number(highest)) highest = row.radacctid;
    }

    for (const row of rows) {
        try {
            const result = await ingestRow(row);
            if (result.created) sessionsCreated++;
            else sessionsUpdated++;
            if (result.bound) bound++;
        } catch (error) {
            // One malformed row must not stall the pipeline forever. Log it,
            // advance past it, keep going — the watermark still moves so the
            // job cannot wedge on a single bad record.
            logger.error('Failed to ingest accounting row', {
                radacctid: row.radacctid,
                username: row.username,
                error: error.message
            });
        }
    }

    await setCursor(highest, 'ok');

    logger.info('Accounting ingest complete', {
        processed: rows.length,
        sessionsCreated,
        sessionsUpdated,
        bound,
        watermark: highest
    });

    return {
        processed: rows.length,
        sessionsCreated,
        sessionsUpdated,
        bound,
        watermark: highest
    };
}

/**
 * acct_unique_ids of every session we still believe is open.
 *
 * These are the only rows in radacct that can still change, so they are the
 * only ones worth re-reading.
 */
async function getOpenSessionUniqueIds() {
    const rows = await query(
        `SELECT acct_unique_id FROM isp_sessions WHERE stopped_at IS NULL LIMIT 2000`,
        []
    );
    return rows.map((r) => r.acct_unique_id);
}

/**
 * Project a single radacct row.
 * @returns {Promise<{created: boolean, bound: boolean}>}
 */
async function ingestRow(row) {
    const inputOctets = assertPlausibleCounters(row.acctinputoctets, 'acctinputoctets', row);
    const outputOctets = assertPlausibleCounters(row.acctoutputoctets, 'acctoutputoctets', row);
    const sessionSeconds = Number(row.acctsessiontime || 0);
    const mac = tryNormaliseMac(row.callingstationid);

    const subject = await resolveSubject(row.username);
    const nasId = await resolveNasId(row.nasipaddress);

    const existing = await query(
        `SELECT id, subscriber_id, voucher_id, input_octets, output_octets, session_seconds
           FROM isp_sessions WHERE acct_unique_id = ?`,
        [row.acctuniqueid]
    );

    let created = false;
    let deltaIn = 0;
    let deltaOut = 0;
    let deltaSeconds = 0;

    if (existing.length === 0) {
        // A new session. Everything reported so far is new usage.
        deltaIn = inputOctets;
        deltaOut = outputOctets;
        deltaSeconds = sessionSeconds;

        await query(
            `INSERT INTO isp_sessions
                (acct_unique_id, acct_session_id, radacct_id, username,
                 subscriber_id, voucher_id, nas_id, nas_ip, framed_ip,
                 calling_station_id, called_station_id, service_type,
                 started_at, last_update_at, stopped_at, session_seconds,
                 input_octets, output_octets, terminate_cause)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                row.acctuniqueid, row.acctsessionid, row.radacctid, row.username,
                subject.subscriberId, subject.voucherId, nasId, row.nasipaddress,
                row.framedipaddress || null, mac, row.calledstationid || null,
                inferServiceType(row, subject),
                row.acctstarttime, row.acctupdatetime, row.acctstoptime,
                sessionSeconds, inputOctets, outputOctets,
                row.acctterminatecause || null
            ]
        );
        created = true;
    } else {
        const prev = existing[0];

        // Clamp negatives. A counter should never go backwards within one
        // acctuniqueid, but a NAS reboot or a duplicated interim update can
        // produce one — and a negative delta would silently *reduce* a
        // customer's recorded usage.
        deltaIn = Math.max(0, inputOctets - Number(prev.input_octets || 0));
        deltaOut = Math.max(0, outputOctets - Number(prev.output_octets || 0));
        deltaSeconds = Math.max(0, sessionSeconds - Number(prev.session_seconds || 0));

        await query(
            `UPDATE isp_sessions
                SET radacct_id = ?, last_update_at = ?, stopped_at = ?,
                    session_seconds = ?, input_octets = ?, output_octets = ?,
                    terminate_cause = ?,
                    calling_station_id = COALESCE(calling_station_id, ?),
                    framed_ip = COALESCE(?, framed_ip)
              WHERE id = ?`,
            [
                row.radacctid, row.acctupdatetime, row.acctstoptime,
                sessionSeconds, inputOctets, outputOctets,
                row.acctterminatecause || null, mac,
                row.framedipaddress || null, prev.id
            ]
        );
    }

    if (deltaIn > 0 || deltaOut > 0 || deltaSeconds > 0) {
        await accumulateDailyUsage(subject, {
            deltaIn,
            deltaOut,
            deltaSeconds,
            isNewSession: created
        });
    }

    // A5 — bind the voucher to the first device that used it.
    let bound = false;
    if (subject.voucherId && mac) {
        const result = await voucherService.bindVoucherToDevice(subject.voucherId, mac);
        bound = result.bound;
    }

    if (subject.voucherId) {
        await query(
            `UPDATE isp_vouchers
                SET data_used_bytes = data_used_bytes + ?,
                    time_used_seconds = time_used_seconds + ?
              WHERE id = ?`,
            [deltaIn + deltaOut, deltaSeconds, subject.voucherId]
        );
    }

    return { created, bound };
}

/**
 * Credit usage to today's rollup row.
 *
 * ON DUPLICATE KEY UPDATE makes this an atomic upsert — two concurrent
 * ingest passes cannot lose an increment the way SELECT-then-UPDATE would.
 */
async function accumulateDailyUsage(subject, { deltaIn, deltaOut, deltaSeconds, isNewSession }) {
    if (!subject.subscriberId && !subject.voucherId) return;

    await query(
        `INSERT INTO isp_usage_daily
            (subscriber_id, voucher_id, usage_date, upload_bytes, download_bytes,
             session_seconds, session_count)
         VALUES (?, ?, CURDATE(), ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            upload_bytes    = upload_bytes    + VALUES(upload_bytes),
            download_bytes  = download_bytes  + VALUES(download_bytes),
            session_seconds = session_seconds + VALUES(session_seconds),
            session_count   = session_count   + VALUES(session_count)`,
        [
            subject.subscriberId, subject.voucherId,
            deltaIn, deltaOut, deltaSeconds, isNewSession ? 1 : 0
        ]
    );
}

/**
 * Map a RADIUS username onto a subscriber or a voucher.
 *
 * Subscribers and vouchers share one namespace because both are RADIUS
 * usernames. Subscriber lookup runs first: subscriber usernames are
 * administrator-assigned, voucher codes are generated from a restricted
 * alphabet, so a collision would have to be deliberate.
 */
async function resolveSubject(username) {
    const subscribers = await query(
        'SELECT id FROM isp_subscribers WHERE radius_username = ?',
        [username]
    );
    if (subscribers.length) {
        return { subscriberId: subscribers[0].id, voucherId: null };
    }

    const vouchers = await query('SELECT id FROM isp_vouchers WHERE code = ?', [username]);
    if (vouchers.length) {
        return { subscriberId: null, voucherId: vouchers[0].id };
    }

    // Unknown username. Recorded anyway — an orphan session is evidence of a
    // credential that exists in RADIUS but not here, which is exactly the
    // drift the sync checker is meant to catch.
    return { subscriberId: null, voucherId: null };
}

async function resolveNasId(nasIp) {
    if (!nasIp) return null;
    const rows = await query('SELECT id FROM isp_nas WHERE nas_ip = ? LIMIT 1', [nasIp]);
    return rows.length ? rows[0].id : null;
}

function inferServiceType(row, subject) {
    const protocol = (row.framedprotocol || '').toLowerCase();
    if (protocol.includes('ppp')) return 'pppoe';

    const portType = (row.nasporttype || '').toLowerCase();
    if (portType.includes('wireless') || portType.includes('ethernet')) {
        return subject.voucherId ? 'hotspot' : 'pppoe';
    }

    return subject.voucherId ? 'hotspot' : null;
}

/**
 * Flag counter values that look truncated.
 *
 * If a site runs customised FreeRADIUS accounting queries that drop the
 * gigawords fold, every heavy user under-reports permanently and silently.
 * A value sitting just under 2^32 on a long-running session is the
 * fingerprint of that. We cannot repair it from here — the high bits are
 * gone — but a loud log line beats months of quietly wrong invoices.
 */
function assertPlausibleCounters(value, column, row) {
    const bytes = Number(value || 0);

    if (!Number.isFinite(bytes) || bytes < 0) {
        logger.warn('Implausible accounting counter, treating as 0', {
            column,
            value,
            radacctid: row.radacctid
        });
        return 0;
    }

    const nearWrap = Number(GIGAWORD) - 1_048_576; // within 1 MiB of 2^32
    const longSession = Number(row.acctsessiontime || 0) > 3600;

    if (bytes >= nearWrap && bytes < Number(GIGAWORD) && longSession) {
        logger.warn(
            'Accounting counter is within 1 MiB of the 32-bit wrap point — ' +
            'check that FreeRADIUS is folding Acct-*-Gigawords into radacct',
            { column, value: bytes, username: row.username, radacctid: row.radacctid }
        );
    }

    return bytes;
}

// =====================================================
// SESSION REAPER
// =====================================================

/**
 * Close sessions that stopped reporting.
 *
 * If a router reboots or loses connectivity, the Acct-Stop never arrives and
 * the radacct row stays open forever. Combined with Simultaneous-Use := 1
 * that locks the subscriber out of their OWN account — they cannot log in
 * because a session that no longer exists is holding their only slot. The
 * support call lands on us, and the cause is invisible from the customer
 * side.
 *
 * A session is stale when it has had no interim update for
 * ISP_SESSION_STALE_SECONDS (default 3x the 600s interim interval).
 *
 * @param {object} [options]
 * @param {number} [options.staleSeconds]
 * @returns {Promise<{reaped: number}>}
 */
export async function reapStaleSessions({ staleSeconds = null } = {}) {
    const threshold = staleSeconds || parseInt(process.env.ISP_SESSION_STALE_SECONDS || '1800', 10);

    const stale = await query(
        `SELECT id, acct_unique_id, username, started_at, last_update_at
           FROM isp_sessions
          WHERE stopped_at IS NULL
            AND COALESCE(last_update_at, started_at) < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
        [threshold]
    );

    let reaped = 0;
    for (const session of stale) {
        try {
            await radius.closeStaleAccountingSession(session.acct_unique_id, 'Session-Timeout');
            await query(
                `UPDATE isp_sessions
                    SET stopped_at = NOW(), terminate_cause = 'Reaped-Stale'
                  WHERE id = ?`,
                [session.id]
            );
            reaped++;
        } catch (error) {
            logger.error('Failed to reap stale session', {
                acctUniqueId: session.acct_unique_id,
                error: error.message
            });
        }
    }

    if (reaped > 0) {
        logger.info('Reaped stale sessions', { reaped, thresholdSeconds: threshold });
    }
    return { reaped };
}

// =====================================================
// REPORTING
// =====================================================

/**
 * Usage totals for one subscriber over a date range.
 *
 * @param {number} subscriberId
 * @param {object} [options]
 */
export async function getSubscriberUsage(subscriberId, { from = null, to = null } = {}) {
    const params = [subscriberId];
    let where = 'WHERE subscriber_id = ?';

    if (from) { where += ' AND usage_date >= ?'; params.push(from); }
    if (to) { where += ' AND usage_date <= ?'; params.push(to); }

    const [totals, daily] = await Promise.all([
        query(
            `SELECT COALESCE(SUM(upload_bytes), 0)    AS upload_bytes,
                    COALESCE(SUM(download_bytes), 0)  AS download_bytes,
                    COALESCE(SUM(session_seconds), 0) AS session_seconds,
                    COALESCE(SUM(session_count), 0)   AS session_count
               FROM isp_usage_daily ${where}`,
            params
        ),
        query(
            `SELECT usage_date, upload_bytes, download_bytes, session_seconds, session_count
               FROM isp_usage_daily ${where}
              ORDER BY usage_date DESC LIMIT 90`,
            params
        )
    ]);

    const total = totals[0];
    return {
        subscriberId,
        totals: {
            uploadBytes: Number(total.upload_bytes),
            downloadBytes: Number(total.download_bytes),
            totalBytes: Number(total.upload_bytes) + Number(total.download_bytes),
            sessionSeconds: Number(total.session_seconds),
            sessionCount: Number(total.session_count)
        },
        daily
    };
}

/**
 * Heaviest users over a window — the "who is saturating the link" view.
 *
 * @param {object} [options]
 */
export async function getTopTalkers({ days = 7, limit = 20 } = {}) {
    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 20));
    const safeDays = Math.max(1, Math.min(365, parseInt(days, 10) || 7));

    return query(
        `SELECT s.id, s.subscriber_code, s.full_name, s.status,
                p.name AS package_name,
                SUM(u.upload_bytes)   AS upload_bytes,
                SUM(u.download_bytes) AS download_bytes,
                SUM(u.upload_bytes + u.download_bytes) AS total_bytes,
                SUM(u.session_seconds) AS session_seconds
           FROM isp_usage_daily u
           JOIN isp_subscribers s ON s.id = u.subscriber_id
           LEFT JOIN isp_packages p ON p.id = s.package_id
          WHERE u.usage_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          GROUP BY s.id
          ORDER BY total_bytes DESC
          LIMIT ${safeLimit}`,
        [safeDays]
    );
}

/**
 * Sessions our accounting believes are open.
 *
 * Note this can disagree with the routers — see nas.service.getAllLiveSessions()
 * for ground truth. A row here with no matching router session is exactly
 * what the reaper cleans up.
 */
export async function getOpenSessions({ limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 200));
    return query(
        `SELECT sess.*, sub.subscriber_code, sub.full_name, v.code AS voucher_code
           FROM isp_sessions sess
           LEFT JOIN isp_subscribers sub ON sub.id = sess.subscriber_id
           LEFT JOIN isp_vouchers v      ON v.id = sess.voucher_id
          WHERE sess.stopped_at IS NULL
          ORDER BY sess.started_at DESC
          LIMIT ${safeLimit}`,
        []
    );
}

// =====================================================
// JOB CURSOR
// =====================================================

async function getCursor() {
    const rows = await query('SELECT cursor_value FROM isp_job_state WHERE job_name = ?', [JOB_NAME]);
    return rows.length ? rows[0].cursor_value : '0';
}

async function setCursor(value, status) {
    await query(
        `INSERT INTO isp_job_state (job_name, cursor_value, last_run_at, last_status)
         VALUES (?, ?, NOW(), ?)
         ON DUPLICATE KEY UPDATE
            cursor_value = VALUES(cursor_value),
            last_run_at  = VALUES(last_run_at),
            last_status  = VALUES(last_status),
            last_error   = NULL`,
        [JOB_NAME, String(value), status]
    );
}

async function touchCursor(value, status) {
    await setCursor(value, status);
}

/**
 * Reset the ingest watermark. Re-reads accounting history from `value`.
 *
 * Safe to call: session upserts are keyed on acct_unique_id, and usage is
 * accumulated by delta, so replaying rows already seen produces zero deltas
 * rather than double-counting.
 *
 * @param {number|string} [value=0]
 */
export async function resetCursor(value = 0) {
    await setCursor(value, 'reset');
    logger.warn('Accounting cursor reset', { to: value });
}

export { JOB_NAME };
