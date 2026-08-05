import express from 'express';
import { query } from '../config/database.js';

const router = express.Router();

// Get client-side configuration settings
router.get('/client-config', (req, res) => {
    res.json({
        success: true,
        config: {
            showPrintPreview: process.env.SHOW_PRINT_PREVIEW === 'true',
            enableQzTray: process.env.ENABLE_QZ_TRAY === 'true'
        }
    });
});

// Get public product catalog for customer storefront
router.get('/public-items', async (req, res) => {
    try {
        const sql = `
            SELECT i.id, i.code, i.name, i.description, i.selling_price, i.reorder_level, i.status,
                   c.name as category_name, c.code_prefix,
                   (SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE item_id = i.id) as stock_quantity
            FROM items i
            LEFT JOIN categories c ON i.category_id = c.id
            WHERE i.status = 'active'
            ORDER BY i.id ASC
        `;
        const items = await query(sql, []);
        res.json({
            success: true,
            data: items
        });
    } catch (error) {
        console.error('Error fetching public items:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch catalog.' });
    }
});

export default router;
