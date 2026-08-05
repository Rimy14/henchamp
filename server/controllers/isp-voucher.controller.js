/**
 * ISP Voucher Controller — hotspot codes (A2) and device locking (A5)
 */

import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import * as voucherService from '../services/isp/voucher.service.js';
import { getAuditTrail } from '../services/isp/audit.js';

/**
 * Generate a batch.
 *
 * The plaintext codes are returned ONCE, in this response, for printing.
 * They are stored encrypted and there is no endpoint that can retrieve them
 * again — losing the print output means revoking the batch and regenerating.
 */
export async function generateVouchers(req, res) {
    try {
        const { package_id, quantity, code_length = 8, notes } = req.body;

        if (!package_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'package_id and quantity are required'
            });
        }

        const result = await voucherService.generateBatch({
            packageId: Number(package_id),
            quantity: Number(quantity),
            codeLength: Number(code_length),
            userId: req.user?.userId,
            notes
        });

        res.status(201).json({
            success: true,
            data: result,
            message:
                `Generated ${result.vouchers.length} voucher(s). ` +
                `Codes are shown once — print or export them now.`
        });
    } catch (error) {
        if (error instanceof RangeError || /not found|hotspot packages only/.test(error.message)) {
            return res.status(400).json({ success: false, message: error.message });
        }
        logger.error('Error generating vouchers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * List vouchers.
 *
 * `code` is returned because staff need to look one up when a customer
 * presents it at the counter. The password is not — a code alone cannot be
 * used to log in.
 */
export async function getAllVouchers(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (req.query.status) {
            whereClause += ' AND v.status = ?';
            params.push(req.query.status);
        }
        if (req.query.batch_id) {
            whereClause += ' AND v.batch_id = ?';
            params.push(req.query.batch_id);
        }
        if (req.query.search) {
            whereClause += ' AND v.code LIKE ?';
            params.push(`%${req.query.search}%`);
        }
        if (req.query.bound === 'true') whereClause += ' AND v.bound_mac IS NOT NULL';
        if (req.query.bound === 'false') whereClause += ' AND v.bound_mac IS NULL';

        const countResult = await query(
            `SELECT COUNT(*) as total FROM isp_vouchers v ${whereClause}`,
            params
        );
        const totalItems = countResult[0].total;

        const vouchers = await query(
            `SELECT v.id, v.code, v.status, v.price, v.bound_mac, v.bound_at, v.binding_resets,
                    v.first_used_at, v.expires_at, v.data_used_bytes, v.time_used_seconds,
                    v.sold_at, v.created_at,
                    b.batch_no, p.name AS package_name, p.code AS package_code
               FROM isp_vouchers v
               LEFT JOIN isp_voucher_batches b ON b.id = v.batch_id
               LEFT JOIN isp_packages p        ON p.id = v.package_id
               ${whereClause}
               ORDER BY v.id DESC
               LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        res.json({
            success: true,
            data: vouchers,
            pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) }
        });
    } catch (error) {
        logger.error('Error fetching vouchers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** One voucher, with its sessions and audit trail. */
export async function getVoucherById(req, res) {
    try {
        const { id } = req.params;

        const rows = await query(
            `SELECT v.id, v.code, v.status, v.price, v.bound_mac, v.bound_at, v.binding_resets,
                    v.first_used_at, v.expires_at, v.data_used_bytes, v.time_used_seconds,
                    v.sale_id, v.sold_at, v.created_at,
                    b.batch_no, p.name AS package_name, p.code AS package_code,
                    p.validity_minutes, p.validity_days, p.data_cap_mb
               FROM isp_vouchers v
               LEFT JOIN isp_voucher_batches b ON b.id = v.batch_id
               LEFT JOIN isp_packages p        ON p.id = v.package_id
              WHERE v.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Voucher not found' });
        }

        const [sessions, audit] = await Promise.all([
            query(
                `SELECT acct_unique_id, framed_ip, calling_station_id, started_at, stopped_at,
                        session_seconds, input_octets, output_octets
                   FROM isp_sessions WHERE voucher_id = ? ORDER BY started_at DESC LIMIT 20`,
                [id]
            ),
            getAuditTrail('voucher', Number(id), 20)
        ]);

        res.json({ success: true, data: { ...rows[0], sessions, audit } });
    } catch (error) {
        logger.error('Error fetching voucher:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * A5 — free a voucher from its bound device.
 *
 * The counter-staff fix for phone MAC randomisation: a customer whose device
 * changed its MAC is locked out of a voucher they paid for, and this unlocks
 * it in one action. Counted and audited, because a voucher reset repeatedly
 * is being shared rather than malfunctioning.
 */
export async function resetVoucherBinding(req, res) {
    try {
        const result = await voucherService.resetBinding(
            Number(req.params.id),
            req.user?.userId,
            req.body.reason || 'support request'
        );

        res.json({
            success: true,
            data: result,
            message:
                `Binding cleared. The voucher will lock to the next device that uses it. ` +
                `This voucher has now been reset ${result.resetCount} time(s).`
        });
    } catch (error) {
        if (/not found/i.test(error.message)) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (/Cannot reset/i.test(error.message)) {
            return res.status(409).json({ success: false, message: error.message });
        }
        logger.error('Error resetting voucher binding:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Revoke — immediate and permanent. */
export async function revokeVoucher(req, res) {
    try {
        const voucher = await voucherService.revokeVoucher(
            Number(req.params.id),
            req.user?.userId,
            req.body.reason || 'revoked by admin'
        );
        res.json({ success: true, data: voucher, message: 'Voucher revoked' });
    } catch (error) {
        if (/not found/i.test(error.message)) {
            return res.status(404).json({ success: false, message: error.message });
        }
        logger.error('Error revoking voucher:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Would this device be allowed to use this voucher?
 *
 * Mirrors the rule FreeRADIUS enforces, so support can answer "why was I
 * rejected?" without reading RADIUS debug output.
 */
export async function checkVoucherAccess(req, res) {
    try {
        const { code } = req.params;
        const { mac } = req.query;

        if (!mac) {
            return res.status(400).json({ success: false, message: '`mac` query parameter is required' });
        }

        const voucher = await voucherService.getVoucherByCode(code);
        if (!voucher) {
            return res.status(404).json({ success: false, message: 'Voucher not found' });
        }

        const result = voucherService.evaluateDeviceAccess(voucher, mac);

        res.json({
            success: true,
            data: {
                code: voucher.code,
                status: voucher.status,
                boundMac: voucher.bound_mac,
                requestedMac: mac,
                ...result
            }
        });
    } catch (error) {
        logger.error('Error checking voucher access:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Batch list with reconciliation counts. */
export async function getAllBatches(req, res) {
    try {
        const batches = await query(
            `SELECT b.*, p.name AS package_name, p.code AS package_code,
                    u.username AS generated_by_name,
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
              GROUP BY b.id
              ORDER BY b.id DESC`,
            []
        );
        res.json({ success: true, data: batches });
    } catch (error) {
        logger.error('Error fetching voucher batches:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** One batch with its vouchers. */
export async function getBatchById(req, res) {
    try {
        const summary = await voucherService.getBatchSummary(Number(req.params.id));
        if (!summary) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        const vouchers = await query(
            `SELECT id, code, status, bound_mac, first_used_at, expires_at
               FROM isp_vouchers WHERE batch_id = ? ORDER BY id`,
            [req.params.id]
        );

        res.json({ success: true, data: { ...summary, vouchers } });
    } catch (error) {
        logger.error('Error fetching voucher batch:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/** Manually expire vouchers whose window has closed (the job also does this). */
export async function expireVouchers(req, res) {
    try {
        const result = await voucherService.expireDueVouchers();
        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Error expiring vouchers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}
