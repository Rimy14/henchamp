import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';

const router = express.Router();

router.use(verifyToken);

/**
 * Get all sales persons with pagination support
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 1000; // Default high limit if not specified
        const offset = (page - 1) * limit;

        let sql = 'SELECT id, name, status, created_at FROM sales_persons WHERE 1=1';
        const params = [];

        // Filter by status unless 'all' is requested
        if (req.query.all === 'true') {
            // No status filter = all
        } else if (req.query.status) {
            sql += ' AND status = ?';
            params.push(req.query.status);
        } else {
            // Default to active only (backward compatibility)
            sql += ' AND status = ?';
            params.push('active');
        }

        const countSql = sql.replace('SELECT id, name, status, created_at', 'SELECT COUNT(*) as total');

        // Use interpolation for LIMIT/OFFSET to avoid prepared statement issues
        sql += ` ORDER BY name LIMIT ${limit} OFFSET ${offset}`;

        const salesPersons = await query(sql, params);
        const [{ total }] = await query(countSql, params);

        res.json({
            success: true,
            data: salesPersons,
            pagination: {
                totalItems: total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get single sales person by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [salesPerson] = await query(
            'SELECT * FROM sales_persons WHERE id = ?',
            [id]
        );

        if (!salesPerson) {
            return res.status(404).json({ success: false, message: 'Sales person not found' });
        }

        res.json({ success: true, data: salesPerson });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Create new sales person
 */
router.post('/', checkPermission('settings:update'), async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        const result = await query(
            'INSERT INTO sales_persons (name, status) VALUES (?, ?)',
            [name, 'active']
        );

        res.status(201).json({
            success: true,
            message: 'Sales person created successfully',
            data: { id: result.insertId, name }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Update sales person
 */
router.put('/:id', checkPermission('settings:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;

        // Check if sales person exists
        const [existing] = await query('SELECT * FROM sales_persons WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Sales person not found' });
        }

        await query(
            'UPDATE sales_persons SET name = ?, status = ? WHERE id = ?',
            [
                name || existing.name,
                status || existing.status,
                id
            ]
        );

        res.json({
            success: true,
            message: 'Sales person updated successfully',
            data: { id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Deactivate sales person (soft delete)
 */
router.delete('/:id', checkPermission('settings:update'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if sales person exists
        const [salesPerson] = await query('SELECT * FROM sales_persons WHERE id = ?', [id]);
        if (!salesPerson) {
            return res.status(404).json({ success: false, message: 'Sales person not found' });
        }

        // Check if sales person has sale records
        const sales = await query(
            'SELECT COUNT(*) as count FROM sales WHERE sales_person_id = ?',
            [id]
        );

        if (sales[0].count > 0) {
            // Soft delete - set to inactive instead of deleting
            await query(
                'UPDATE sales_persons SET status = ? WHERE id = ?',
                ['inactive', id]
            );
            return res.json({
                success: true,
                message: `Sales person deactivated. Cannot delete sales person with ${sales[0].count} sale record(s).`,
                data: { id, deactivated: true }
            });
        }

        // No sales - can delete
        await query('DELETE FROM sales_persons WHERE id = ?', [id]);
        res.json({
            success: true,
            message: 'Sales person deleted successfully',
            data: { id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get targets and achievements for a specific month
router.get('/targets/:month', async (req, res) => {
    try {
        const { month } = req.params; // YYYY-MM

        // 1. Get targets
        const targets = await query(`
            SELECT sp.id as sales_person_id, sp.name, sp.status,
                   COALESCE(t.target_amount, 0) as target_amount,
                   t.updated_at
            FROM sales_persons sp
            LEFT JOIN sales_person_monthly_targets t 
                ON sp.id = t.sales_person_id AND t.target_month = ?
            WHERE sp.status = 'active'
            ORDER BY sp.name
        `, [month]);

        // 2. Calculate actual sales for this month per sales person
        // Note: sales_person_id is in sales table
        const actuals = await query(`
            SELECT sales_person_id, SUM(total_amount) as total_sales
            FROM sales 
            WHERE sales_person_id IS NOT NULL 
              AND DATE_FORMAT(sale_date, '%Y-%m') = ?
              AND status != 'cancelled'
            GROUP BY sales_person_id
        `, [month]);

        // Map actuals to targets
        const result = targets.map(t => {
            const actual = actuals.find(a => a.sales_person_id === t.sales_person_id);
            return {
                ...t,
                actual_sales: actual ? parseFloat(actual.total_sales) : 0,
                target_amount: parseFloat(t.target_amount)
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Bulk save targets
router.post('/targets/bulk', checkPermission('settings:update'), async (req, res) => {
    try {
        const { target_month, targets } = req.body;

        if (!target_month || !Array.isArray(targets)) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }

        const userId = req.user?.id || 1;

        for (const target of targets) {
            const { sales_person_id, target_amount } = target;
            if (!sales_person_id) continue;

            const [existing] = await query(
                'SELECT id FROM sales_person_monthly_targets WHERE target_month = ? AND sales_person_id = ?',
                [target_month, sales_person_id]
            );

            if (existing) {
                await query(
                    'UPDATE sales_person_monthly_targets SET target_amount = ?, updated_at = NOW() WHERE id = ?',
                    [target_amount, existing.id]
                );
            } else {
                await query(
                    'INSERT INTO sales_person_monthly_targets (target_month, sales_person_id, target_amount, created_by) VALUES (?, ?, ?, ?)',
                    [target_month, sales_person_id, target_amount, userId]
                );
            }
        }

        res.json({ success: true, message: 'Targets saved successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
