import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';

const router = express.Router();

router.use(verifyToken);

/**
 * Get all suppliers with pagination and search
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const params = [];
        let whereClause = "WHERE status = 'active'";

        if (search) {
            whereClause += " AND (name LIKE ? OR code LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM suppliers ${whereClause}`;
        const countResult = await query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated data
        const sql = `
            SELECT * FROM suppliers 
            ${whereClause} 
            ORDER BY name 
            LIMIT ${limit} OFFSET ${offset}
        `;
        
        const suppliers = await query(sql, params);

        res.json({
            success: true,
            data: suppliers,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get single supplier by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const suppliers = await query('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
        if (suppliers.length === 0) {
            return res.status(404).json({ success: false, message: 'Supplier not found' });
        }
        res.json({ success: true, data: suppliers[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Create new supplier
 */
router.post('/', checkPermission('suppliers:create'), async (req, res) => {
    try {
        const { name, contact_person, email, phone, address, city, country, tax_number, payment_terms, credit_limit } = req.body;
        
        // Generate supplier code if not provided
        const code = `SUP${Date.now().toString().slice(-8)}`;
        
        const result = await query(
            'INSERT INTO suppliers (code, name, contact_person, email, phone, address, city, country, tax_number, payment_terms, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [code, name, contact_person, email, phone, address, city, country, tax_number, payment_terms, credit_limit || 0]
        );
        res.status(201).json({ success: true, message: 'Supplier created', data: { id: result.insertId } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Update supplier
 */
router.put('/:id', checkPermission('suppliers:update'), async (req, res) => {
    try {
        const { name, contact_person, email, phone, address, city, country, tax_number, payment_terms, credit_limit } = req.body;
        const { id } = req.params;

        await query(
            'UPDATE suppliers SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, city = ?, country = ?, tax_number = ?, payment_terms = ?, credit_limit = ? WHERE id = ?',
            [name, contact_person, email, phone, address, city, country, tax_number, payment_terms, credit_limit || 0, id]
        );
        res.json({ success: true, message: 'Supplier updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Delete supplier (Soft delete)
 */
router.delete('/:id', checkPermission('suppliers:delete'), async (req, res) => {
    try {
        const { id } = req.params;
        await query("UPDATE suppliers SET status = 'inactive' WHERE id = ?", [id]);
        res.json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
