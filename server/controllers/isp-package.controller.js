/**
 * ISP Package Controller
 *
 * Tariff plans. Creating or editing a package immediately rewrites its RADIUS
 * group policy, so a speed change applies to every subscriber on that package
 * at their next authentication without touching subscriber rows.
 */

import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import * as provisioning from '../services/isp/provisioning.service.js';
import * as radius from '../services/isp/radius.service.js';
import { recordAudit } from '../services/isp/audit.js';
import { buildRateLimit } from '../services/isp/radius-attributes.js';

/**
 * List packages.
 */
export async function getAllPackages(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (req.query.service_type) {
            whereClause += ' AND p.service_type = ?';
            params.push(req.query.service_type);
        }
        if (req.query.status) {
            whereClause += ' AND p.status = ?';
            params.push(req.query.status);
        }

        const countResult = await query(
            `SELECT COUNT(*) as total FROM isp_packages p ${whereClause}`,
            params
        );
        const totalItems = countResult[0].total;

        const packages = await query(
            `SELECT p.*,
                    (SELECT COUNT(*) FROM isp_subscribers s WHERE s.package_id = p.id) AS subscriber_count,
                    (SELECT COUNT(*) FROM isp_vouchers v WHERE v.package_id = p.id) AS voucher_count
               FROM isp_packages p
               ${whereClause}
               ORDER BY p.service_type, p.price
               LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({
            success: true,
            data: packages,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages: Math.ceil(totalItems / limit)
            }
        });
    } catch (error) {
        logger.error('Error fetching ISP packages:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Single package, including the RADIUS policy it currently produces — so an
 * admin can see exactly what the router will be told.
 */
export async function getPackageById(req, res) {
    try {
        const packages = await query('SELECT * FROM isp_packages WHERE id = ?', [req.params.id]);
        if (packages.length === 0) {
            return res.status(404).json({ success: false, message: 'Package not found' });
        }

        const pkg = packages[0];
        const policy = await radius.getGroupPolicy(pkg.radius_group);

        res.json({ success: true, data: { ...pkg, radius_policy: policy } });
    } catch (error) {
        logger.error('Error fetching ISP package:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Create a package and provision its RADIUS group.
 */
export async function createPackage(req, res) {
    try {
        const {
            code, name, description, service_type, price, currency = 'KES',
            validity_days, validity_minutes,
            rate_up_kbps, rate_down_kbps,
            burst_up_kbps, burst_down_kbps,
            burst_threshold_up_kbps, burst_threshold_down_kbps, burst_time_seconds,
            data_cap_mb, simultaneous_use = 1, status = 'active'
        } = req.body;

        if (!code || !name || !service_type) {
            return res.status(400).json({
                success: false,
                message: 'code, name and service_type are required'
            });
        }
        if (!['hotspot', 'pppoe'].includes(service_type)) {
            return res.status(400).json({
                success: false,
                message: "service_type must be 'hotspot' or 'pppoe'"
            });
        }

        // Derive the RADIUS group name rather than accepting one: it must be
        // unique and stable, and letting it be supplied invites a collision
        // that would silently merge two packages' policies.
        const radiusGroup = `pkg_${code.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

        const draft = {
            code, rate_up_kbps, rate_down_kbps, burst_up_kbps, burst_down_kbps,
            burst_threshold_up_kbps, burst_threshold_down_kbps, burst_time_seconds
        };

        // Validate the rate-limit string before writing anything. A bad
        // combination should be a 400, not a half-created package.
        try {
            buildRateLimit(draft);
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        const result = await query(
            `INSERT INTO isp_packages
                (code, name, description, service_type, price, currency,
                 validity_days, validity_minutes, rate_up_kbps, rate_down_kbps,
                 burst_up_kbps, burst_down_kbps, burst_threshold_up_kbps,
                 burst_threshold_down_kbps, burst_time_seconds,
                 data_cap_mb, simultaneous_use, radius_group, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                code, name, description || null, service_type, price || 0, currency,
                validity_days || null, validity_minutes || null,
                rate_up_kbps || null, rate_down_kbps || null,
                burst_up_kbps || null, burst_down_kbps || null,
                burst_threshold_up_kbps || null, burst_threshold_down_kbps || null,
                burst_time_seconds || null,
                data_cap_mb || null, simultaneous_use, radiusGroup, status
            ]
        );

        const created = (await query('SELECT * FROM isp_packages WHERE id = ?', [result.insertId]))[0];
        await provisioning.provisionPackage(created);

        await recordAudit({
            entityType: 'package',
            entityId: created.id,
            action: 'create',
            actorUserId: req.user?.userId,
            detail: { code, service_type, radiusGroup }
        });

        res.status(201).json({ success: true, data: created });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'A package with that code already exists'
            });
        }
        logger.error('Error creating ISP package:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Update a package and re-provision its group.
 *
 * radius_group and code are intentionally immutable: subscribers are joined
 * to the group by name, so renaming it would orphan every member.
 */
export async function updatePackage(req, res) {
    try {
        const { id } = req.params;
        const existing = await query('SELECT * FROM isp_packages WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Package not found' });
        }

        const current = existing[0];
        const merged = { ...current, ...req.body, id: current.id, code: current.code,
                         radius_group: current.radius_group };

        try {
            buildRateLimit(merged);
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        await query(
            `UPDATE isp_packages
                SET name = ?, description = ?, price = ?, currency = ?,
                    validity_days = ?, validity_minutes = ?,
                    rate_up_kbps = ?, rate_down_kbps = ?,
                    burst_up_kbps = ?, burst_down_kbps = ?,
                    burst_threshold_up_kbps = ?, burst_threshold_down_kbps = ?,
                    burst_time_seconds = ?, data_cap_mb = ?,
                    simultaneous_use = ?, status = ?
              WHERE id = ?`,
            [
                merged.name, merged.description, merged.price, merged.currency,
                merged.validity_days, merged.validity_minutes,
                merged.rate_up_kbps, merged.rate_down_kbps,
                merged.burst_up_kbps, merged.burst_down_kbps,
                merged.burst_threshold_up_kbps, merged.burst_threshold_down_kbps,
                merged.burst_time_seconds, merged.data_cap_mb,
                merged.simultaneous_use, merged.status, id
            ]
        );

        const updated = (await query('SELECT * FROM isp_packages WHERE id = ?', [id]))[0];
        await provisioning.provisionPackage(updated);

        await recordAudit({
            entityType: 'package',
            entityId: updated.id,
            action: 'update',
            actorUserId: req.user?.userId,
            detail: { code: updated.code }
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        logger.error('Error updating ISP package:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Deactivate a package.
 *
 * Soft delete only. Hard-deleting a package that subscribers or vouchers
 * reference would break their RADIUS group membership and orphan billing
 * history, so in-use packages are refused.
 */
export async function deletePackage(req, res) {
    try {
        const { id } = req.params;

        const inUse = await query(
            `SELECT (SELECT COUNT(*) FROM isp_subscribers WHERE package_id = ?) AS subs,
                    (SELECT COUNT(*) FROM isp_vouchers    WHERE package_id = ?) AS vouchers`,
            [id, id]
        );

        if (inUse[0].subs > 0 || inUse[0].vouchers > 0) {
            return res.status(409).json({
                success: false,
                message:
                    `Package is in use by ${inUse[0].subs} subscriber(s) and ` +
                    `${inUse[0].vouchers} voucher(s). Set status to 'inactive' instead.`
            });
        }

        const existing = await query('SELECT * FROM isp_packages WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Package not found' });
        }

        await query('DELETE FROM isp_packages WHERE id = ?', [id]);
        await radius.replaceGroupPolicy(existing[0].radius_group, [], []);

        await recordAudit({
            entityType: 'package',
            entityId: Number(id),
            action: 'delete',
            actorUserId: req.user?.userId,
            detail: { code: existing[0].code }
        });

        res.json({ success: true, message: 'Package deleted' });
    } catch (error) {
        logger.error('Error deleting ISP package:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Force every active package's RADIUS group to match its definition.
 * The repair action after a RADIUS restore or manual meddling.
 */
export async function reprovisionAllPackages(req, res) {
    try {
        const result = await provisioning.provisionAllPackages();
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error reprovisioning ISP packages:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}
