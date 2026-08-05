/**
 * BOM (Bill of Materials) Controller
 * Handles all BOM-related business logic
 */

import db from '../config/database.js';

// Get all BOMs with finished good details
export const getAllBOMs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM bom`;
        const [[countResult]] = await db.query(countQuery);
        const totalItems = countResult.total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated data
        const query = `
            SELECT 
                b.id,
                b.finished_good_id,
                i.name as finished_good_name,
                i.code as finished_good_code,
                c.name as category_name,
                b.version,
                b.description,
                b.is_active,
                b.created_at,
                u.username as created_by_name,
                (SELECT COUNT(*) FROM bom_items WHERE bom_id = b.id) as component_count
            FROM bom b
            JOIN items i ON b.finished_good_id = i.id
            JOIN categories c ON i.category_id = c.id
            JOIN users u ON b.created_by = u.id
            ORDER BY b.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const [boms] = await db.query(query, [limit, offset]);

        res.json({
            success: true,
            data: boms,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        });
    } catch (error) {
        console.error('Error fetching BOMs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch BOMs', error: error.message });
    }
};

// Get single BOM with all details including components
export const getBOMById = async (req, res) => {
    try {
        const { id } = req.params;

        // Get BOM header
        const [boms] = await db.query(`
            SELECT 
                b.*,
                i.name as finished_good_name,
                i.code as finished_good_code,
                u.username as created_by_name
            FROM bom b
            JOIN items i ON b.finished_good_id = i.id
            JOIN users u ON b.created_by = u.id
            WHERE b.id = ?
        `, [id]);

        if (boms.length === 0) {
            return res.status(404).json({ success: false, message: 'BOM not found' });
        }

        const bom = boms[0];

        // Get BOM items (components)
        const [items] = await db.query(`
            SELECT 
                bi.id,
                bi.raw_material_id,
                i.name as raw_material_name,
                i.code as raw_material_code,
                i.unit_of_measure,
                i.current_stock,
                bi.quantity,
                bi.notes
            FROM bom_items bi
            JOIN items i ON bi.raw_material_id = i.id
            WHERE bi.bom_id = ?
            ORDER BY bi.id
        `, [id]);

        bom.items = items;

        res.json({ success: true, data: bom });
    } catch (error) {
        console.error('Error fetching BOM:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch BOM', error: error.message });
    }
};

// Get BOM by finished good ID
export const getBOMByFinishedGood = async (req, res) => {
    try {
        const { itemId } = req.params;

        const [boms] = await db.query(`
            SELECT 
                b.*,
                i.name as finished_good_name,
                i.code as finished_good_code
            FROM bom b
            JOIN items i ON b.finished_good_id = i.id
            WHERE b.finished_good_id = ? AND b.is_active = TRUE
            ORDER BY b.version DESC
            LIMIT 1
        `, [itemId]);

        if (boms.length === 0) {
            return res.status(404).json({ success: false, message: 'No active BOM found for this item' });
        }

        const bom = boms[0];

        // Get BOM items
        const [items] = await db.query(`
            SELECT 
                bi.*,
                i.name as raw_material_name,
                i.code as raw_material_code,
                i.unit_of_measure,
                i.current_stock
            FROM bom_items bi
            JOIN items i ON bi.raw_material_id = i.id
            WHERE bi.bom_id = ?
        `, [bom.id]);

        bom.items = items;

        res.json({ success: true, data: bom });
    } catch (error) {
        console.error('Error fetching BOM by finished good:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch BOM', error: error.message });
    }
};

