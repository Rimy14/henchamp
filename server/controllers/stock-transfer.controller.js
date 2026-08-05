import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';

export const createTransfer = async (req, res) => {
    try {
        const { from_location_id, to_location_id, items, notes, date } = req.body;

        if (!from_location_id || !to_location_id || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        if (from_location_id === to_location_id) {
            return res.status(400).json({ success: false, message: 'Source and destination locations must be different' });
        }

        // Validate locations exist
        const [fromLoc] = await query('SELECT id, name FROM locations WHERE id = ? AND is_active = TRUE', [from_location_id]);
        const [toLoc] = await query('SELECT id, name FROM locations WHERE id = ? AND is_active = TRUE', [to_location_id]);

        if (!fromLoc) {
            return res.status(404).json({
                success: false,
                message: `Source location (ID: ${from_location_id}) not found or inactive. Please check locations table.`
            });
        }

        if (!toLoc) {
            return res.status(404).json({
                success: false,
                message: `Destination location (ID: ${to_location_id}) not found or inactive. Please check locations table.`
            });
        }

        const result = await transaction(async (conn) => {
            // Check stock availability
            for (const item of items) {
                const [inv] = await conn.execute(
                    'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                    [item.item_id, from_location_id]
                );

                const available = inv.length > 0 ? inv[0].quantity : 0;
                if (available < item.quantity) {
                    throw new Error(`Insufficient stock for item ID ${item.item_id}. Available: ${available}`);
                }
            }

            // Generate Transfer Number
            const year = new Date().getFullYear();
            const [lastTransfer] = await conn.execute(
                `SELECT transfer_number FROM stock_transfers 
                 WHERE transfer_number LIKE ? 
                 ORDER BY id DESC LIMIT 1`,
                [`TRF-${year}-%`]
            );

            let nextNumber = 1;
            if (lastTransfer && lastTransfer.length > 0) {
                const lastNum = lastTransfer[0].transfer_number.split('-')[2];
                nextNumber = parseInt(lastNum) + 1;
            }
            const transferNumber = `TRF-${year}-${String(nextNumber).padStart(4, '0')}`;

            // Create Transfer Record
            const [transferResult] = await conn.execute(
                `INSERT INTO stock_transfers 
                 (transfer_number, from_location, to_location, transfer_date, status, initiated_by, notes) 
                 VALUES (?, ?, ?, ?, 'completed', ?, ?)`,
                [transferNumber, fromLoc.name, toLoc.name, date || new Date(), req.user.userId, notes]
            );

            const transferId = transferResult.insertId;

            // Process Items
            for (const item of items) {
                // Add to transfer items
                await conn.execute(
                    `INSERT INTO transfer_items (transfer_id, item_id, quantity) VALUES (?, ?, ?)`,
                    [transferId, item.item_id, item.quantity]
                );

                // Deduct from Source
                await conn.execute(
                    `UPDATE inventory SET quantity = quantity - ? WHERE item_id = ? AND location_id = ?`,
                    [item.quantity, item.item_id, from_location_id]
                );

                // Add to Target
                await conn.execute(
                    `INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                    [item.item_id, to_location_id, item.quantity, item.quantity]
                );

                // Ledger Entry: OUT
                const [fromInv] = await conn.execute(
                    'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                    [item.item_id, from_location_id]
                );
                const quantityBefore = fromInv[0]?.quantity || 0;

                await conn.execute(
                    `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id, 
                     quantity_before, quantity_change, quantity_after, performed_by, notes) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        item.item_id,
                        'transfer_out',
                        'Stock Transfer',
                        transferId,
                        quantityBefore,
                        -item.quantity,
                        quantityBefore - item.quantity,
                        req.user.userId,
                        `Transfer to ${toLoc.name}`
                    ]
                );

                // Ledger Entry: IN
                const [toInv] = await conn.execute(
                    'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                    [item.item_id, to_location_id]
                );
                const quantityBeforeIn = (toInv[0]?.quantity || 0) - item.quantity; // Before the transfer addition

                await conn.execute(
                    `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id, 
                     quantity_before, quantity_change, quantity_after, performed_by, notes) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        item.item_id,
                        'transfer_in',
                        'Stock Transfer',
                        transferId,
                        quantityBeforeIn,
                        item.quantity,
                        quantityBeforeIn + item.quantity,
                        req.user.userId,
                        `Transfer from ${fromLoc.name}`
                    ]
                );
            }

            return { transferId, transferNumber };
        });

        res.status(201).json({ success: true, data: result, message: 'Stock transfer completed successfully' });

    } catch (error) {
        logger.error('Create transfer error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getTransfers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 15;
        const offset = (page - 1) * limit;

        const transfers = await query(`
            SELECT st.*, u.username as initiated_by_name 
            FROM stock_transfers st
            LEFT JOIN users u ON st.initiated_by = u.id
            ORDER BY st.created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const [countRow] = await query('SELECT COUNT(*) as total FROM stock_transfers');
        const total = countRow.total;

        res.json({
            success: true,
            data: transfers,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


export const getTransferById = async (req, res) => {
    try {
        const { id } = req.params;

        // Get transfer details
        const [transfer] = await query(`
            SELECT st.*, u.username as initiated_by_name 
            FROM stock_transfers st
            LEFT JOIN users u ON st.initiated_by = u.id
            WHERE st.id = ?
        `, [id]);

        if (!transfer) {
            return res.status(404).json({ success: false, message: 'Transfer not found' });
        }

        // Get transfer items
        const items = await query(`
            SELECT ti.*, i.name as item_name, i.code as item_code
            FROM transfer_items ti
            JOIN items i ON ti.item_id = i.id
            WHERE ti.transfer_id = ?
        `, [id]);

        transfer.items = items;

        res.json({ success: true, data: transfer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getLocations = async (req, res) => {
    try {
        const locations = await query('SELECT * FROM locations WHERE is_active = TRUE');
        res.json({ success: true, data: locations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getItemStockAtLocation = async (req, res) => {
    try {
        const { itemId, locationId } = req.query;

        if (!itemId || !locationId) {
            return res.status(400).json({ success: false, message: 'itemId and locationId are required' });
        }

        const [inv] = await query(
            'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
            [itemId, locationId]
        );

        const quantity = inv ? inv.quantity : 0;

        res.json({ success: true, data: { quantity } });
    } catch (error) {
        logger.error('Get item stock error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getRawMaterialsItems = async (req, res) => {
    try {
        const rawMaterials = await query(`
            SELECT i.id, i.code, i.name, i.description, i.category_id, i.current_stock
            FROM items i
            INNER JOIN categories c ON i.category_id = c.id
            WHERE c.type = 'Raw Materials' AND i.status = 'active'
            ORDER BY i.name ASC
        `);

        res.json({ success: true, data: rawMaterials });
    } catch (error) {
        logger.error('Get raw materials error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
