/**
 * Notification Controller
 * Manages fetching alerts for POs, GRNs, and Quotations based on user role
 */

import { query } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Get pending alerts based on user role
 */
export async function getNotifications(req, res) {
    try {
        const { userId, role } = req.user;
        let alerts = [];

        console.log(`[Notifications] DEBUG: User ${userId}, Role: "${role}"`);

        // Case-sensitive role check (trimmed)
        const userRole = role?.trim();

        if (userRole === 'Admin') {
            // Admin: Things yet to approve (Draft POs, Pending GRNs, Pending Quotations)
            // Using LOWER() for status to be immune to casing differences in ENUMs across tables
            const poResult = await query('SELECT COUNT(*) as count FROM purchase_orders WHERE LOWER(status) = "draft"');
            const grnResult = await query('SELECT COUNT(*) as count FROM grn WHERE LOWER(status) = "pending"');
            const quoteResult = await query('SELECT COUNT(*) as count FROM quotations WHERE LOWER(status) = "pending"');

            const poCount = poResult[0]?.count || 0;
            const grnCount = grnResult[0]?.count || 0;
            const quoteCount = quoteResult[0]?.count || 0;

            // Overdue Invoices: Pending invoices where (sale_date + credit_period) < today
            const overdueResult = await query(`
                SELECT COUNT(*) as count 
                FROM sales s 
                JOIN customers c ON s.customer_id = c.id 
                WHERE s.status = 'pending' 
                  AND DATE_ADD(DATE(s.sale_date), INTERVAL IFNULL(c.credit_period, 30) DAY) < CURDATE()
            `);
            const overdueCount = overdueResult[0]?.count || 0;

            console.log(`[Notifications] DEBUG Admin: PO_Draft(${poCount}), GRN_Pending(${grnCount}), Quote_Pending(${quoteCount}), Overdue_Invoices(${overdueCount})`);

            if (poCount > 0) alerts.push({ type: 'po', message: `${poCount} POs waiting for approval`, count: poCount, link: '#/purchase-orders' });
            if (grnCount > 0) alerts.push({ type: 'grn', message: `${grnCount} GRNs waiting for approval`, count: grnCount, link: '#/grn' });
            if (quoteCount > 0) alerts.push({ type: 'quotation', message: `${quoteCount} Quotations waiting for approval`, count: quoteCount, link: '#/quotations' });
            if (overdueCount > 0) alerts.push({ type: 'overdue', message: `${overdueCount} Invoices are overdue`, count: overdueCount, link: '#/invoices?status=pending' });

        } else if (userRole === 'Coordinator') {
            // Coordinator: Approved in last 24 hours
            const poResult = await query('SELECT COUNT(*) as count FROM purchase_orders WHERE LOWER(status) = "approved" AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
            const grnResult = await query('SELECT COUNT(*) as count FROM grn WHERE LOWER(status) = "approved" AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
            const quoteResult = await query('SELECT COUNT(*) as count FROM quotations WHERE LOWER(status) = "approved" AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');

            const poCount = poResult[0]?.count || 0;
            const grnCount = grnResult[0]?.count || 0;
            const quoteCount = quoteResult[0]?.count || 0;

            console.log(`[Notifications] DEBUG Coordinator: PO_Approved(${poCount}), GRN_Approved(${grnCount}), Quote_Approved(${quoteCount})`);

            if (poCount > 0) alerts.push({ type: 'po', message: `${poCount} POs recently approved`, count: poCount, link: '#/purchase-orders' });
            if (grnCount > 0) alerts.push({ type: 'grn', message: `${grnCount} GRNs recently approved`, count: grnCount, link: '#/grn' });
            if (quoteCount > 0) alerts.push({ type: 'quotation', message: `${quoteCount} Quotations recently approved`, count: quoteCount, link: '#/quotations' });

        } else if (userRole === 'Cashier') {
            // Cashier: Quotations approved in last 24 hours
            const quoteResult = await query('SELECT COUNT(*) as count FROM quotations WHERE LOWER(status) = "approved" AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
            const quoteCount = quoteResult[0]?.count || 0;

            console.log(`[Notifications] DEBUG Cashier: Quote_Approved(${quoteCount})`);

            if (quoteCount > 0) alerts.push({ type: 'quotation', message: `${quoteCount} Quotations recently approved`, count: quoteCount, link: '#/quotations' });
        }

        console.log(`[Notifications] DEBUG: Total unique alert types found: ${alerts.length}`);

        res.json({
            success: true,
            data: {
                alerts,
                totalCount: alerts.length
            }
        });
    } catch (error) {
        logger.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
}