// Create new BOM
export const createBOM = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { finished_good_id, description, items } = req.body;
        const created_by = req.user.userId;

        // Validate finished good is of type 'Finished Goods'
        const [finishedGoods] = await connection.query(`
            SELECT i.*, c.type 
            FROM items i 
            JOIN categories c ON i.category_id = c.id 
            WHERE i.id = ?
        `, [finished_good_id]);

        if (finishedGoods.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Finished good not found' });
        }

        if (finishedGoods[0].type !== 'Finished Goods') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Item must be of type "Finished Goods" to create a BOM'
            });
        }

        // Check if an active BOM already exists for this finished good
        const [activeBOM] = await connection.query(
            'SELECT id FROM bom WHERE finished_good_id = ? AND is_active = TRUE',
            [finished_good_id]
        );

        if (activeBOM.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: 'An active Bill of Materials already exists for this finished good. Please deactivate the existing one before creating a new one.'
            });
        }

        // Check if BOM already exists for this finished good
        const [existing] = await connection.query(
            'SELECT MAX(version) as max_version FROM bom WHERE finished_good_id = ?',
            [finished_good_id]
        );

        const version = existing[0].max_version ? existing[0].max_version + 1 : 1;

        // Deactivate previous versions
        await connection.query(
            'UPDATE bom SET is_active = FALSE WHERE finished_good_id = ?',
            [finished_good_id]
        );

        // Insert BOM header
        const [bomResult] = await connection.query(
            'INSERT INTO bom (finished_good_id, version, description, created_by) VALUES (?, ?, ?, ?)',
            [finished_good_id, version, description, created_by]
        );

        const bomId = bomResult.insertId;

        // Validate and insert BOM items
        if (!items || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'BOM must have at least one component' });
        }

        for (const item of items) {
            // Validate raw material is of type 'Raw Materials'
            const [rawMaterials] = await connection.query(`
                SELECT i.*, c.type 
                FROM items i 
                JOIN categories c ON i.category_id = c.id 
                WHERE i.id = ?
            `, [item.raw_material_id]);

            if (rawMaterials.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: `Raw material with ID ${item.raw_material_id} not found`
                });
            }

            if (rawMaterials[0].type !== 'Raw Materials') {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Item "${rawMaterials[0].name}" must be of type "Raw Materials"`
                });
            }

            // Insert BOM item
            await connection.query(
                'INSERT INTO bom_items (bom_id, raw_material_id, quantity, notes) VALUES (?, ?, ?, ?)',
                [bomId, item.raw_material_id, item.quantity, item.notes || null]
            );
        }

        await connection.commit();

        // Fetch and return created BOM
        const [newBOM] = await connection.query(`
            SELECT 
                b.*,
                i.name as finished_good_name,
                i.code as finished_good_code
            FROM bom b
            JOIN items i ON b.finished_good_id = i.id
            WHERE b.id = ?
        `, [bomId]);

        res.status(201).json({
            success: true,
            message: 'BOM created successfully',
            data: newBOM[0]
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error creating BOM:', error);
        res.status(500).json({ success: false, message: 'Failed to create BOM', error: error.message });
    } finally {
        connection.release();
    }
};

// Update BOM
export const updateBOM = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { description, items } = req.body;

        // Check if BOM exists
        const [existing] = await connection.query('SELECT * FROM bom WHERE id = ?', [id]);
        if (existing.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'BOM not found' });
        }

        // Update BOM header
        await connection.query(
            'UPDATE bom SET description = ?, updated_at = NOW() WHERE id = ?',
            [description, id]
        );

        // Delete existing BOM items
        await connection.query('DELETE FROM bom_items WHERE bom_id = ?', [id]);

        // Insert updated BOM items
        if (items && items.length > 0) {
            for (const item of items) {
                // Validate raw material
                const [rawMaterials] = await connection.query(`
                    SELECT i.*, c.type 
                    FROM items i 
                    JOIN categories c ON i.category_id = c.id 
                    WHERE i.id = ?
                `, [item.raw_material_id]);

                if (rawMaterials.length === 0 || rawMaterials[0].type !== 'Raw Materials') {
                    await connection.rollback();
                    return res.status(400).json({
                        success: false,
                        message: 'All components must be of type "Raw Materials"'
                    });
                }

                await connection.query(
                    'INSERT INTO bom_items (bom_id, raw_material_id, quantity, notes) VALUES (?, ?, ?, ?)',
                    [id, item.raw_material_id, item.quantity, item.notes || null]
                );
            }
        }

        await connection.commit();

        res.json({ success: true, message: 'BOM updated successfully' });

    } catch (error) {
        await connection.rollback();
        console.error('Error updating BOM:', error);
        res.status(500).json({ success: false, message: 'Failed to update BOM', error: error.message });
    } finally {
        connection.release();
    }
};

// Update BOM Status
export const updateBOMStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Status must be a boolean' });
        }

        const [result] = await db.query(
            'UPDATE bom SET is_active = ? WHERE id = ?',
            [is_active, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'BOM not found' });
        }

        res.json({ success: true, message: `BOM ${is_active ? 'activated' : 'deactivated'} successfully` });
    } catch (error) {
        console.error('Error updating BOM status:', error);
        res.status(500).json({ success: false, message: 'Failed to update BOM status', error: error.message });
    }
};

// Delete BOM (Soft Delete)
export const deleteBOM = async (req, res) => {
    try {
        const { id } = req.params;

        // Perform soft delete (set is_active = 0)
        const [result] = await db.query('UPDATE bom SET is_active = FALSE WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'BOM not found' });
        }

        res.json({ success: true, message: 'BOM deactivated successfully' });

    } catch (error) {
        console.error('Error deleting BOM:', error);
        res.status(500).json({ success: false, message: 'Failed to delete BOM', error: error.message });
    }
};

// Get finished goods (items with category type 'Finished Goods')
export const getFinishedGoods = async (req, res) => {
    try {
        const [items] = await db.query(`
            SELECT i.id, i.code, i.name, i.unit_of_measure, i.current_stock
            FROM items i
            JOIN categories c ON i.category_id = c.id
            WHERE c.type = 'Finished Goods' AND i.status = 'active'
            ORDER BY i.name
        `);

        res.json({ success: true, data: items });
    } catch (error) {
        console.error('Error fetching finished goods:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch finished goods', error: error.message });
    }
};

// Get raw materials (items with category type 'Raw Materials')
export const getRawMaterials = async (req, res) => {
    try {
        const [items] = await db.query(`
            SELECT i.id, i.code, i.name, i.unit_of_measure, i.current_stock
            FROM items i
            JOIN categories c ON i.category_id = c.id
            WHERE c.type = 'Raw Materials' AND i.status = 'active'
            ORDER BY i.name
        `);

        res.json({ success: true, data: items });
    } catch (error) {
        console.error('Error fetching raw materials:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch raw materials', error: error.message });
    }
};
