import { query, transaction, pool } from '../config/database.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';

/**
 * Get all stock adjustments
 */
export const getAllAdjustments = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get adjustments with item and user details
        const [adjustments] = await pool.query(`
            SELECT sa.*, 
                   i.name as item_name, 
                   i.code as item_code,
                   u.username as adjusted_by_name
            FROM stock_adjustments sa
            JOIN items i ON sa.item_id = i.id
            LEFT JOIN users u ON sa.adjusted_by = u.id
            ORDER BY sa.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        // Get total count
        const [[countResult]] = await pool.query(
            'SELECT COUNT(*) as total FROM stock_adjustments'
        );
        const total = countResult.total;

        res.json({
            success: true,
            data: adjustments,
            pagination: {
                page: page,
                limit: limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Get adjustments error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Helper: Select batches in FIFO order for auto-deduction
 */
async function selectBatchesFIFO(conn, itemId, locationId, quantityNeeded) {
    const [batches] = await conn.execute(`
        SELECT id, current_quantity, cost_per_unit, grn_id, received_date
        FROM inventory_batches
        WHERE item_id = ? 
        AND location_id = ?
        AND current_quantity > 0
        ORDER BY received_date ASC, id ASC
    `, [itemId, locationId]);

    let remaining = quantityNeeded;
    const selected = [];

    for (const batch of batches) {
        if (remaining <= 0) break;

        const qty = Math.min(batch.current_quantity, remaining);
        selected.push({
            batch_id: batch.id,
            quantity: -qty,  // Negative for subtraction
            unit_cost: batch.cost_per_unit,
            grn_id: batch.grn_id
        });

        remaining -= qty;
    }

    if (remaining > 0) {
        throw new Error(`Insufficient batches. Short by ${remaining} units`);
    }

    return selected;
}

/**
 * Create batch-wise stock adjustment
 */
export const createBatchAdjustment = async (req, res) => {
    try {
        const {
            item_id,
            location_id,
            adjustment_type,  // Frontend: 'DAMAGE', 'WASTE', 'CORRECTION', or DB: 'addition', 'subtraction', 'correction'
            batches,  // Array of {batch_id, quantity, reason}
            overall_reason,
            auto_select_fifo = false
        } = req.body;

        if (!item_id || !adjustment_type || (!batches && !auto_select_fifo)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: item_id, adjustment_type, and batches'
            });
        }

        // Map frontend adjustment types to database ENUM values
        const adjustmentTypeMap = {
            'DAMAGE': 'subtraction',
            'WASTE': 'subtraction',
            'CORRECTION': 'correction',  // Will be refined based on batches
            'addition': 'addition',      // Pass through if already correct
            'subtraction': 'subtraction',
            'correction': 'correction'
        };

        let dbAdjustmentType = adjustmentTypeMap[adjustment_type] || 'correction';

        // For CORRECTION type, determine if it's addition or subtraction based on batch quantities
        if (adjustment_type === 'CORRECTION' && batches && batches.length > 0) {
            const firstQty = parseFloat(batches[0]?.quantity || 0);
            dbAdjustmentType = firstQty >= 0 ? 'addition' : 'subtraction';
        }

        const result = await transaction(async (conn) => {
            // Get item details
            const [itemData] = await conn.execute(
                'SELECT id, name, code FROM items WHERE id = ?',
                [item_id]
            );

            if (!itemData || itemData.length === 0) {
                throw new Error('Item not found');
            }

            const item = itemData[0];
            let batchesToProcess = batches || [];

            // Auto-select batches if requested (for subtractions)
            const subtractionTypes = ['subtraction', 'DAMAGE', 'WASTE'];
            if (auto_select_fifo && (subtractionTypes.includes(adjustment_type) || dbAdjustmentType === 'subtraction')) {
                const firstBatch = batches && batches.length > 0 ? batches[0] : null;
                const totalQty = Math.abs(parseFloat(firstBatch?.quantity || 0));
                batchesToProcess = await selectBatchesFIFO(conn, item_id, location_id, totalQty);
            }

            // Calculate total adjustment
            const totalAdjustment = batchesToProcess.reduce(
                (sum, b) => sum + parseFloat(b.quantity || 0), 0
            );

            // Get current total stock before adjustment
            const [invBefore] = await conn.execute(
                'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                [item_id, location_id]
            );
            const currentQty = invBefore[0]?.quantity || 0;
            const adjustedQty = currentQty + totalAdjustment;

            // Pre-validation: Check if total inventory goes negative
            if (adjustedQty < 0) {
                throw new Error(`Insufficient total stock at this location. Adjustment would result in ${adjustedQty} units.`);
            }

            // Generate adjustment number
            const year = new Date().getFullYear();
            const [lastAdj] = await conn.execute(
                `SELECT adjustment_number FROM stock_adjustments 
                 WHERE adjustment_number LIKE ? 
                 ORDER BY id DESC LIMIT 1`,
                [`ADJ-${year}-%`]
            );

            let nextNumber = 1;
            if (lastAdj && lastAdj.length > 0) {
                const lastNum = lastAdj[0].adjustment_number.split('-')[2];
                nextNumber = parseInt(lastNum) + 1;
            }
            const adjustmentNumber = `ADJ-${year}-${String(nextNumber).padStart(4, '0')}`;

            // Create adjustment record
            const [adjResult] = await conn.execute(`
                INSERT INTO stock_adjustments 
                (adjustment_number, item_id, adjustment_type, current_quantity, 
                 adjusted_quantity, difference, reason, status, adjusted_by, 
                 adjustment_date, uses_batch_tracking)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, CURDATE(), TRUE)
            `, [
                adjustmentNumber,
                item_id,
                dbAdjustmentType,
                currentQty,
                adjustedQty,
                totalAdjustment,
                overall_reason || 'Batch adjustment',
                req.user.userId
            ]);

            const adjustmentId = adjResult.insertId;

            // Process each batch
            for (const batch of batchesToProcess) {
                const changeQty = parseFloat(batch.quantity);
                if (changeQty === 0) continue;

                // Pre-validation: Check if individual batch quantity goes negative or exceeds initial capacity
                const [batchBefore] = await conn.execute(
                    'SELECT current_quantity, initial_quantity FROM inventory_batches WHERE id = ?',
                    [batch.batch_id]
                );

                if (batchBefore && batchBefore[0]) {
                    const newBatchQty = parseFloat(batchBefore[0].current_quantity) + changeQty;
                    if (newBatchQty < 0) {
                        throw new Error(`Insufficient stock in Batch #${batch.batch_id}. Short by ${Math.abs(newBatchQty)} units.`);
                    }
                    if (changeQty > 0) {
                        const maxAllowed = parseFloat(batchBefore[0].initial_quantity);
                        if (newBatchQty > maxAllowed) {
                            const maxCanAdd = maxAllowed - parseFloat(batchBefore[0].current_quantity);
                            throw new Error(`Cannot add ${changeQty} units to Batch #${batch.batch_id}. This batch can only accommodate ${maxCanAdd} more units to reach its original GRN capacity of ${maxAllowed}.`);
                        }
                    }
                }

                // Update batch quantity
                await conn.execute(`
                    UPDATE inventory_batches 
                    SET current_quantity = current_quantity + ?
                    WHERE id = ?
                `, [changeQty, batch.batch_id]);

                // Record batch adjustment
                await conn.execute(`
                    INSERT INTO adjustment_batch_items
                    (adjustment_id, batch_id, quantity_adjusted, reason)
                    VALUES (?, ?, ?, ?)
                `, [
                    adjustmentId,
                    batch.batch_id,
                    changeQty,
                    batch.reason || overall_reason
                ]);

                // Stock ledger entry for this batch
                const [batchInfo] = await conn.execute(
                    'SELECT current_quantity, grn_id FROM inventory_batches WHERE id = ?',
                    [batch.batch_id]
                );

                await conn.execute(`
                    INSERT INTO stock_ledger
                    (item_id, transaction_type, reference_type, reference_id,
                     quantity_before, quantity_change, quantity_after, performed_by, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    item_id,
                    'adjustment',
                    'Batch Adjustment',
                    adjustmentId,
                    parseFloat(batchInfo[0].current_quantity) - changeQty,
                    changeQty,
                    batchInfo[0].current_quantity,
                    req.user.userId,
                    `Batch #${batch.batch_id} (GRN: ${batchInfo[0].grn_id}): ${batch.reason || overall_reason}`
                ]);
            }

            // Update total inventory
            await conn.execute(`
                INSERT INTO inventory (item_id, location_id, quantity)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE quantity = quantity + ?
            `, [item_id, location_id, totalAdjustment, totalAdjustment]);

            // Summary ledger entry
            await conn.execute(`
                INSERT INTO stock_ledger
                (item_id, transaction_type, reference_type, reference_id,
                 quantity_before, quantity_change, quantity_after, performed_by, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                item_id,
                'adjustment',
                'Batch Adjustment Summary',
                adjustmentId,
                currentQty,
                totalAdjustment,
                adjustedQty,
                req.user.userId,
                `${item.name}: Total ${totalAdjustment} across ${batchesToProcess.length} batch(es)`
            ]);

            return { adjustmentId, adjustmentNumber, totalAdjustment };
        });

        // Invalidate items cache
        cache.deletePattern('items:*');

        logger.info(`Batch adjustment created: ${result.adjustmentNumber}`, { userId: req.user.userId });
        res.status(201).json({
            success: true,
            data: result,
            message: 'Batch adjustment completed successfully'
        });

    } catch (error) {
        logger.error('Batch adjustment error:', error);
        let userMessage = error.message;

        // Translate database constraint errors
        if (error.message && (error.message.includes('chk_quantity') || error.message.includes('ER_CHECK_CONSTRAINT_VIOLATED'))) {
            userMessage = 'Inventory constraint violated: Resulting stock cannot be negative. Please check your quantities.';
        }

        res.status(500).json({ success: false, message: userMessage });
    }
};

/**
 * Get batches for an item at a location
 */
export const getBatchesForItem = async (req, res) => {
    try {
        const { item_id, location_id } = req.query;

        if (!item_id) {
            return res.status(400).json({ success: false, message: 'item_id is required' });
        }

        let query_string = `
            SELECT ib.*, grn.grn_number, grn.received_date as grn_date
            FROM inventory_batches ib
            LEFT JOIN grn ON ib.grn_id = grn.id
            WHERE ib.item_id = ? AND ib.current_quantity > 0
        `;
        const params = [item_id];

        if (location_id) {
            query_string += ' AND ib.location_id = ?';
            params.push(location_id);
        }

        query_string += ' ORDER BY ib.received_date ASC, ib.id ASC';

        const batches = await query(query_string, params);
        res.json({ success: true, data: batches });
    } catch (error) {
        logger.error('Get batches error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get adjustment details with batch breakdown
 */
export const getAdjustmentWithBatches = async (req, res) => {
    try {
        const { id } = req.params;

        // Get adjustment details
        const [adjustment] = await query(`
            SELECT sa.*, i.name as item_name, i.code as item_code,
                   u.username as adjusted_by_name
            FROM stock_adjustments sa
            JOIN items i ON sa.item_id = i.id
            LEFT JOIN users u ON sa.adjusted_by = u.id
            WHERE sa.id = ?
        `, [id]);

        if (!adjustment) {
            return res.status(404).json({ success: false, message: 'Adjustment not found' });
        }

        // Get batch items if batch tracking was used
        if (adjustment.uses_batch_tracking) {
            const batchItems = await query(`
                SELECT abi.*, ib.grn_id, ib.cost_per_unit,
                       grn.grn_number, ib.received_date
                FROM adjustment_batch_items abi
                JOIN inventory_batches ib ON abi.batch_id = ib.id
                LEFT JOIN grn ON ib.grn_id = grn.id
                WHERE abi.adjustment_id = ?
                ORDER BY ib.received_date ASC
            `, [id]);

            adjustment.batch_items = batchItems;
        }

        res.json({ success: true, data: adjustment });
    } catch (error) {
        logger.error('Get adjustment details error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
