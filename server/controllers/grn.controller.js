/**
 * Goods Receipt Note (GRN) Controller
 * Handles receiving goods from purchase orders and updating inventory
 */

import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';

/**
 * Get all GRNs with details
 */
export const getAllGRNs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const { status, po_id } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status) {
            whereClause += ' AND g.status = ?';
            params.push(status);
        }

        if (po_id) {
            whereClause += ' AND g.po_id = ?';
            params.push(po_id);
        }

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM grn g
            LEFT JOIN purchase_orders po ON g.po_id = po.id
            ${whereClause}
        `;
        const countResult = await query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated data
        let sql = `
            SELECT 
                g.*,
                po.po_number,
                s.name as supplier_name,
                u.username as receiver_name,
                (SELECT COUNT(*) FROM grn_items WHERE grn_id = g.id) as item_count
            FROM grn g
            LEFT JOIN purchase_orders po ON g.po_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON g.receiver_id = u.id
            ${whereClause}
            ORDER BY g.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const grns = await query(sql, params);

        res.json({
            success: true,
            data: grns,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        });
    } catch (error) {
        logger.error('Get GRNs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get single GRN with items
 */
export const getGRNById = async (req, res) => {
    try {
        const { id } = req.params;

        const [grn] = await query(
            `SELECT g.*, po.po_number, s.name as supplier_name, 
                    u.username as receiver_name
             FROM grn g
             LEFT JOIN purchase_orders po ON g.po_id = po.id
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN users u ON g.receiver_id = u.id
             WHERE g.id = ?`,
            [id]
        );

        if (!grn) {
            return res.status(404).json({ success: false, message: 'GRN not found' });
        }

        const items = await query(
            `SELECT gi.*, i.name as item_name, i.code as item_code, 
                    i.unit_of_measure, c.name as category_name
             FROM grn_items gi
             LEFT JOIN items i ON gi.item_id = i.id
             LEFT JOIN categories c ON i.category_id = c.id
             WHERE gi.grn_id = ?`,
            [id]
        );

        grn.items = items;
        res.json({ success: true, data: grn });
    } catch (error) {
        logger.error('Get GRN by ID error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Create new GRN from a Purchase Order
 */
export const createGRN = async (req, res) => {
    try {
        const { po_id, received_date, items, notes } = req.body;

        // Validate PO exists and is approved
        const [po] = await query(
            'SELECT * FROM purchase_orders WHERE id = ?',
            [po_id]
        );

        if (!po) {
            return res.status(404).json({ success: false, message: 'Purchase Order not found' });
        }

        if (po.status !== 'Approved') {
            return res.status(400).json({
                success: false,
                message: 'Only approved POs can have GRNs created'
            });
        }

        // Get PO items to validate against
        const poItems = await query(
            'SELECT * FROM po_items WHERE po_id = ?',
            [po_id]
        );

        // Validate all received items are in the PO
        // Build per-item aggregates across all po_items rows (same item may appear on multiple lines)
        const poItemAggregates = {};
        for (const poItem of poItems) {
            const iid = poItem.item_id;
            if (!poItemAggregates[iid]) {
                poItemAggregates[iid] = { orderedQty: 0, receivedQty: 0 };
            }
            poItemAggregates[iid].orderedQty += poItem.quantity || 0;
            poItemAggregates[iid].receivedQty += poItem.received_quantity || 0;
        }

        for (const item of items) {
            const agg = poItemAggregates[item.item_id];
            if (!agg) {
                return res.status(400).json({
                    success: false,
                    message: `Item ${item.item_id} is not in the purchase order`
                });
            }

            // Validate received quantity against total ordered minus total already received
            const remainingQty = agg.orderedQty - agg.receivedQty;
            if (item.received_quantity > remainingQty) {
                return res.status(400).json({
                    success: false,
                    message: `Received quantity for item ${item.item_id} exceeds remaining ordered quantity (Ordered: ${agg.orderedQty}, Already Received: ${agg.receivedQty}, Remaining: ${remainingQty})`
                });
            }
        }

        const result = await transaction(async (conn) => {
            // Generate GRN number
            const year = new Date().getFullYear();
            const [lastGRN] = await conn.execute(
                `SELECT grn_number FROM grn 
                 WHERE grn_number LIKE ? 
                 ORDER BY id DESC LIMIT 1`,
                [`GRN-${year}-%`]
            );

            let nextNumber = 1;
            if (lastGRN && lastGRN.length > 0 && lastGRN[0].grn_number) {
                const lastNumber = parseInt(lastGRN[0].grn_number.split('-')[2]);
                nextNumber = lastNumber + 1;
            }

            const grn_number = `GRN-${year}-${String(nextNumber).padStart(4, '0')}`;

            // Insert GRN
            const [grnResult] = await conn.execute(
                `INSERT INTO grn 
                 (grn_number, po_id, received_date, receiver_id, notes, status) 
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [grn_number, po_id, received_date, req.user.userId, notes]
            );

            const grn_id = grnResult.insertId;

            // Insert GRN items
            for (const item of items) {
                const poItem = poItems.find(pi => pi.item_id === item.item_id);
                await conn.execute(
                    `INSERT INTO grn_items 
                     (grn_id, item_id, ordered_quantity, received_quantity, unit_cost, quality_status, notes) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        grn_id,
                        item.item_id,
                        poItem.quantity,
                        item.received_quantity,
                        item.unit_cost || 0,
                        item.quality_status || 'accepted',
                        item.notes || null
                    ]
                );
            }

            return { grn_id, grn_number };
        });

        // Audit log
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id) VALUES (?, ?, ?, ?)',
            [req.user.userId, 'GRN_CREATED', 'grn', result.grn_id]
        );

        logger.info(`GRN created: ${result.grn_number} by user ${req.user.userId}`);
        res.status(201).json({
            success: true,
            message: 'GRN created successfully',
            data: result
        });
    } catch (error) {
        logger.error('Create GRN error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Approve GRN - This updates inventory and stock ledger
 */
export const approveGRN = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if GRN exists and is pending
        const [grn] = await query('SELECT * FROM grn WHERE id = ?', [id]);

        if (!grn) {
            return res.status(404).json({ success: false, message: 'GRN not found' });
        }

        if (grn.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending GRNs can be approved'
            });
        }

        // Only Admin can approve
        if (req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Permission denied. Only Admins can approve GRNs.'
            });
        }

        // Get GRN items
        const grnItems = await query(
            'SELECT * FROM grn_items WHERE grn_id = ?',
            [id]
        );

        await transaction(async (conn) => {
            // Process each item FIRST — status update moved to end so rollback works correctly
            for (const grnItem of grnItems) {
                // Only update stock for accepted items
                if (grnItem.quality_status === 'accepted') {
                    // Update item stock (Legacy column - keep for total)
                    const [item] = await conn.execute(
                        'SELECT current_stock FROM items WHERE id = ?',
                        [grnItem.item_id]
                    );

                    const currentStock = item[0].current_stock;
                    const newStock = currentStock + grnItem.received_quantity;

                    await conn.execute(
                        'UPDATE items SET current_stock = ?, updated_at = NOW() WHERE id = ?',
                        [newStock, grnItem.item_id]
                    );

                    // === NEW: Update Location-based Inventory (Store) ===
                    // 1. Get Store Location ID
                    const [storeLoc] = await conn.execute("SELECT id FROM locations WHERE name = 'Shop'");
                    const storeId = storeLoc[0].id;

                    // 2. Insert or Update Inventory
                    await conn.execute(
                        `INSERT INTO inventory (item_id, location_id, quantity) 
                         VALUES (?, ?, ?) 
                         ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                        [grnItem.item_id, storeId, grnItem.received_quantity, grnItem.received_quantity]
                    );

                    // Create stock ledger entry
                    await conn.execute(
                        `INSERT INTO stock_ledger 
                         (item_id, transaction_type, reference_type, reference_id, 
                          quantity_before, quantity_change, quantity_after, 
                          performed_by, notes) 
                         VALUES (?, 'purchase', 'GRN', ?, ?, ?, ?, ?, ?)`,
                        [
                            grnItem.item_id,
                            id,
                            currentStock,
                            grnItem.received_quantity,
                            newStock,
                            req.user.userId,
                            `GRN approved: ${grn.grn_number} (Added to Store)`
                        ]
                    );

                    // Update PO item received quantity
                    await conn.execute(
                        `UPDATE po_items 
                         SET received_quantity = received_quantity + ? 
                         WHERE po_id = ? AND item_id = ?`,
                        [grnItem.received_quantity, grn.po_id, grnItem.item_id]
                    );

                    // Create Inventory Batch with location
                    // Use grnItem.id (unique per GRN row) to prevent duplicates when same item appears multiple times
                    const batchNumber = `${grn.grn_number}-ITM${grnItem.item_id}-${grnItem.id}`;

                    // Use GRN unit_cost (which may differ from PO cost due to shipping/taxes)
                    const unitCost = grnItem.unit_cost || 0;

                    await conn.execute(
                        `INSERT IGNORE INTO inventory_batches 
                         (batch_number, grn_id, grn_item_id, item_id, location_id,
                          initial_quantity, current_quantity, received_date, 
                          cost_per_unit, quality_status) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            batchNumber,
                            id,
                            grnItem.id,
                            grnItem.item_id,
                            storeId, // Add location_id to match inventory location
                            grnItem.received_quantity,
                            grnItem.received_quantity, // Initial current quantity = received
                            grn.received_date,
                            unitCost,
                            grnItem.quality_status
                        ]
                    );
                }
            }

            // Check if PO is fully received
            const [poItems] = await conn.execute(
                'SELECT * FROM po_items WHERE po_id = ?',
                [grn.po_id]
            );

            const allReceived = poItems.every(item =>
                item.received_quantity >= item.quantity
            );

            if (allReceived) {
                await conn.execute(
                    'UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?',
                    ['Received', grn.po_id]
                );
            }

            // Update GRN status LAST — ensures full rollback if any item/batch insert fails
            await conn.execute(
                'UPDATE grn SET status = ?, updated_at = NOW() WHERE id = ?',
                ['approved', id]
            );
        });

        // Audit log
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id) VALUES (?, ?, ?, ?)',
            [req.user.userId, 'GRN_APPROVED', 'grn', id]
        );

        // Invalidate items cache
        cache.deletePattern('items:*');

        logger.info(`GRN ${id} approved by user ${req.user.userId}`);
        res.json({
            success: true,
            message: 'GRN approved and inventory updated successfully'
        });
    } catch (error) {
        logger.error('Approve GRN error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Reject GRN
 */
export const rejectGRN = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const [grn] = await query('SELECT status FROM grn WHERE id = ?', [id]);

        if (!grn) {
            return res.status(404).json({ success: false, message: 'GRN not found' });
        }

        if (grn.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending GRNs can be rejected'
            });
        }

        await query(
            'UPDATE grn SET status = ?, notes = CONCAT(COALESCE(notes, ""), "\n\nRejection reason: ", ?), updated_at = NOW() WHERE id = ?',
            ['rejected', reason || 'No reason provided', id]
        );

        // Audit log
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
            [req.user.userId, 'GRN_REJECTED', 'grn', id, JSON.stringify({ reason })]
        );

        logger.info(`GRN ${id} rejected by user ${req.user.userId}`);
        res.json({ success: true, message: 'GRN rejected' });
    } catch (error) {
        logger.error('Reject GRN error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Delete GRN (only if pending)
 */
export const deleteGRN = async (req, res) => {
    try {
        const { id } = req.params;

        const [grn] = await query('SELECT status FROM grn WHERE id = ?', [id]);

        if (!grn) {
            return res.status(404).json({ success: false, message: 'GRN not found' });
        }

        if (grn.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending GRNs can be deleted'
            });
        }

        await query('DELETE FROM grn WHERE id = ?', [id]);

        logger.info(`GRN ${id} deleted by user ${req.user.userId}`);
        res.json({ success: true, message: 'GRN deleted successfully' });
    } catch (error) {
        logger.error('Delete GRN error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
