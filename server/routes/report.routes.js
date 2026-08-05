import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { query } from '../config/database.js';
import cache from '../utils/cache.js';

const router = express.Router();

router.use(verifyToken);

// Dashboard metrics
router.get('/dashboard', async (req, res) => {
    try {
        // Try cache first (cache for 1 minute - dashboard changes frequently)
        const cacheKey = 'dashboard:metrics';
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Get today's date in Asia/Colombo timezone
        const today = new Date().toLocaleString('en-CA', {
            timeZone: 'Asia/Colombo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).split(',')[0]; // Format: YYYY-MM-DD

        // Today's sales (exclude cancelled)
        const [todaySales] = await query(
            'SELECT COALESCE(SUM(total_amount), 0) as total FROM sales WHERE DATE(sale_date) = ? AND status != ?',
            [today, 'cancelled']
        );

        // Low stock items - check Shop location inventory against reorder_level (Finished Goods only)
        const lowStock = await query(
            `SELECT COUNT(DISTINCT i.id) as count 
             FROM items i
             LEFT JOIN categories c ON i.category_id = c.id
             LEFT JOIN inventory inv ON i.id = inv.item_id 
             LEFT JOIN locations loc ON inv.location_id = loc.id AND loc.name = 'Shop'
             WHERE COALESCE(inv.quantity, 0) <= i.reorder_level 
             AND i.status = 'active'
             AND i.reorder_level > 0
             AND c.type = 'Finished Goods'`,
            []
        );

        // Pending POs
        const [pendingPOs] = await query(
            'SELECT COUNT(*) as count FROM purchase_orders WHERE status IN (?, ?)',
            ['draft', 'approved']
        );

        // Finished Goods without BOM
        const [bomNotAssigned] = await query(
            `SELECT COUNT(DISTINCT i.id) as count
             FROM items i
             JOIN categories c ON i.category_id = c.id
             WHERE c.type = 'Finished Goods'
             AND i.status = 'active'
             AND i.id NOT IN(
                SELECT DISTINCT finished_good_id 
                 FROM bom 
                 WHERE is_active = TRUE
            )`,
            []
        );

        // Credit Invoices (Pending for 30 days or more)
        const [pendingInvoices] = await query(
            'SELECT COUNT(*) as count FROM sales WHERE status = ? ',
            ['pending']
        );

        // 1. Sales Trend (from start of previous month to current date)
        const salesTrend = await query(
            `SELECT 
                DATE_FORMAT(sale_date, '%Y-%m-%d') as date, 
                COALESCE(SUM(total_amount), 0) as total 
             FROM sales 
             WHERE sale_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH) 
               AND status != 'cancelled' 
             GROUP BY DATE_FORMAT(sale_date, '%Y-%m-%d') 
             ORDER BY DATE_FORMAT(sale_date, '%Y-%m-%d') ASC`,
            []
        );

        // 2. Payment Distribution (daily breakdown from start of previous month to current date)
        const paymentMethods = await query(
            `SELECT 
                DATE_FORMAT(s.sale_date, '%Y-%m-%d') as date,
                sp.payment_method, 
                COALESCE(SUM(sp.amount), 0) as total 
             FROM sale_payments sp
             JOIN sales s ON sp.sale_id = s.id
             WHERE s.sale_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
               AND s.status != 'cancelled'
             GROUP BY DATE_FORMAT(s.sale_date, '%Y-%m-%d'), sp.payment_method
             ORDER BY DATE_FORMAT(s.sale_date, '%Y-%m-%d') ASC`,
            []
        );

        const response = {
            success: true,
            data: {
                todaySales: todaySales.total,
                lowStockCount: lowStock[0].count,
                pendingPOsCount: pendingPOs.count,
                bomNotAssignedCount: bomNotAssigned.count,
                pendingInvoicesCount: pendingInvoices.count,
                charts: {
                    salesTrend: salesTrend,
                    paymentMethods: paymentMethods
                }
            }
        };

        // Cache for 1 minute (60 seconds)
        cache.set(cacheKey, response, 60);

        res.json(response);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Sales summary report
router.get('/sales/summary', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        // Total sales
        const [totalSales] = await query(
            `SELECT 
                COUNT(*) as total_transactions,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(SUM(discount_amount), 0) + COALESCE(SUM((
                SELECT SUM(si.discount_amount) 
                    FROM sale_items si 
                    WHERE si.sale_id = sales.id
            )), 0) as total_discounts,
            COALESCE(SUM((
                SELECT SUM(si.cost_price * si.quantity)
                FROM sale_items si
                WHERE si.sale_id = sales.id
            )), 0) as total_cost,
            COALESCE(SUM(tax_amount), 0) as total_tax,
                COALESCE(AVG(total_amount), 0) as average_sale
            FROM sales 
            WHERE sale_date BETWEEN ? AND ?
            AND status != 'cancelled'`,
            [start_date, end_date]
        );

        // Cancelled sales
        const [cancelledSales] = await query(
            `SELECT COUNT(*) as cancelled_count, COALESCE(SUM(total_amount), 0) as cancelled_revenue
            FROM sales 
            WHERE sale_date BETWEEN ? AND ?
            AND status = 'cancelled'`,
            [start_date, end_date]
        );

        // Returned sales (Cancelled with 'Return' in notes)
        const [returnedSales] = await query(
            `SELECT COUNT(*) as returned_count, COALESCE(SUM(total_amount), 0) as returned_revenue
            FROM sales 
            WHERE sale_date BETWEEN ? AND ?
            AND status = 'cancelled'
            AND notes LIKE '%[CANCELLED] Return%'`,
            [start_date, end_date]
        );

        // Payment method breakdown
        const paymentMethods = await query(
            `SELECT
        sp.payment_method,
            COUNT(DISTINCT sp.sale_id) as transaction_count,
            COALESCE(SUM(sp.amount), 0) as total_amount
            FROM sale_payments sp
            JOIN sales s ON sp.sale_id = s.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND s.status != 'cancelled'
            GROUP BY sp.payment_method
            ORDER BY total_amount DESC`,
            [start_date, end_date]
        );

        // Top selling products
        const topProducts = await query(
            `SELECT
        i.id,
            i.name,
            i.code,
            c.name as category_name,
            COUNT(si.id) as times_sold,
            SUM(si.quantity) as total_quantity,
            COALESCE(SUM(si.total_price), 0) as total_revenue
            FROM sale_items si
            JOIN items i ON si.item_id = i.id
            LEFT JOIN categories c ON i.category_id = c.id
            JOIN sales s ON si.sale_id = s.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND s.status != 'cancelled'
            GROUP BY i.id, i.name, i.code, c.name
            ORDER BY total_revenue DESC
            LIMIT 10`,
            [start_date, end_date]
        );

        res.json({
            success: true,
            data: {
                summary: {
                    ...totalSales,
                    cancelled_transactions: cancelledSales.cancelled_count,
                    cancelled_revenue: cancelledSales.cancelled_revenue,
                    returned_transactions: returnedSales.returned_count,
                    returned_revenue: returnedSales.returned_revenue
                },
                paymentMethods,
                topProducts
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Daily sales breakdown
router.get('/sales/daily', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const dailySales = await query(
            `SELECT
                DATE_FORMAT(s.sale_date, '%Y-%m-%d') as date,
                COUNT(DISTINCT s.id) as transactions,
                COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as revenue,
                COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN (
                    SELECT SUM(si.cost_price * si.quantity)
                    FROM sale_items si
                    WHERE si.sale_id = s.id
                ) ELSE 0 END), 0) as total_cost,
                COALESCE(SUM(CASE WHEN s.status = 'cancelled' THEN s.total_amount ELSE 0 END), 0) as cancelled_revenue,
                COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.discount_amount ELSE 0 END), 0) +
                COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN (
                    SELECT SUM(si.discount_amount) 
                    FROM sale_items si 
                    WHERE si.sale_id = s.id
                ) ELSE 0 END), 0) as total_discounts,
                COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.tax_amount ELSE 0 END), 0) as total_tax,
                COALESCE(SUM(CASE WHEN s.status = 'cancelled' AND s.notes LIKE '%[CANCELLED] Return%' THEN s.total_amount ELSE 0 END), 0) as returned_revenue,
                COALESCE(pct.expenses, 0) as petty_cash_expenses
            FROM sales s
            LEFT JOIN (
                SELECT 
                    transaction_date, 
                    SUM(amount) as expenses
                FROM petty_cash_transactions
                WHERE type = 'disbursement' AND is_voided = FALSE
                GROUP BY transaction_date
            ) pct ON pct.transaction_date = DATE(s.sale_date)
            WHERE s.sale_date BETWEEN ? AND ?
            GROUP BY DATE_FORMAT(s.sale_date, '%Y-%m-%d'), pct.expenses 
            ORDER BY DATE_FORMAT(s.sale_date, '%Y-%m-%d') DESC`,
            [start_date, end_date]
        );

        res.json({ success: true, data: dailySales });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Product-wise sales report
router.get('/sales/products', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date, category_type } = req.query;

        let whereClause = 'WHERE s.sale_date BETWEEN ? AND ? AND s.status != ?';
        const params = [start_date, end_date, 'cancelled'];

        if (category_type) {
            whereClause += ' AND c.type = ?';
            params.push(category_type);
        }

        const productSales = await query(
            `SELECT
                i.id,
                i.code,
                i.name,
                c.name as category_name,
                c.type as category_type,
                COUNT(DISTINCT s.id) as times_sold,
                SUM(si.quantity) as total_quantity_sold,
                COALESCE(SUM(si.total_price), 0) as total_revenue,
                COALESCE(AVG(si.unit_price), 0) as average_unit_price,
                COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cost,
                COALESCE(SUM(si.discount_amount), 0) as total_item_discounts,
                COALESCE(SUM(
                    s.discount_amount * (si.total_price / NULLIF(s.subtotal, 0))
                ), 0) as total_invoice_discount_allocated,
                COALESCE(SUM(
                    si.total_price
                    - (si.cost_price * si.quantity)
                    - (s.discount_amount * (si.total_price / NULLIF(s.subtotal, 0)))
                ), 0) as profit
            FROM sale_items si
            JOIN items i ON si.item_id = i.id
            LEFT JOIN categories c ON i.category_id = c.id
            JOIN sales s ON si.sale_id = s.id
            ${whereClause}
            GROUP BY i.id, i.code, i.name, c.name, c.type
            ORDER BY total_revenue DESC`,
            params
        );

        res.json({ success: true, data: productSales });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cashier performance report
router.get('/sales/cashiers', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const cashierPerformance = await query(
            `SELECT
        u.id,
            u.username,
            u.role,
            COUNT(DISTINCT s.id) as total_transactions,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
            COALESCE(AVG(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as average_transaction,
            COUNT(DISTINCT CASE WHEN s.status = 'cancelled' THEN s.id END) as cancelled_transactions,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.discount_amount ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN(
                SELECT SUM(si.discount_amount) 
                    FROM sale_items si 
                    WHERE si.sale_id = s.id
            ) ELSE 0 END), 0) as total_discounts
            FROM sales s
            JOIN users u ON s.cashier_id = u.id
            WHERE s.sale_date BETWEEN ? AND ?
            GROUP BY u.id, u.username, u.role
            ORDER BY total_revenue DESC`,
            [start_date, end_date]
        );

        res.json({ success: true, data: cashierPerformance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Payment methods breakdown
router.get('/sales/payments', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const paymentBreakdown = await query(
            `SELECT
        sp.payment_method,
            COUNT(DISTINCT sp.sale_id) as transaction_count,
            COUNT(sp.id) as payment_count,
            COALESCE(SUM(sp.amount), 0) as total_amount,
            COALESCE(AVG(sp.amount), 0) as average_amount,
            MIN(sp.amount) as min_amount,
            MAX(sp.amount) as max_amount
            FROM sale_payments sp
            JOIN sales s ON sp.sale_id = s.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND s.status != 'cancelled'
            GROUP BY sp.payment_method
            ORDER BY total_amount DESC`,
            [start_date, end_date]
        );

        res.json({ success: true, data: paymentBreakdown });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Operator performance report
router.get('/sales/operators', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const operatorPerformance = await query(
            `SELECT
        o.id,
            o.name as operator_name,
            o.status,
            COUNT(DISTINCT so.sale_id) as total_transactions,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
            COALESCE(AVG(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as average_transaction,
            COUNT(DISTINCT CASE WHEN s.status = 'cancelled' THEN so.sale_id END) as cancelled_transactions,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN(
                SELECT SUM(si.quantity) 
                    FROM sale_items si 
                    WHERE si.sale_id = s.id
            ) ELSE 0 END), 0) as total_items_sold,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.discount_amount ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN(
                SELECT SUM(si.discount_amount) 
                    FROM sale_items si 
                    WHERE si.sale_id = s.id
            ) ELSE 0 END), 0) as total_discounts
            FROM sale_operators so
            JOIN operators o ON so.operator_id = o.id
            JOIN sales s ON so.sale_id = s.id
            WHERE s.sale_date BETWEEN ? AND ?
            GROUP BY o.id, o.name, o.status
            ORDER BY total_revenue DESC`,
            [start_date, end_date]
        );

        res.json({ success: true, data: operatorPerformance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Operator performance report - Daily
router.get('/sales/operators-daily', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const operatorPerformance = await query(
            `SELECT
        DATE(s.sale_date) as sale_date,
        o.id,
        o.name as operator_name,
        o.status,
        COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.discount_amount ELSE 0 END), 0) +
        COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN(
            SELECT SUM(si.discount_amount)
                FROM sale_items si
                WHERE si.sale_id = s.id
        ) ELSE 0 END), 0) as total_discounts
        FROM sales s
        JOIN sale_operators so ON s.id = so.sale_id
        JOIN operators o ON so.operator_id = o.id
        WHERE s.sale_date BETWEEN ? AND ?
        GROUP BY DATE(s.sale_date), o.id, o.name, o.status
        ORDER BY sale_date DESC, total_revenue DESC`,
            [start_date, end_date]
        );

        res.json({ success: true, data: operatorPerformance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Sales Person performance report
router.get('/sales/sales-persons', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const salesPersonPerformance = await query(
            `SELECT
        sp.id,
            sp.name as sales_person_name,
            sp.status,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.discount_amount ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN(
                SELECT SUM(si.discount_amount) 
                    FROM sale_items si 
                    WHERE si.sale_id = s.id
            ) ELSE 0 END), 0) as total_discounts
            FROM sales s
            JOIN sales_persons sp ON s.sales_person_id = sp.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND sp.hide = FALSE
            GROUP BY sp.id, sp.name, sp.status
            ORDER BY total_revenue DESC`,
            [start_date, end_date]
        );

        res.json({ success: true, data: salesPersonPerformance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Sales Person performance report - Daily
router.get('/sales/sales-persons-daily', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const salesPersonPerformance = await query(
            `SELECT
        DATE(s.sale_date) as sale_date,
        sp.id,
            sp.name as sales_person_name,
            sp.status,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.discount_amount ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN(
                SELECT SUM(si.discount_amount) 
                    FROM sale_items si 
                    WHERE si.sale_id = s.id
            ) ELSE 0 END), 0) as total_discounts
            FROM sales s
            JOIN sales_persons sp ON s.sales_person_id = sp.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND sp.hide = FALSE
            GROUP BY DATE(s.sale_date), sp.id, sp.name, sp.status
            ORDER BY sale_date DESC, total_revenue DESC`,
            [start_date, end_date]
        );

        res.json({ success: true, data: salesPersonPerformance });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Monthly targets report (Overall + Operator-wise)
router.get('/sales/monthly-targets', checkPermission('reports:read'), async (req, res) => {
    try {
        const { year, month } = req.query;

        // First, find all distinct months that have ANY type of target
        let distinctMonthsQuery = '';
        let distinctMonthsParams = [];

        if (month) {
            distinctMonthsQuery = `
                SELECT DISTINCT target_month as month FROM(
                SELECT target_month FROM monthly_sales_targets WHERE target_month = ?
                    UNION
                    SELECT target_month FROM operator_monthly_targets WHERE target_month = ?
                UNION
                    SELECT DATE_FORMAT(CONCAT(target_month, '-01'), '%Y-%m-01') as target_month 
                    FROM sales_person_monthly_targets WHERE target_month = ?
                ) all_months
                ORDER BY month DESC`;
            distinctMonthsParams = [month, month, month.substring(0, 7)];
        } else if (year) {
            distinctMonthsQuery = `
                SELECT DISTINCT target_month as month FROM(
                    SELECT target_month FROM monthly_sales_targets WHERE YEAR(target_month) = ?
                        UNION
                    SELECT target_month FROM operator_monthly_targets WHERE YEAR(target_month) = ?
                    UNION
                    SELECT DATE_FORMAT(CONCAT(target_month, '-01'), '%Y-%m-01') as target_month 
                    FROM sales_person_monthly_targets WHERE YEAR(CONCAT(target_month, '-01')) = ?
                ) all_months
                ORDER BY month DESC`;
            distinctMonthsParams = [year, year, year];
        } else {
            return res.json({ success: true, data: [] });
        }

        const distinctMonths = await query(distinctMonthsQuery, distinctMonthsParams);

        // For each month, get overall target (or default to 0) and performance data
        const results = [];

        for (const { month: targetMonth } of distinctMonths) {
            // Get overall target (may not exist)
            const [overallTarget] = await query(
                `SELECT
        DATE_FORMAT(target_month, '%Y-%m-%d') as month,
            DATE_FORMAT(target_month, '%M %Y') as month_name,
            overall_target,
            (SELECT COUNT(DISTINCT operator_id) 
                     FROM operator_monthly_targets 
                     WHERE target_month = ?) as operator_count,
            (SELECT COUNT(DISTINCT sales_person_id)
                     FROM sales_person_monthly_targets
                     WHERE target_month = DATE_FORMAT(?, '%Y-%m')) as sales_person_count
                FROM monthly_sales_targets
                WHERE target_month = ? `,
                [targetMonth, targetMonth, targetMonth]
            );

            // Calculate actual sales for this month
            const [actualSales] = await query(
                `SELECT COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) as actual_sales
                FROM sales 
                WHERE DATE_FORMAT(sale_date, '%Y-%m-01') = ? `,
                [targetMonth]
            );

            const overall = overallTarget || {
                month: targetMonth,
                month_name: new Date(targetMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                overall_target: 0,
                operator_count: 0,
                sales_person_count: 0
            };

            overall.actual_sales = parseFloat(actualSales.actual_sales);
            overall.balance = overall.actual_sales - parseFloat(overall.overall_target);
            overall.achieved_percentage = overall.overall_target > 0
                ? parseFloat(((overall.actual_sales / overall.overall_target) * 100).toFixed(2))
                : 0;
            // Get operator targets and actual sales
            const operatorPerformance = await query(
                `SELECT
omt.id as target_id,
    omt.operator_id,
    o.name as operator_name,
    o.status as operator_status,
    omt.target_amount as target,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as actual_sales,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) - omt.target_amount as balance,
    CASE 
                        WHEN omt.target_amount > 0 THEN
ROUND((COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) / omt.target_amount * 100), 2)
                        ELSE 0
END as achieved_percentage
                FROM operator_monthly_targets omt
                JOIN operators o ON omt.operator_id = o.id
                LEFT JOIN sale_operators so ON so.operator_id = omt.operator_id
                LEFT JOIN sales s ON so.sale_id = s.id AND DATE_FORMAT(s.sale_date, '%Y-%m-01') = omt.target_month
                WHERE omt.target_month = ?
    GROUP BY omt.id, omt.operator_id, o.name, o.status, omt.target_amount
                ORDER BY achieved_percentage DESC`,
                [overall.month]
            );

            // Calculate contribution to overall for each operator
            const totalActualSales = parseFloat(overall.actual_sales);
            operatorPerformance.forEach((op, index) => {
                op.contribution_to_overall = totalActualSales > 0
                    ? parseFloat((parseFloat(op.actual_sales) / totalActualSales * 100).toFixed(2))
                    : 0;
                op.rank = index + 1;
            });

            // Find operators without targets who made sales
            const operatorsWithoutTargets = await query(
                `SELECT DISTINCT
o.id as operator_id,
    o.name as operator_name,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as actual_sales
                FROM sale_operators so
                JOIN operators o ON so.operator_id = o.id
                JOIN sales s ON so.sale_id = s.id
                WHERE DATE_FORMAT(s.sale_date, '%Y-%m-01') = ?
    AND o.id NOT IN(
        SELECT operator_id 
                    FROM operator_monthly_targets 
                    WHERE target_month = ?
                )
                GROUP BY o.id, o.name
                HAVING actual_sales > 0`,
                [overall.month, overall.month]
            );

            // Get SALES PERSON targets and actual sales (NEW)
            // Note: sales_person_monthly_targets uses VARCHAR(7) for target_month (YYYY-MM format)
            // Convert to string in case it's a Date object, then extract YYYY-MM
            const monthString = overall.month instanceof Date
                ? overall.month.toISOString().substring(0, 10)
                : String(overall.month);
            const monthYYYYMM = monthString.substring(0, 7); // Extract YYYY-MM from YYYY-MM-01

            const salesPersonPerformance = await query(
                `SELECT
spmt.id as target_id,
    spmt.sales_person_id,
    sp.name as sales_person_name,
    sp.status as sales_person_status,
    spmt.target_amount as target,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as actual_sales,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) - spmt.target_amount as balance,
    CASE 
                        WHEN spmt.target_amount > 0 THEN
ROUND((COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) / spmt.target_amount * 100), 2)
                        ELSE 0
END as achieved_percentage
                FROM sales_person_monthly_targets spmt
                JOIN sales_persons sp ON spmt.sales_person_id = sp.id
                LEFT JOIN sales s ON s.sales_person_id = spmt.sales_person_id AND DATE_FORMAT(s.sale_date, '%Y-%m') = spmt.target_month
                WHERE spmt.target_month = ?
    AND sp.hide = FALSE
                GROUP BY spmt.id, spmt.sales_person_id, sp.name, sp.status, spmt.target_amount
                ORDER BY achieved_percentage DESC`,
                [monthYYYYMM]
            );

            // Calculate contribution for sales persons
            salesPersonPerformance.forEach((sp, index) => {
                sp.contribution_to_overall = totalActualSales > 0
                    ? parseFloat((parseFloat(sp.actual_sales) / totalActualSales * 100).toFixed(2))
                    : 0;
                sp.rank = index + 1;
            });

            // Find sales persons without targets who made sales
            const salesPersonsWithoutTargets = await query(
                `SELECT DISTINCT
sp.id as sales_person_id,
    sp.name as sales_person_name,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as actual_sales
                FROM sales s
                JOIN sales_persons sp ON s.sales_person_id = sp.id
                WHERE DATE_FORMAT(s.sale_date, '%Y-%m') = ?
    AND sp.hide = FALSE
                AND sp.id NOT IN(
        SELECT sales_person_id 
                    FROM sales_person_monthly_targets 
                    WHERE target_month = ?
                )
                GROUP BY sp.id, sp.name
                HAVING actual_sales > 0`,
                [monthYYYYMM, monthYYYYMM]
            );

            // Calculate variance (sum of operator targets vs overall target)
            const sumOperatorTargets = operatorPerformance.reduce(
                (sum, op) => sum + parseFloat(op.target),
                0
            );

            const variance = {
                sum_of_operator_targets: sumOperatorTargets,
                overall_target: parseFloat(overall.overall_target),
                difference: parseFloat(overall.overall_target) - sumOperatorTargets,
                percentage: overall.overall_target > 0
                    ? parseFloat((sumOperatorTargets / parseFloat(overall.overall_target) * 100).toFixed(2))
                    : 0
            };

            // Get company-wise sales breakdown
            const companySales = await query(
                `SELECT
COALESCE(c.company, 'PRINTHUB') as company,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as sales
                FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
                WHERE DATE_FORMAT(s.sale_date, '%Y-%m-01') = ?
    GROUP BY c.company`,
                [overall.month]
            );

            // Organize company sales into object with default 0 values
            const companyBreakdown = {
                PRINTHUB: 0,
                NATURAL: 0,
                OUTSIDE: 0
            };

            companySales.forEach(row => {
                const company = row.company || 'PRINTHUB';
                companyBreakdown[company] = parseFloat(row.sales);
            });

            results.push({
                overall,
                operators: operatorPerformance,
                operators_without_targets: operatorsWithoutTargets,
                sales_persons: salesPersonPerformance,
                sales_persons_without_targets: salesPersonsWithoutTargets,
                variance,
                company_sales: companyBreakdown
            });
        }

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Daily sales breakdown (for specific date)
router.get('/sales/daily-breakdown', checkPermission('reports:read'), async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, message: 'Date parameter is required' });
        }

        // Get company-wise sales for the specific date
        const companySales = await query(
            `SELECT
COALESCE(c.company, 'PRINTHUB') as company,
    COALESCE(SUM(CASE WHEN s.status != 'cancelled' THEN s.total_amount ELSE 0 END), 0) as sales,
    COUNT(DISTINCT CASE WHEN s.status != 'cancelled' THEN s.id END) as transaction_count
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE s.sale_date = ?
    GROUP BY c.company`,
            [date]
        );

        // Get total sales for the day
        const [dailyTotal] = await query(
            `SELECT
COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) as total_sales,
    COUNT(DISTINCT CASE WHEN status != 'cancelled' THEN id END) as total_transactions
            FROM sales
            WHERE sale_date = ? `,
            [date]
        );

        // Organize company sales into object
        const companyBreakdown = {
            PRINTHUB: { sales: 0, transactions: 0 },
            NATURAL: { sales: 0, transactions: 0 },
            OUTSIDE: { sales: 0, transactions: 0 }
        };

        companySales.forEach(row => {
            const company = row.company || 'PRINTHUB';
            companyBreakdown[company] = {
                sales: parseFloat(row.sales),
                transactions: parseInt(row.transaction_count)
            };
        });

        res.json({
            success: true,
            data: {
                date: date,
                total_sales: parseFloat(dailyTotal.total_sales),
                total_transactions: parseInt(dailyTotal.total_transactions),
                company_breakdown: companyBreakdown
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Inventory report
router.get('/inventory', checkPermission('reports:read'), async (req, res) => {
    try {
        const inventory = await query(
            `SELECT i.*, c.name as category_name, c.type as category_type,
    CASE WHEN i.current_stock <= i.reorder_level THEN 'Low Stock' 
                  WHEN i.current_stock = 0 THEN 'Out of Stock' 
                  ELSE 'In Stock' END as status_label 
             FROM items i 
             LEFT JOIN categories c ON i.category_id = c.id 
             WHERE i.status = ?
    ORDER BY i.current_stock ASC`,
            ['active']
        );

        res.json({ success: true, data: inventory });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Low stock report (Finished Goods only, Shop location)
router.get('/low-stock', checkPermission('reports:read'), async (req, res) => {
    try {
        const lowStockItems = await query(
            `SELECT
                i.id,
                i.code,
                i.name,
                i.unit_of_measure,
                i.reorder_level,
                c.name as category_name,
                c.type as category_type,
                COALESCE(shop_inv.quantity, 0) as shop_stock,
    CASE 
                    WHEN COALESCE(shop_inv.quantity, 0) = 0 THEN 'Out of Stock'
                    WHEN COALESCE(shop_inv.quantity, 0) <= i.reorder_level THEN 'Low Stock'
                    ELSE 'In Stock'
END as status
             FROM items i
             LEFT JOIN categories c ON i.category_id = c.id
             LEFT JOIN(
    SELECT item_id, quantity
                 FROM inventory inv
                 JOIN locations loc ON inv.location_id = loc.id
                 WHERE loc.name = 'SHOP'
) shop_inv ON i.id = shop_inv.item_id
             WHERE i.status = 'active'
             AND c.type = 'Finished Goods'
             AND COALESCE(shop_inv.quantity, 0) <= i.reorder_level
             AND i.reorder_level > 0
             ORDER BY shop_inv.quantity ASC, i.name ASC`,
            []
        );

        res.json({ success: true, data: lowStockItems });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Current Stock Report (Finished Goods only, Shop location)
router.get('/current-stock', checkPermission('reports:read'), async (req, res) => {
    try {
        const currentStockItems = await query(
            `SELECT
                i.id,
                i.code,
                i.name,
                i.unit_of_measure,
                i.reorder_level,
                c.name as category_name,
                c.type as category_type,
                COALESCE(shop_inv.quantity, 0) as shop_stock,
                COALESCE(batch_value.total_value, 0) as stock_value,
                CASE 
                    WHEN COALESCE(shop_inv.quantity, 0) = 0 THEN 'Out of Stock'
                    WHEN COALESCE(shop_inv.quantity, 0) <= i.reorder_level AND i.reorder_level > 0 THEN 'Low Stock'
                    ELSE 'In Stock'
                END as status
             FROM items i
             LEFT JOIN categories c ON i.category_id = c.id
             LEFT JOIN (
                 SELECT item_id, quantity
                 FROM inventory inv
                 JOIN locations loc ON inv.location_id = loc.id
                 WHERE loc.name = 'SHOP'
             ) shop_inv ON i.id = shop_inv.item_id
             LEFT JOIN (
                 SELECT 
                     item_id, 
                     SUM(current_quantity * cost_per_unit) as total_value
                 FROM inventory_batches
                 WHERE current_quantity > 0
                 GROUP BY item_id
             ) batch_value ON i.id = batch_value.item_id
             WHERE i.status = 'active'
             AND c.type = 'Finished Goods'
             ORDER BY i.code ASC`,
            []
        );

        res.json({ success: true, data: currentStockItems });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Invoice reports - get invoices with products
router.get('/invoices', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        // Get all invoices in the date range
        const invoices = await query(
            `SELECT 
                s.id,
                s.invoice_number,
                s.sale_date,
                s.total_amount,
                s.discount_amount,
                s.tax_amount,
                s.status,
                u.username as cashier_name
            FROM sales s
            LEFT JOIN users u ON s.cashier_id = u.id
            WHERE s.sale_date BETWEEN ? AND ?
            ORDER BY s.sale_date DESC, s.id DESC`,
            [start_date, end_date]
        );

        // For each invoice, get its products and payment methods
        for (let invoice of invoices) {
            const products = await query(
                `SELECT 
                    si.id,
                    si.item_id,
                    i.name as item_name,
                    i.code as item_code,
                    si.quantity,
                    si.unit_price,
                    si.discount_amount,
                    si.total_price
                FROM sale_items si
                LEFT JOIN items i ON si.item_id = i.id
                WHERE si.sale_id = ?
                ORDER BY si.id`,
                [invoice.id]
            );

            // Get payment methods for this invoice
            const payments = await query(
                `SELECT DISTINCT payment_method
                FROM sale_payments
                WHERE sale_id = ?
                ORDER BY payment_method`,
                [invoice.id]
            );

            invoice.products = products;
            // Convert payment methods array to comma-separated string
            invoice.payment_methods = payments.map(p => p.payment_method).join(',');
        }

        res.json({ success: true, data: invoices });
    } catch (error) {
        console.error('Error fetching invoice reports:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Invoice reports - export to Excel
router.get('/invoices/export', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        // Import ExcelJS dynamically
        const ExcelJS = (await import('exceljs')).default;

        // Get all invoices in the date range
        const invoices = await query(
            `SELECT 
                s.id,
                s.invoice_number,
                s.sale_date,
                s.total_amount,
                s.discount_amount,
                s.tax_amount,
                s.status,
                u.username as cashier_name
            FROM sales s
            LEFT JOIN users u ON s.cashier_id = u.id
            WHERE s.sale_date BETWEEN ? AND ?
            ORDER BY s.sale_date DESC, s.id DESC`,
            [start_date, end_date]
        );

        // Create a new workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoices');

        // Define columns
        worksheet.columns = [
            { header: 'Invoice Number', key: 'invoice_number', width: 15 },
            { header: 'Sale Date', key: 'sale_date', width: 12 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Total', key: 'total_amount', width: 12 },
            { header: 'Discounts', key: 'discounts', width: 12 },
            { header: 'Cashier', key: 'cashier', width: 15 },
            { header: 'Payment Methods', key: 'payment_methods', width: 18 },
            { header: 'Product Name', key: 'product_name', width: 30 },
            { header: 'Quantity', key: 'quantity', width: 10 },
            { header: 'Unit Price', key: 'unit_price', width: 12 },
            { header: 'Product Discount', key: 'product_discount', width: 15 },
            { header: 'Product Total', key: 'product_total', width: 12 }
        ];

        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' }
        };

        // Add data rows
        for (let invoice of invoices) {
            // Get products for this invoice
            const products = await query(
                `SELECT 
                    si.id,
                    si.item_id,
                    i.name as item_name,
                    i.code as item_code,
                    si.quantity,
                    si.unit_price,
                    si.discount_amount,
                    si.total_price
                FROM sale_items si
                LEFT JOIN items i ON si.item_id = i.id
                WHERE si.sale_id = ?
                ORDER BY si.id`,
                [invoice.id]
            );

            // Get payment methods for this invoice
            const payments = await query(
                `SELECT DISTINCT payment_method
                FROM sale_payments
                WHERE sale_id = ?
                ORDER BY payment_method`,
                [invoice.id]
            );
            const paymentMethods = payments.map(p => p.payment_method).join(',');

            // If invoice has products, add a row for each product
            if (products && products.length > 0) {
                let isFirstProduct = true;
                for (let product of products) {
                    worksheet.addRow({
                        invoice_number: isFirstProduct ? invoice.invoice_number : '',
                        sale_date: isFirstProduct ? new Date(invoice.sale_date).toLocaleDateString('en-US') : '',
                        status: isFirstProduct ? (invoice.status || 'Paid') : '',
                        total_amount: isFirstProduct ? parseFloat(invoice.total_amount) : null,
                        discounts: isFirstProduct ? parseFloat(invoice.discount_amount) : null,
                        cashier: isFirstProduct ? invoice.cashier_name : '',
                        payment_methods: isFirstProduct ? paymentMethods : '',
                        product_name: product.item_name || 'N/A',
                        quantity: product.quantity,
                        unit_price: parseFloat(product.unit_price),
                        product_discount: parseFloat(product.discount_amount || 0),
                        product_total: parseFloat(product.total_price)
                    });
                    isFirstProduct = false;
                }
            } else {
                // If no products, add a single row for the invoice
                worksheet.addRow({
                    invoice_number: invoice.invoice_number,
                    sale_date: new Date(invoice.sale_date).toLocaleDateString('en-US'),
                    status: invoice.status || 'Paid',
                    total_amount: parseFloat(invoice.total_amount),
                    discounts: parseFloat(invoice.discount_amount),
                    cashier: invoice.cashier_name,
                    payment_methods: paymentMethods,
                    product_name: 'No products',
                    quantity: 0,
                    unit_price: 0,
                    product_discount: 0,
                    product_total: 0
                });
            }
        }

        // Format number columns
        worksheet.getColumn('total_amount').numFmt = '#,##0.00';
        worksheet.getColumn('discounts').numFmt = '#,##0.00';
        worksheet.getColumn('unit_price').numFmt = '#,##0.00';
        worksheet.getColumn('product_discount').numFmt = '#,##0.00';
        worksheet.getColumn('product_total').numFmt = '#,##0.00';

        // Set response headers for file download
        const filename = `invoices_${start_date}_to_${end_date}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Write to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting invoices to Excel:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Profit & Loss Report
router.get('/profit-loss', checkPermission('reports:read'), async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        // 1. Overall Summary
        const [summary] = await query(
            `SELECT 
                COALESCE(SUM(si.total_price), 0) as total_revenue,
                COALESCE(SUM(si.cost_price * si.quantity), 0) as total_cogs,
                COALESCE(SUM(si.total_price - (si.cost_price * si.quantity)), 0) as gross_profit,
                (SELECT COALESCE(SUM(discount_amount), 0) FROM sales WHERE sale_date BETWEEN ? AND ? AND status != 'cancelled') as sale_level_discounts,
                (SELECT COALESCE(SUM(tax_amount), 0) FROM sales WHERE sale_date BETWEEN ? AND ? AND status != 'cancelled') as total_tax
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND s.status != 'cancelled'`,
            [start_date, end_date, start_date, end_date, start_date, end_date]
        );

        // Get monthly costs total (excluding voided)
        const [monthlyCosts] = await query(
            `SELECT COALESCE(SUM(amount), 0) as total_monthly_costs 
             FROM monthly_costs 
             WHERE created_at BETWEEN ? AND ?
             AND (is_voided = 0 OR is_voided IS NULL)`,
            [start_date, end_date]
        );
        summary.total_monthly_costs = parseFloat(monthlyCosts.total_monthly_costs);
        summary.sale_level_discounts = parseFloat(summary.sale_level_discounts || 0);
        summary.total_tax = parseFloat(summary.total_tax || 0);
        summary.revenue_net_of_tax = parseFloat(summary.total_revenue || 0) - summary.total_tax;

        // Get individual monthly costs with categories (excluding voided)
        const individualMonthlyCosts = await query(
            `SELECT mc.name, mc.amount, COALESCE(mcc.name, mc.category, 'General Overhead') as category_name
             FROM monthly_costs mc
             LEFT JOIN monthly_cost_categories mcc ON mc.category_id = mcc.id
             WHERE mc.created_at BETWEEN ? AND ?
             AND (mc.is_voided = 0 OR mc.is_voided IS NULL)
             ORDER BY mc.created_at DESC`,
            [start_date, end_date]
        );
        summary.individual_monthly_costs = individualMonthlyCosts;

        // Get monthly costs by category breakdown (excluding voided)
        const monthlyCostCategories = await query(
            `SELECT COALESCE(mcc.name, mc.category, 'General Overhead') as category_name, SUM(mc.amount) as amount
             FROM monthly_costs mc
             LEFT JOIN monthly_cost_categories mcc ON mc.category_id = mcc.id
             WHERE mc.created_at BETWEEN ? AND ?
             AND (mc.is_voided = 0 OR mc.is_voided IS NULL)
             GROUP BY category_name
             ORDER BY amount DESC`,
            [start_date, end_date]
        );
        summary.monthly_cost_categories = monthlyCostCategories;

        // Get petty cash disbursements summary
        const [pettyCashSummary] = await query(
            `SELECT COALESCE(SUM(amount), 0) as total_petty_cash_costs
             FROM petty_cash_transactions
             WHERE transaction_date BETWEEN ? AND ?
             AND type = 'disbursement'
             AND is_voided = FALSE`,
            [start_date, end_date]
        );
        summary.total_petty_cash_costs = parseFloat(pettyCashSummary.total_petty_cash_costs);

        // Get petty cash costs by category
        const pettyCashCategories = await query(
            `SELECT COALESCE(category, 'Other') as category_name, SUM(amount) as amount
             FROM petty_cash_transactions
             WHERE transaction_date BETWEEN ? AND ?
             AND type = 'disbursement'
             AND is_voided = FALSE
             GROUP BY category_name
             ORDER BY amount DESC`,
            [start_date, end_date]
        );
        summary.petty_cash_categories = pettyCashCategories;

        // Calculate Net Profit (Gross Profit - Sale Level Discounts - Monthly Costs - Petty Cash Costs)
        summary.net_profit = parseFloat(summary.gross_profit) - summary.sale_level_discounts - summary.total_tax - summary.total_monthly_costs - summary.total_petty_cash_costs;
        summary.profit_margin = summary.total_revenue > 0
             ? ((summary.net_profit / summary.total_revenue) * 100).toFixed(2)
             : 0;

        // 2. Daily Breakdown with Petty Cash included
        const daily = await query(
            `SELECT 
                DATE_FORMAT(s.sale_date, '%Y-%m-%d') as date,
                COALESCE(SUM(si.total_price), 0) as revenue,
                COALESCE(SUM(si.cost_price * si.quantity), 0) as cogs,
                COALESCE(SUM(si.total_price - (si.cost_price * si.quantity)), 0) as gross_profit,
                COALESCE(pct.expenses, 0) as petty_cash_expenses
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN (
                SELECT 
                    transaction_date, 
                    SUM(amount) as expenses
                FROM petty_cash_transactions
                WHERE type = 'disbursement' AND is_voided = FALSE
                GROUP BY transaction_date
            ) pct ON pct.transaction_date = DATE(s.sale_date)
            WHERE s.sale_date BETWEEN ? AND ?
            AND s.status != 'cancelled'
            GROUP BY DATE_FORMAT(s.sale_date, '%Y-%m-%d'), pct.expenses
            ORDER BY DATE_FORMAT(s.sale_date, '%Y-%m-%d') ASC`,
            [start_date, end_date]
        );

        // 3. Category Breakdown
        const categories = await query(
            `SELECT 
                c.name as category_name,
                COALESCE(SUM(si.total_price), 0) as revenue,
                COALESCE(SUM(si.cost_price * si.quantity), 0) as cogs,
                COALESCE(SUM(si.total_price - (si.cost_price * si.quantity)), 0) as profit
            FROM sale_items si
            JOIN items i ON si.item_id = i.id
            JOIN categories c ON i.category_id = c.id
            JOIN sales s ON si.sale_id = s.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND s.status != 'cancelled'
            GROUP BY c.id, c.name
            ORDER BY profit DESC`,
            [start_date, end_date]
        );

        // 4. Sales Person Breakdown
        const salesPersons = await query(
            `SELECT 
                sp.name as sales_person_name,
                COALESCE(SUM(si.total_price), 0) as revenue,
                COALESCE(SUM(si.cost_price * si.quantity), 0) as cogs,
                COALESCE(SUM(si.total_price - (si.cost_price * si.quantity)), 0) as profit
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            JOIN sales_persons sp ON s.sales_person_id = sp.id
            WHERE s.sale_date BETWEEN ? AND ?
            AND s.status != 'cancelled'
            GROUP BY sp.id, sp.name
            ORDER BY profit DESC`,
            [start_date, end_date]
        );

        res.json({
            success: true,
            data: {
                summary,
                daily,
                categories,
                salesPersons
            }
        });
    } catch (error) {
        console.error('Error fetching P&L report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;

