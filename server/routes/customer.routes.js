import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';

const router = express.Router();

router.use(verifyToken);

/**
 * Get all customers with pagination and search
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
            whereClause += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR customer_code LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM customers ${whereClause}`;
        const countResult = await query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated data
        const sql = `
            SELECT * FROM customers 
            ${whereClause} 
            ORDER BY name 
            LIMIT ${limit} OFFSET ${offset}
        `;

        const customers = await query(sql, params);

        res.json({
            success: true,
            data: customers,
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
 * Get single customer by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const customers = await query('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        if (customers.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        res.json({ success: true, data: customers[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Create new customer
 */
router.post('/', checkPermission('customers:create'), async (req, res) => {
    try {
        const { name, email, phone, address, city, company, credit_period } = req.body;

        // Generate customer code if not provided
        const customer_code = `CUST${Date.now().toString().slice(-8)}`;

        const result = await query(
            'INSERT INTO customers (customer_code, name, email, phone, address, city, company, credit_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [customer_code, name, email, phone, address, city, company || 'PRINTHUB', credit_period || 30]
        );
        res.status(201).json({ success: true, message: 'Customer created', data: { id: result.insertId } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Update customer
 */
router.put('/:id', checkPermission('customers:update'), async (req, res) => {
    try {
        const { name, email, phone, address, city, company, credit_period } = req.body;
        const { id } = req.params;

        await query(
            'UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?, company = ?, credit_period = ? WHERE id = ?',
            [name, email, phone, address, city, company || 'PRINTHUB', credit_period || 30, id]
        );
        res.json({ success: true, message: 'Customer updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Delete customer (Soft delete)
 */
router.delete('/:id', checkPermission('customers:delete'), async (req, res) => {
    try {
        const { id } = req.params;
        await query("UPDATE customers SET status = 'inactive' WHERE id = ?", [id]);
        res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get customer purchase history (sales logs)
 */
router.get('/:id/history', async (req, res) => {
    try {
        const history = await query(
            `SELECT id, invoice_number, sale_date, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status 
             FROM sales 
             WHERE customer_id = ? 
             ORDER BY sale_date DESC`,
            [req.params.id]
        );
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
