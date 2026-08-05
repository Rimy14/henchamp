import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';

const router = express.Router();

router.use(verifyToken);

/**
 * Get all active operators
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 1000; // Default high limit if not specified
        const offset = (page - 1) * limit;

        let sql = 'SELECT id, name, employee_code, phone, email, status, created_at FROM operators WHERE 1=1';
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

        const countSql = sql.replace('SELECT id, name, employee_code, phone, email, status, created_at', 'SELECT COUNT(*) as total');

        // Use interpolation for LIMIT/OFFSET to avoid prepared statement issues
        sql += ` ORDER BY name LIMIT ${limit} OFFSET ${offset}`;

        const operators = await query(sql, params);
        const [{ total }] = await query(countSql, params);

        res.json({
            success: true,
            data: operators,
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
 * Get single operator by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [operator] = await query(
            'SELECT * FROM operators WHERE id = ?',
            [id]
        );

        if (!operator) {
            return res.status(404).json({ success: false, message: 'Operator not found' });
        }

        res.json({ success: true, data: operator });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Create new operator
 */
router.post('/', checkPermission('settings:update'), async (req, res) => {
    try {
        const { name, employee_code, phone, email } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        // Check for duplicate employee code
        if (employee_code) {
            const existing = await query(
                'SELECT id FROM operators WHERE employee_code = ?',
                [employee_code]
            );
            if (existing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Employee code already exists'
                });
            }
        }

        const result = await query(
            'INSERT INTO operators (name, employee_code, phone, email, status) VALUES (?, ?, ?, ?, ?)',
            [name, employee_code || null, phone || null, email || null, 'active']
        );

        res.status(201).json({
            success: true,
            message: 'Operator created successfully',
            data: { id: result.insertId, name, employee_code }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Update operator
 */
router.put('/:id', checkPermission('settings:update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, employee_code, phone, email, status } = req.body;

        // Check if operator exists
        const [existing] = await query('SELECT * FROM operators WHERE id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Operator not found' });
        }

        // Check for duplicate employee code
        if (employee_code && employee_code !== existing.employee_code) {
            const duplicate = await query(
                'SELECT id FROM operators WHERE employee_code = ? AND id != ?',
                [employee_code, id]
            );
            if (duplicate.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Employee code already exists'
                });
            }
        }

        await query(
            'UPDATE operators SET name = ?, employee_code = ?, phone = ?, email = ?, status = ? WHERE id = ?',
            [
                name || existing.name,
                employee_code !== undefined ? employee_code : existing.employee_code,
                phone !== undefined ? phone : existing.phone,
                email !== undefined ? email : existing.email,
                status || existing.status,
                id
            ]
        );

        res.json({
            success: true,
            message: 'Operator updated successfully',
            data: { id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Deactivate operator (soft delete)
 */
router.delete('/:id', checkPermission('settings:update'), async (req, res) => {
    try {
        const { id } = req.params;

        // Check if operator exists
        const [operator] = await query('SELECT * FROM operators WHERE id = ?', [id]);
        if (!operator) {
            return res.status(404).json({ success: false, message: 'Operator not found' });
        }

        // Check if operator has sale records
        const sales = await query(
            'SELECT COUNT(*) as count FROM sale_operators WHERE operator_id = ?',
            [id]
        );

        if (sales[0].count > 0) {
            // Soft delete - set to inactive instead of deleting
            await query(
                'UPDATE operators SET status = ? WHERE id = ?',
                ['inactive', id]
            );
            return res.json({
                success: true,
                message: `Operator deactivated. Cannot delete operator with ${sales[0].count} sale record(s).`,
                data: { id, deactivated: true }
            });
        }

        // No sales - can delete
        await query('DELETE FROM operators WHERE id = ?', [id]);
        res.json({
            success: true,
            message: 'Operator deleted successfully',
            data: { id }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
