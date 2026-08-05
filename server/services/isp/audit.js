/**
 * ISP Audit Trail
 *
 * Records every state change that affects a subscriber's service or a
 * voucher's binding. This is not decorative logging — when a customer
 * disputes a suspension, or a voucher binding is reset at the counter, this
 * table is the record of who did it and why.
 *
 * Writes are best-effort: a failure to record an audit row must never abort
 * the operation being audited. Losing an audit line is bad; failing to
 * restore a paying customer's internet because the audit insert deadlocked
 * is worse.
 */

import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';

/**
 * @param {object} entry
 * @param {string} entry.entityType - subscriber|voucher|nas|package|session
 * @param {number} entry.entityId
 * @param {string} entry.action
 * @param {number|null} [entry.actorUserId] - null for system/cron actions
 * @param {object} [entry.detail]
 */
export async function recordAudit({ entityType, entityId, action, actorUserId = null, detail = null }) {
    try {
        await query(
            `INSERT INTO isp_audit_log (entity_type, entity_id, action, actor_user_id, detail)
             VALUES (?, ?, ?, ?, ?)`,
            [entityType, entityId, action, actorUserId, detail ? JSON.stringify(detail) : null]
        );
    } catch (error) {
        logger.error('Failed to write ISP audit entry', {
            entityType,
            entityId,
            action,
            error: error.message
        });
    }
}

/**
 * Audit history for one entity, newest first.
 *
 * @param {string} entityType
 * @param {number} entityId
 * @param {number} [limit]
 */
export async function getAuditTrail(entityType, entityId, limit = 50) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    return query(
        `SELECT a.id, a.action, a.detail, a.created_at,
                u.username AS actor_username
           FROM isp_audit_log a
           LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE a.entity_type = ? AND a.entity_id = ?
          ORDER BY a.id DESC
          LIMIT ${safeLimit}`,
        [entityType, entityId]
    );
}
