import { query } from '../config/database.js';

/**
 * Get all units of measure
 */
export const getAllUOMs = async (req, res) => {
    try {
        const uoms = await query('SELECT * FROM units_of_measure ORDER BY name ASC');
        res.json({ success: true, data: uoms });
    } catch (error) {
        console.error('Error getting UOMs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch units of measure' });
    }
};

/**
 * Create a new unit of measure
 */
export const createUOM = async (req, res) => {
    try {
        const { name, short_name, description } = req.body;

        if (!name || !short_name) {
            return res.status(400).json({ success: false, message: 'Name and short name are required' });
        }

        const result = await query(
            'INSERT INTO units_of_measure (name, short_name, abbreviation, description) VALUES (?, ?, ?, ?)',
            [name, short_name, short_name, description || null]
        );

        res.status(201).json({
            success: true,
            message: 'Unit of measure created successfully',
            data: { id: result.insertId, name, short_name, description }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Unit of measure name or short name already exists' });
        }
        console.error('Error creating UOM:', error);
        res.status(500).json({ success: false, message: 'Failed to create unit of measure' });
    }
};

/**
 * Update a unit of measure
 */
export const updateUOM = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, short_name, description } = req.body;

        if (!name || !short_name) {
            return res.status(400).json({ success: false, message: 'Name and short name are required' });
        }

        await query(
            'UPDATE units_of_measure SET name = ?, short_name = ?, abbreviation = ?, description = ? WHERE id = ?',
            [name, short_name, short_name, description || null, id]
        );

        res.json({
            success: true,
            message: 'Unit of measure updated successfully',
            data: { id, name, short_name, description }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Unit of measure name or short name already exists' });
        }
        console.error('Error updating UOM:', error);
        res.status(500).json({ success: false, message: 'Failed to update unit of measure' });
    }
};

/**
 * Delete a unit of measure
 */
export const deleteUOM = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if UOM is being used by any items
        const inUseItems = await query('SELECT id FROM items WHERE unit_of_measure = (SELECT short_name FROM units_of_measure WHERE id = ?)', [id]);
        
        if (inUseItems.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete unit of measure as it is currently being used by some items.' 
            });
        }

        await query('DELETE FROM units_of_measure WHERE id = ?', [id]);

        res.json({ success: true, message: 'Unit of measure deleted successfully' });
    } catch (error) {
        console.error('Error deleting UOM:', error);
        res.status(500).json({ success: false, message: 'Failed to delete unit of measure' });
    }
};
