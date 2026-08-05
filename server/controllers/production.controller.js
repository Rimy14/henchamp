/**
 * Production Controller
 * Handles manufacturing/production records
 */

import db from '../config/database.js';

// Get all production records
export const getAllProduction = async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id,
                p.production_number,
                p.bom_id,
                p.quantity_produced,
                p.production_date,
                p.status,
                p.notes,
                p.created_at,
                b.finished_good_id,
                i.name as finished_good_name,
                i.code as finished_good_code,
                u.username as produced_by_name
            FROM production p
            JOIN bom b ON p.bom_id = b.id
            JOIN items i ON b.finished_good_id = i.id
            JOIN users u ON p.produced_by = u.id
            ORDER BY p.created_at DESC
        `;

        const [production] = await db.query(query);
        res.json({ success: true, data: production });
    } catch (error) {
        console.error('Error fetching production records:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch production records', error: error.message });
    }
};

// Get single production record with details
export const getProductionById = async (req, res) => {
    try {
        const { id } = req.params;

        // Get production header
        const [production] = await db.query(`
            SELECT 
                p.*,
                b.finished_good_id,
                i.name as finished_good_name,
                i.code as finished_good_code,
                u.username as produced_by_name
            FROM production p
            JOIN bom b ON p.bom_id = b.id
            JOIN items i ON b.finished_good_id = i.id
            JOIN users u ON p.produced_by = u.id
            WHERE p.id = ?
        `, [id]);

        if (production.length === 0) {
            return res.status(404).json({ success: false, message: 'Production record not found' });
        }

        const record = production[0];

        // Get raw materials consumed
        const [materials] = await db.query(`
            SELECT 
                bi.raw_material_id,
                i.name as raw_material_name,
                i.code as raw_material_code,
                i.unit_of_measure,
                bi.quantity as unit_quantity,
                (bi.quantity * ?) as total_consumed
            FROM bom_items bi
            JOIN items i ON bi.raw_material_id = i.id
            WHERE bi.bom_id = ?
        `, [record.quantity_produced, record.bom_id]);

        record.materials = materials;

        res.json({ success: true, data: record });
    } catch (error) {
        console.error('Error fetching production record:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch production record', error: error.message });
    }
};

// Create new production record
export const createProduction = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { bom_id, quantity_produced, production_date, notes } = req.body;
        const produced_by = req.user.id;

        // Validate BOM exists and is active
        const [boms] = await connection.query(`
            SELECT b.*, i.name as finished_good_name, i.id as finished_good_id
            FROM bom b
            JOIN items i ON b.finished_good_id = i.id
            WHERE b.id = ? AND b.is_active = TRUE
        `, [bom_id]);

        if (boms.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'BOM not found or inactive' });
        }

        const bom = boms[0];

        // Get BOM items (raw materials required)
        const [bomItems] = await connection.query(`
            SELECT 
                bi.*,
                i.name as raw_material_name,
                i.current_stock,
                (bi.quantity * ?) as total_required
            FROM bom_items bi
            JOIN items i ON bi.raw_material_id = i.id
            WHERE bi.bom_id = ?
        `, [quantity_produced, bom_id]);

        // Check stock availability for all raw materials
        const insufficientStock = [];
        for (const item of bomItems) {
            if (item.current_stock < item.total_required) {
                insufficientStock.push({
                    name: item.raw_material_name,
                    required: item.total_required,
                    available: item.current_stock
                });
            }
        }

        if (insufficientStock.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Insufficient stock for production',
                insufficientStock
            });
        }

        // Create production record
        const [productionResult] = await connection.query(
            `INSERT INTO production (bom_id, quantity_produced, production_date, produced_by, notes, status) 
             VALUES (?, ?, ?, ?, ?, 'completed')`,
            [bom_id, quantity_produced, production_date, produced_by, notes]
        );

        const productionId = productionResult.insertId;
        const productionNumber = await getProductionNumber(connection, productionId);

        // Deduct raw materials from stock
        for (const item of bomItems) {
            const quantityBefore = item.current_stock;
            const quantityChange = -item.total_required;
            const quantityAfter = quantityBefore + quantityChange;

            // Update item stock
            await connection.query(
                'UPDATE items SET current_stock = current_stock - ? WHERE id = ?',
                [item.total_required, item.raw_material_id]
            );

            // Deduct from Batches (FIFO)
            let remainingToDeduct = item.total_required;
            const [batches] = await connection.query(
                'SELECT * FROM inventory_batches WHERE item_id = ? AND current_quantity > 0 ORDER BY received_date ASC, id ASC FOR UPDATE',
                [item.raw_material_id]
            );

            for (const batch of batches) {
                if (remainingToDeduct <= 0) break;

                const deductionAmount = Math.min(Number(batch.current_quantity), remainingToDeduct);

                // Update batch quantity
                await connection.query(
                    'UPDATE inventory_batches SET current_quantity = current_quantity - ? WHERE id = ?',
                    [deductionAmount, batch.id]
                );

                // Record batch consumption
                await connection.query(
                    `INSERT INTO batch_consumption 
                        (batch_id, reference_type, reference_id, quantity_consumed, consumed_by, notes) 
                        VALUES (?, 'production', ?, ?, ?, ?)`,
                    [
                        batch.id,
                        productionId,
                        deductionAmount,
                        produced_by,
                        `Used in production ${productionNumber}`
                    ]
                );

                remainingToDeduct -= deductionAmount;
            }

            // Create stock ledger entry
            await connection.query(
                `INSERT INTO stock_ledger 
                (item_id, transaction_type, reference_type, reference_id, quantity_before, quantity_change, quantity_after, performed_by, notes)
                VALUES (?, 'production', 'Production', ?, ?, ?, ?, ?, ?)`,
                [
                    item.raw_material_id,
                    productionId,
                    quantityBefore,
                    quantityChange,
                    quantityAfter,
                    produced_by,
                    `Used in production ${productionNumber} for ${bom.finished_good_name}`
                ]
            );
        }

        // Add finished goods to stock
        const [finishedGood] = await connection.query(
            'SELECT current_stock FROM items WHERE id = ?',
            [bom.finished_good_id]
        );

        const fgQuantityBefore = finishedGood[0].current_stock;
        const fgQuantityChange = quantity_produced;
        const fgQuantityAfter = fgQuantityBefore + fgQuantityChange;

        await connection.query(
            'UPDATE items SET current_stock = current_stock + ? WHERE id = ?',
            [quantity_produced, bom.finished_good_id]
        );

        // Create stock ledger entry for finished goods
        await connection.query(
            `INSERT INTO stock_ledger 
            (item_id, transaction_type, reference_type, reference_id, quantity_before, quantity_change, quantity_after, performed_by, notes)
            VALUES (?, 'production', 'Production', ?, ?, ?, ?, ?, ?)`,
            [
                bom.finished_good_id,
                productionId,
                fgQuantityBefore,
                fgQuantityChange,
                fgQuantityAfter,
                produced_by,
                `Produced via ${productionNumber}`
            ]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Production record created successfully',
            data: {
                id: productionId,
                production_number: productionNumber,
                quantity_produced
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error creating production record:', error);
        res.status(500).json({ success: false, message: 'Failed to create production record', error: error.message });
    } finally {
        connection.release();
    }
};

// Helper function to get production number
async function getProductionNumber(connection, id) {
    const [result] = await connection.query(
        'SELECT production_number FROM production WHERE id = ?',
        [id]
    );
    return result[0].production_number;
}

// Update production status
export const updateProductionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const [result] = await db.query(
            'UPDATE production SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Production record not found' });
        }

        res.json({ success: true, message: 'Production status updated successfully' });

    } catch (error) {
        console.error('Error updating production status:', error);
        res.status(500).json({ success: false, message: 'Failed to update production status', error: error.message });
    }
};

// Delete production record
export const deleteProduction = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;

        // Only allow deletion of pending productions
        const [production] = await connection.query(
            'SELECT status FROM production WHERE id = ?',
            [id]
        );

        if (production.length === 0) {
            return res.status(404).json({ success: false, message: 'Production record not found' });
        }

        if (production[0].status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending production records can be deleted'
            });
        }

        await connection.beginTransaction();

        // Delete related stock ledger entries
        await connection.query(
            `DELETE FROM stock_ledger WHERE reference_type = 'Production' AND reference_id = ?`,
            [id]
        );

        // Delete production record
        await connection.query('DELETE FROM production WHERE id = ?', [id]);

        await connection.commit();

        res.json({ success: true, message: 'Production record deleted successfully' });

    } catch (error) {
        await connection.rollback();
        console.error('Error deleting production record:', error);
        res.status(500).json({ success: false, message: 'Failed to delete production record', error: error.message });
    } finally {
        connection.release();
    }
};

// Calculate material requirements for production
export const calculateRequirements = async (req, res) => {
    try {
        const { bom_id, quantity } = req.query;

        if (!bom_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Both bom_id and quantity are required'
            });
        }

        // Get BOM items with current stock
        const [materials] = await db.query(`
            SELECT 
                bi.raw_material_id,
                i.name as raw_material_name,
                i.code as raw_material_code,
                i.unit_of_measure,
                i.current_stock,
                bi.quantity as unit_quantity,
                (bi.quantity * ?) as total_required,
                CASE 
                    WHEN i.current_stock >= (bi.quantity * ?) THEN 'sufficient'
                    ELSE 'insufficient'
                END as stock_status
            FROM bom_items bi
            JOIN items i ON bi.raw_material_id = i.id
            WHERE bi.bom_id = ?
        `, [quantity, quantity, bom_id]);

        const canProduce = materials.every(m => m.stock_status === 'sufficient');

        res.json({
            success: true,
            data: {
                materials,
                canProduce,
                quantity: parseInt(quantity)
            }
        });

    } catch (error) {
        console.error('Error calculating requirements:', error);
        res.status(500).json({ success: false, message: 'Failed to calculate requirements', error: error.message });
    }
};
