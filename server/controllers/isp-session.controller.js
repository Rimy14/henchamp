/**
 * ISP Session & Usage Controller — A6 / A7 dashboard data
 *
 * Two views of "who is online", and they can legitimately disagree:
 *
 *   /sessions/live   asks the ROUTERS directly. Ground truth, but needs the
 *                    routers to be reachable.
 *   /sessions/open   reads our accounting projection. Always available, but
 *                    lags by one interim-update interval and can hold stale
 *                    rows if a router died without sending Acct-Stop.
 *
 * A row in the second that is absent from the first is exactly what the
 * reaper job cleans up. Surfacing both is deliberate — collapsing them into
 * one number hides the failure mode.
 */

import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import * as accounting from '../services/isp/accounting.service.js';
import * as nasService from '../services/isp/nas.service.js';
import { recordAudit } from '../services/isp/audit.js';

/** Live sessions straight from the routers. */
export async function getLiveSessions(req, res) {
    try {
        const { sessions, errors } = await nasService.getAllLiveSessions();

        // Attach our identity for each username so the UI can show a name
        // rather than a raw RADIUS username.
        const usernames = [...new Set(sessions.map((s) => s.username).filter(Boolean))];
        let identities = {};

        if (usernames.length > 0) {
            const placeholders = usernames.map(() => '?').join(',');
            const [subs, vouchers] = await Promise.all([
                query(
                    `SELECT id, radius_username AS u, subscriber_code, full_name, status
                       FROM isp_subscribers WHERE radius_username IN (${placeholders})`,
                    usernames
                ),
                query(
                    `SELECT id, code AS u, status, bound_mac
                       FROM isp_vouchers WHERE code IN (${placeholders})`,
                    usernames
                )
            ]);

            for (const s of subs) {
                identities[s.u] = {
                    type: 'subscriber',
                    id: s.id,
                    label: `${s.full_name} (${s.subscriber_code})`,
                    status: s.status
                };
            }
            for (const v of vouchers) {
                identities[v.u] = {
                    type: 'voucher',
                    id: v.id,
                    label: `Voucher ${v.u}`,
                    status: v.status,
                    boundMac: v.bound_mac
                };
            }
        }

        res.json({
            success: true,
            data: sessions.map((s) => ({ ...s, identity: identities[s.username] || null })),
            meta: {
                total: sessions.length,
                routerErrors: errors,
                // Be explicit when the answer is incomplete — an empty list
                // because every router is unreachable must not read as
                // "nobody is online".
                complete: errors.length === 0
            }
        });
    } catch (error) {
        logger.error('Error fetching live sessions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Sessions our accounting believes are open. */
export async function getOpenSessions(req, res) {
    try {
        const sessions = await accounting.getOpenSessions({ limit: req.query.limit });
        res.json({ success: true, data: sessions });
    } catch (error) {
        logger.error('Error fetching open sessions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Session history. */
export async function getSessionHistory(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (req.query.subscriber_id) {
            whereClause += ' AND s.subscriber_id = ?';
            params.push(req.query.subscriber_id);
        }
        if (req.query.voucher_id) {
            whereClause += ' AND s.voucher_id = ?';
            params.push(req.query.voucher_id);
        }
        if (req.query.username) {
            whereClause += ' AND s.username = ?';
            params.push(req.query.username);
        }
        if (req.query.from) {
            whereClause += ' AND s.started_at >= ?';
            params.push(req.query.from);
        }
        if (req.query.to) {
            whereClause += ' AND s.started_at <= ?';
            params.push(req.query.to);
        }

        const countResult = await query(
            `SELECT COUNT(*) as total FROM isp_sessions s ${whereClause}`,
            params
        );

        const sessions = await query(
            `SELECT s.*, sub.subscriber_code, sub.full_name, v.code AS voucher_code
               FROM isp_sessions s
               LEFT JOIN isp_subscribers sub ON sub.id = s.subscriber_id
               LEFT JOIN isp_vouchers v      ON v.id = s.voucher_id
               ${whereClause}
               ORDER BY s.started_at DESC
               LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({
            success: true,
            data: sessions,
            pagination: {
                page,
                limit,
                totalItems: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        logger.error('Error fetching session history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Kick a specific live session by its RouterOS id. */
export async function killSession(req, res) {
    try {
        const { nasId, sessionId } = req.params;
        const { service } = req.query;

        const nas = await nasService.getNasRow(Number(nasId));
        if (!nas) {
            return res.status(404).json({ success: false, message: 'NAS not found' });
        }

        const client = nasService.buildClient(nas);

        if (service === 'hotspot') await client.removeHotspotSession(sessionId);
        else await client.removePppSession(sessionId);

        await recordAudit({
            entityType: 'session',
            entityId: Number(nasId),
            action: 'kill',
            actorUserId: req.user?.userId,
            detail: { sessionId, service, nas: nas.shortname }
        });

        res.json({ success: true, message: 'Session terminated' });
    } catch (error) {
        logger.error('Error killing session:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Heaviest users. */
export async function getTopTalkers(req, res) {
    try {
        const talkers = await accounting.getTopTalkers({
            days: req.query.days,
            limit: req.query.limit
        });
        res.json({ success: true, data: talkers });
    } catch (error) {
        logger.error('Error fetching top talkers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * A7 — dashboard summary. One round trip for the whole overview panel.
 */
export async function getDashboard(req, res) {
    try {
        const [subscriberStats, voucherStats, usageToday, sessionStats, nasStats] = await Promise.all([
            query(
                `SELECT status, COUNT(*) AS count FROM isp_subscribers GROUP BY status`,
                []
            ),
            query(
                `SELECT status, COUNT(*) AS count FROM isp_vouchers GROUP BY status`,
                []
            ),
            query(
                `SELECT COALESCE(SUM(upload_bytes), 0)   AS upload_bytes,
                        COALESCE(SUM(download_bytes), 0) AS download_bytes,
                        COALESCE(SUM(session_seconds), 0) AS session_seconds
                   FROM isp_usage_daily WHERE usage_date = CURDATE()`,
                []
            ),
            query(
                `SELECT COUNT(*) AS open_sessions,
                        COUNT(DISTINCT subscriber_id) AS distinct_subscribers
                   FROM isp_sessions WHERE stopped_at IS NULL`,
                []
            ),
            query(
                `SELECT COUNT(*) AS total,
                        SUM(status = 'active') AS active,
                        SUM(last_error IS NOT NULL) AS with_errors
                   FROM isp_nas`,
                []
            )
        ]);

        const jobState = await query('SELECT * FROM isp_job_state', []);

        res.json({
            success: true,
            data: {
                subscribers: toCountMap(subscriberStats),
                vouchers: toCountMap(voucherStats),
                usageToday: {
                    uploadBytes: Number(usageToday[0].upload_bytes),
                    downloadBytes: Number(usageToday[0].download_bytes),
                    totalBytes:
                        Number(usageToday[0].upload_bytes) + Number(usageToday[0].download_bytes),
                    sessionSeconds: Number(usageToday[0].session_seconds)
                },
                sessions: {
                    open: Number(sessionStats[0].open_sessions),
                    distinctSubscribers: Number(sessionStats[0].distinct_subscribers)
                },
                nas: {
                    total: Number(nasStats[0].total || 0),
                    active: Number(nasStats[0].active || 0),
                    withErrors: Number(nasStats[0].with_errors || 0)
                },
                jobs: jobState
            }
        });
    } catch (error) {
        logger.error('Error building ISP dashboard:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Manually trigger accounting ingest — used in testing and for catch-up. */
export async function runAccountingIngest(req, res) {
    try {
        const result = await accounting.ingestAccounting({
            batchSize: req.body?.batch_size || undefined
        });
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error running accounting ingest:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Manually trigger the stale-session reaper. */
export async function runSessionReaper(req, res) {
    try {
        const result = await accounting.reapStaleSessions({
            staleSeconds: req.body?.stale_seconds || null
        });
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error running session reaper:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

function toCountMap(rows) {
    const map = {};
    let total = 0;
    for (const row of rows) {
        map[row.status] = Number(row.count);
        total += Number(row.count);
    }
    map.total = total;
    return map;
}
