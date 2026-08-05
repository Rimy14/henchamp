import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';

const router = express.Router();

router.use(verifyToken);

// =====================================================
// OVERALL MONTHLY TARGETS
// =====================================================

// Get overall target for specific month
router.get('/overall/:month', async (req, res) => {
    try {
        const { month } = req.params; // Format: YYYY-MM-01

        const [target] = await query(
            'SELECT * FROM monthly_sales_targets WHERE target_month = ?',
            [month]
        );

        res.json({ success: true, data: target || null });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create or update overall monthly target
router.post('/overall', checkPermission('settings:write'), async (req, res) => {
    try {
        const { target_month, overall_target } = req.body;

        if (!target_month || !overall_target) {
            return res.status(400).json({
                success: false,
                message: 'target_month and overall_target are required'
            });
        }

        // Get user ID, fallback to 1 if not available
        const userId = req.user?.id || 1;

        // Check if target already exists
        const [existing] = await query(
            'SELECT id FROM monthly_sales_targets WHERE target_month = ?',
            [target_month]
        );

        let result;
        if (existing) {
            // Update existing target
            result = await query(
                `UPDATE monthly_sales_targets 
                 SET overall_target = ?, updated_at = NOW() 
                 WHERE target_month = ?`,
                [overall_target, target_month]
            );
        } else {
            // Insert new target
            result = await query(
                `INSERT INTO monthly_sales_targets (target_month, overall_target, created_by) 
                 VALUES (?, ?, ?)`,
                [target_month, overall_target, userId]
            );
        }

        res.json({
            success: true,
            message: existing ? 'Target updated successfully' : 'Target created successfully',
            data: { target_month, overall_target }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete overall target
router.delete('/overall/:month', checkPermission('settings:write'), async (req, res) => {
    try {
        const { month } = req.params;

        await query('DELETE FROM monthly_sales_targets WHERE target_month = ?', [month]);

        res.json({ success: true, message: 'Target deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// OPERATOR MONTHLY TARGETS
// =====================================================

// Get all operator targets for a specific month
router.get('/operators/:month', async (req, res) => {
    try {
        const { month } = req.params;

        const targets = await query(
            `SELECT omt.*, o.name as operator_name, o.status as operator_status
             FROM operator_monthly_targets omt
             JOIN operators o ON omt.operator_id = o.id
             WHERE omt.target_month = ?
             ORDER BY o.name`,
            [month]
        );

        res.json({ success: true, data: targets });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create or update single operator target
router.post('/operators', checkPermission('settings:write'), async (req, res) => {
    try {
        const { target_month, operator_id, target_amount } = req.body;

        if (!target_month || !operator_id || !target_amount) {
            return res.status(400).json({
                success: false,
                message: 'target_month, operator_id, and target_amount are required'
            });
        }

        // Get user ID, fallback to 1 if not available
        const userId = req.user?.id || 1;

        // Check if target already exists
        const [existing] = await query(
            'SELECT id FROM operator_monthly_targets WHERE target_month = ? AND operator_id = ?',
            [target_month, operator_id]
        );

        let result;
        if (existing) {
            // Update existing target
            result = await query(
                `UPDATE operator_monthly_targets 
                 SET target_amount = ?, updated_at = NOW() 
                 WHERE target_month = ? AND operator_id = ?`,
                [target_amount, target_month, operator_id]
            );
        } else {
            // Insert new target
            result = await query(
                `INSERT INTO operator_monthly_targets (target_month, operator_id, target_amount, created_by) 
                 VALUES (?, ?, ?, ?)`,
                [target_month, operator_id, target_amount, userId]
            );
        }

        res.json({
            success: true,
            message: existing ? 'Operator target updated successfully' : 'Operator target created successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Bulk create/update operator targets
router.post('/operators/bulk', checkPermission('settings:write'), async (req, res) => {
    try {
        const { target_month, targets } = req.body;

        if (!target_month || !Array.isArray(targets) || targets.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'target_month and targets array are required'
            });
        }

        // Get user ID, fallback to 1 if not available
        const userId = req.user?.id || 1;

        // Process each target
        for (const target of targets) {
            const { operator_id, target_amount } = target;

            if (!operator_id || target_amount === undefined) {
                continue; // Skip invalid entries
            }

            // Check if exists
            const [existing] = await query(
                'SELECT id FROM operator_monthly_targets WHERE target_month = ? AND operator_id = ?',
                [target_month, operator_id]
            );

            if (existing) {
                // Update
                await query(
                    `UPDATE operator_monthly_targets
                     SET target_amount = ?, updated_at = NOW()
                     WHERE target_month = ? AND operator_id = ?`,
                    [target_amount, target_month, operator_id]
                );
            } else {
                // Insert
                await query(
                    `INSERT INTO operator_monthly_targets (target_month, operator_id, target_amount, created_by)
                     VALUES (?, ?, ?, ?)`,
                    [target_month, operator_id, target_amount, userId]
                );
            }
        }

        res.json({
            success: true,
            message: `Bulk targets saved successfully for ${targets.length} operators`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete operator target
router.delete('/operators/:id', checkPermission('settings:write'), async (req, res) => {
    try {
        const { id } = req.params;

        await query('DELETE FROM operator_monthly_targets WHERE id = ?', [id]);

        res.json({ success: true, message: 'Operator target deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
