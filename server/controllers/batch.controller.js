/**
 * Batch Controller - Manage inventory batches
 */

import { query } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Get all batches with filters
 */
export const getAllBatches = async (req, res) => {
    try {
        const { item_id, grn_id, page = 1, limit = 5 } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (item_id) {
            whereClause += ' AND ib.item_id = ?';
            params.push(item_id);
        }

        if (grn_id) {
            whereClause += ' AND ib.grn_id = ?';
            params.push(grn_id);
        }

        const sql = `
            SELECT 
                ib.*,
                i.name as item_name,
                i.code as item_code,
                i.unit_of_measure,
                g.grn_number,
                g.received_date as grn_received_date,
                s.name as supplier_name
            FROM inventory_batches ib
            LEFT JOIN items i ON ib.item_id = i.id
            LEFT JOIN grn g ON ib.grn_id = g.id
            LEFT JOIN purchase_orders po ON g.po_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            ${whereClause}
            ORDER BY ib.received_date DESC, ib.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const batches = await query(sql, params);

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total
            FROM inventory_batches ib
            ${whereClause}
        `;
        const [{ total }] = await query(countSql, params);

        res.json({
            success: true,
            data: batches,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                totalItems: total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Get all batches error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get batches for a specific item
 */
export const getBatchesByItem = async (req, res) => {
    try {
        const { itemId } = req.params;

        const sql = `
            SELECT 
                ib.*,
                g.grn_number,
                s.name as supplier_name
            FROM inventory_batches ib
            LEFT JOIN grn g ON ib.grn_id = g.id
            LEFT JOIN purchase_orders po ON g.po_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE ib.item_id = ? AND ib.current_quantity > 0
            ORDER BY ib.received_date ASC, ib.id ASC
        `;

        const batches = await query(sql, [itemId]);

        res.json({ success: true, data: batches });
    } catch (error) {
        logger.error('Get batches by item error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get batch details with consumption history
 */
export const getBatchDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Get batch info
        const batchSql = `
            SELECT 
                ib.*,
                i.name as item_name,
                i.code as item_code,
                i.unit_of_measure,
                g.grn_number,
                s.name as supplier_name
            FROM inventory_batches ib
            LEFT JOIN items i ON ib.item_id = i.id
            LEFT JOIN grn g ON ib.grn_id = g.id
            LEFT JOIN purchase_orders po ON g.po_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE ib.id = ?
        `;

        const [batch] = await query(batchSql, [id]);

        if (!batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        // Get consumption history from combined sources:
        // 1. stock_ledger (Sales FIFO consumption and Manual Adjustments)
        // 2. batch_consumption (Production)
        const consumptionSql = `
            SELECT * FROM (
                -- From stock_ledger (Sales and Manual Adjustments)
                SELECT 
                    sl.created_at as consumed_at,
                    sl.reference_type,
                    ABS(sl.quantity_change) as quantity_consumed,
                    u.username as consumed_by_name,
                    sl.notes
                FROM stock_ledger sl
                LEFT JOIN users u ON sl.performed_by = u.id
                WHERE sl.notes LIKE ?
                
                UNION ALL
                
                -- From batch_consumption (Production usage)
                SELECT 
                    bc.consumed_at,
                    bc.reference_type,
                    bc.quantity_consumed,
                    u.username as consumed_by_name,
                    bc.notes
                FROM batch_consumption bc
                LEFT JOIN users u ON bc.consumed_by = u.id
                WHERE bc.batch_id = ?
            ) as combined_history
            ORDER BY consumed_at DESC
        `;

        // Search for this batch ID in notes (for stock_ledger) and by ID (for batch_consumption)
        const consumption = await query(consumptionSql, [
            `%Batch #${id}%`,
            id
        ]);

        batch.consumption_history = consumption;

        res.json({ success: true, data: batch });
    } catch (error) {
        logger.error('Get batch details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get batch consumption summary for an item
 */
export const getItemBatchSummary = async (req, res) => {
    try {
        const { itemId } = req.params;

        const sql = `
            SELECT 
                COUNT(*) as total_batches,
                SUM(ib.current_quantity) as total_quantity,
                MIN(ib.received_date) as oldest_batch_date,
                MAX(ib.received_date) as newest_batch_date
            FROM inventory_batches ib
            WHERE ib.item_id = ? AND ib.current_quantity > 0
        `;

        const [summary] = await query(sql, [itemId]);

        res.json({ success: true, data: summary });
    } catch (error) {
        logger.error('Get item batch summary error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
