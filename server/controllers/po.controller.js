/**
 * Purchase Order Controller
 * Handles all PO operations including creation, approval, and receiving
 */

import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';
import { parse } from 'csv-parse/sync';


/**
 * Get all purchase orders with details
 */
export const getAllPOs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const { status, payment_view, payment_status, search } = req.query;
        const offset = (page - 1) * limit;

        let conditions = [];
        const queryParams = [];

        if (status) {
            conditions.push('po.status = ?');
            queryParams.push(status);
        } else if (payment_view === 'true') {
            conditions.push("po.status IN ('Approved', 'Received')");
        }

        if (payment_status) {
            conditions.push('po.payment_status = ?');
            queryParams.push(payment_status);
        }

        if (search) {
            conditions.push('(po.po_number LIKE ? OR s.name LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        let whereClause = '';
        if (conditions.length > 0) {
            // If search is present, we must join suppliers table in count query
            whereClause = ' WHERE ' + conditions.join(' AND ');
        }

        // Get total count
        const countSql = `
            SELECT COUNT(*) as total 
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            ${whereClause}
        `;
        const countResult = await query(countSql, queryParams);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated data
        let sql = `
            SELECT 
                po.*,
                s.name as supplier_name,
                s.phone as supplier_phone,
                u.username as created_by_name,
                (SELECT COUNT(*) FROM po_items WHERE po_id = po.id) as item_count,
                (SELECT COUNT(*) > 0 FROM grn WHERE po_id = po.id) as has_grn
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON po.created_by = u.id
            ${whereClause}
            ORDER BY po.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        // params.push(limit, offset); // LIMIT/OFFSET interpolated directly to avoid mysqld_stmt_execute errors
        const pos = await query(sql, queryParams);

        res.json({
            success: true,
            data: pos,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        });
    } catch (error) {
        logger.error('Get POs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get single PO with items
 */
export const getPOById = async (req, res) => {
    try {
        const { id } = req.params;

        const [po] = await query(
            `SELECT po.*, s.name as supplier_name, s.phone as supplier_phone, 
                    u.username as created_by_name
             FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN users u ON po.created_by = u.id
             WHERE po.id = ?`,
            [id]
        );

        if (!po) {
            return res.status(404).json({ success: false, message: 'PO not found' });
        }

        const items = await query(
            `SELECT pi.*, i.name as item_name, i.code as item_code, i.barcode, 
                    i.unit_of_measure, c.name as category_name
             FROM po_items pi
             LEFT JOIN items i ON pi.item_id = i.id
             LEFT JOIN categories c ON i.category_id = c.id
             WHERE pi.po_id = ?`,
            [id]
        );

        const payments = await query(
            `SELECT p.*, u.username as created_by_name, u2.username as cancelled_by_name
             FROM po_payments p
             LEFT JOIN users u ON p.created_by = u.id
             LEFT JOIN users u2 ON p.cancelled_by = u2.id
             WHERE p.po_id = ?
             ORDER BY p.paid_date DESC, p.created_at DESC, p.id DESC`,
            [id]
        );

        po.items = items;
        po.payments = payments;
        res.json({ success: true, data: po });
    } catch (error) {
        logger.error('Get PO by ID error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Create new purchase order
 */
export const createPO = async (req, res) => {
    try {
        const { supplier_id, order_date, expected_delivery, items, notes, tax_percentage } = req.body;

        const result = await transaction(async (conn) => {
            // Generate PO number
            const year = new Date().getFullYear();
            const [lastPO] = await conn.execute(
                `SELECT po_number FROM purchase_orders 
                 WHERE po_number LIKE ? 
                 ORDER BY id DESC LIMIT 1`,
                [`PO-${year}-%`]
            );

            let nextNumber = 1;
            if (lastPO && lastPO.length > 0 && lastPO[0].po_number) {
                const lastNumber = parseInt(lastPO[0].po_number.split('-')[2]);
                nextNumber = lastNumber + 1;
            }

            const po_number = `PO-${year}-${String(nextNumber).padStart(4, '0')}`;

            // Calculate totals with item-level tax support
            let subtotal = 0;
            let accumulatedTax = 0;
            const processedItems = [];

            for (const item of items) {
                const qty = parseFloat(item.quantity) || 0;
                const taxRate = parseFloat(item.tax_rate) || 0;
                let unitPriceExcl = parseFloat(item.unit_price_excl_tax || item.unit_price) || 0;
                let unitPriceIncl = parseFloat(item.unit_price_incl_tax) || 0;

                if (!unitPriceIncl && unitPriceExcl) {
                    unitPriceIncl = unitPriceExcl * (1 + taxRate / 100);
                } else if (!unitPriceExcl && unitPriceIncl) {
                    unitPriceExcl = taxRate > 0 ? (unitPriceIncl / (1 + taxRate / 100)) : unitPriceIncl;
                }

                const lineExcl = qty * unitPriceExcl;
                const lineTax = lineExcl * (taxRate / 100);
                const lineIncl = qty * unitPriceIncl;

                subtotal += lineExcl;
                accumulatedTax += lineTax;

                processedItems.push({
                    item_id: item.item_id,
                    quantity: qty,
                    unit_price: unitPriceExcl,
                    unit_price_excl_tax: unitPriceExcl,
                    tax_rate: taxRate,
                    tax_amount: lineTax,
                    unit_price_incl_tax: unitPriceIncl,
                    total_price_excl_tax: lineExcl,
                    total_price_incl_tax: lineIncl,
                    total_price: lineIncl
                });
            }

            // Total PO Tax = Accumulated sum of all line item taxes
            const tax_amount = accumulatedTax;
            const total_amount = subtotal + tax_amount;

            // Get supplier's payment terms to calculate due date
            const [supplierRows] = await conn.execute(
                'SELECT payment_terms FROM suppliers WHERE id = ?',
                [supplier_id]
            );

            let due_date = null;
            if (supplierRows && supplierRows.length > 0 && supplierRows[0].payment_terms) {
                const terms = supplierRows[0].payment_terms;
                const match = terms.match(/\d+/);
                if (match) {
                    const days = parseInt(match[0]);
                    const calculatedDate = new Date(order_date);
                    calculatedDate.setDate(calculatedDate.getDate() + days);
                    due_date = calculatedDate.toISOString().split('T')[0];
                } else {
                    due_date = order_date;
                }
            } else {
                due_date = order_date;
            }

            // Insert PO with generated po_number, tax info, and due_date
            const [poResult] = await conn.execute(
                `INSERT INTO purchase_orders 
                 (po_number, supplier_id, order_date, expected_delivery, due_date, status, subtotal, tax_amount, total_amount, notes, created_by) 
                 VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?)`,
                [po_number, supplier_id, order_date, expected_delivery, due_date, subtotal, tax_amount, total_amount, notes, req.user.userId]
            );

            const po_id = poResult.insertId;

            // Insert PO items with tax breakdown
            for (const item of processedItems) {
                await conn.execute(
                    `INSERT INTO po_items 
                     (po_id, item_id, quantity, unit_price, unit_price_excl_tax, tax_rate, tax_amount, unit_price_incl_tax, total_price_excl_tax, total_price_incl_tax, total_price) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        po_id, item.item_id, item.quantity, item.unit_price_excl_tax,
                        item.unit_price_excl_tax, item.tax_rate, item.tax_amount, item.unit_price_incl_tax,
                        item.total_price_excl_tax, item.total_price_incl_tax, item.total_price_incl_tax
                    ]
                );
            }

            return { po_id, po_number, total_amount, tax_percentage };
        });

        // Audit log
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id) VALUES (?, ?, ?, ?)',
            [req.user.userId, 'PO_CREATED', 'purchase_orders', result.po_id]
        );

        logger.info(`PO created: ${result.po_number} by user ${req.user.userId}`);
        res.status(201).json({ success: true, message: 'Purchase order created', data: result });
    } catch (error) {
        logger.error('Create PO error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update PO status (approve, cancel, etc.)
 */
export const updatePOStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['Draft', 'Pending', 'Approved', 'Received', 'Cancelled', 'Rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Only Admin can approve
        if (status === 'Approved' && req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Permission denied. Only Admins can approve Purchase Orders.'
            });
        }

        // Check if PO has any GRNs
        const [grnCount] = await query('SELECT COUNT(*) as count FROM grn WHERE po_id = ?', [id]);
        if (grnCount.count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change status of PO with existing GRNs'
            });
        }

        await query(
            'UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, id]
        );

        // Audit log
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
            [req.user.userId, 'PO_STATUS_UPDATED', 'purchase_orders', id, JSON.stringify({ status })]
        );

        logger.info(`PO ${id} status updated to ${status} by user ${req.user.userId}`);
        res.json({ success: true, message: `PO ${status.toLowerCase()}` });
    } catch (error) {
        logger.error('Update PO status error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all payments for a specific Purchase Order
 */
/**
 * Get all payments for a specific Purchase Order
 */
export const getPOPayments = async (req, res) => {
    try {
        const { id } = req.params;

        const payments = await query(
            `SELECT p.*, u.username as created_by_name, u2.username as cancelled_by_name
             FROM po_payments p
             LEFT JOIN users u ON p.created_by = u.id
             LEFT JOIN users u2 ON p.cancelled_by = u2.id
             WHERE p.po_id = ?
             ORDER BY p.paid_date DESC, p.created_at DESC, p.id DESC`,
            [id]
        );

        res.json({ success: true, data: payments });
    } catch (error) {
        logger.error('Get PO payments error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Record a new payment for a Purchase Order
 */
export const addPOPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, payment_method, reference_number, notes, paid_date } = req.body;

        const result = await transaction(async (conn) => {
            // 1. Fetch current PO details and lock row for update
            const [poRows] = await conn.execute(
                `SELECT total_amount, paid_amount, status, supplier_id 
                 FROM purchase_orders 
                 WHERE id = ? FOR UPDATE`,
                [id]
            );

            if (poRows.length === 0) {
                throw new Error('Purchase Order not found');
            }

            const po = poRows[0];

            // 2. Validate PO status
            if (po.status !== 'Approved' && po.status !== 'Received') {
                throw new Error('Payments can only be recorded for Approved or Received purchase orders');
            }

            // 3. Validate overpayment
            const totalAmount = parseFloat(po.total_amount);
            const currentPaid = parseFloat(po.paid_amount);
            const outstanding = totalAmount - currentPaid;
            const newPaymentAmount = parseFloat(amount);

            if (newPaymentAmount > outstanding + 0.01) {
                throw new Error(`Payment amount (Rs ${newPaymentAmount.toFixed(2)}) exceeds outstanding balance (Rs ${outstanding.toFixed(2)})`);
            }

            // 4. Insert payment record
            const paymentDate = paid_date ? new Date(paid_date) : new Date();
            const [paymentResult] = await conn.execute(
                `INSERT INTO po_payments 
                 (po_id, supplier_id, payment_method, amount, reference_number, notes, paid_date, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, po.supplier_id, payment_method, newPaymentAmount, reference_number || null, notes || null, paymentDate, req.user.userId]
            );

            // 5. Recalculate total paid amount (excluding cancelled payments)
            const [sumRows] = await conn.execute(
                'SELECT COALESCE(SUM(amount), 0) as total_paid FROM po_payments WHERE po_id = ? AND (is_cancelled = 0 OR is_cancelled IS NULL)',
                [id]
            );
            const finalPaidAmount = parseFloat(sumRows[0].total_paid);

            // 6. Determine new payment status
            let newPaymentStatus = 'unpaid';
            if (finalPaidAmount >= totalAmount - 0.01) {
                newPaymentStatus = 'paid';
            } else if (finalPaidAmount > 0) {
                newPaymentStatus = 'partial';
            }

            // 7. Update PO with new totals and status
            await conn.execute(
                `UPDATE purchase_orders 
                 SET paid_amount = ?, payment_status = ?, updated_at = NOW() 
                 WHERE id = ?`,
                [finalPaidAmount, newPaymentStatus, id]
            );

            return {
                payment_id: paymentResult.insertId,
                paid_amount: finalPaidAmount,
                payment_status: newPaymentStatus,
                outstanding: Math.max(0, totalAmount - finalPaidAmount)
            };
        });

        // 8. Log Audit Action
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
            [
                req.user.userId,
                'PO_PAYMENT_RECORDED',
                'purchase_orders',
                id,
                JSON.stringify({ amount, payment_method, reference_number })
            ]
        );

        logger.info(`PO Payment of Rs ${amount} recorded for PO ${id} by user ${req.user.userId}`);
        res.status(201).json({
            success: true,
            message: 'Payment recorded successfully',
            data: result
        });

    } catch (error) {
        logger.error('Record PO payment error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

/**
 * Cancel/Void a Purchase Order payment record (Requires Admin Password)
 */
export const cancelPOPayment = async (req, res) => {
    try {
        const { id, paymentId } = req.params;
        const { password, reason } = req.body;

        if (!password) {
            return res.status(400).json({ success: false, message: 'Admin password is required to cancel a PO payment' });
        }

        // 1. Validate Admin / Void Password
        let voidAdminPassword = null;
        try {
            const settings = await query(
                'SELECT setting_value FROM system_settings WHERE setting_key = ?',
                ['void_admin_password']
            );
            if (settings && settings.length > 0) {
                voidAdminPassword = settings[0].setting_value;
            }
        } catch (dbErr) {
            logger.warn('Could not fetch void password from database:', dbErr.message);
        }

        if (!voidAdminPassword) {
            voidAdminPassword = process.env.VOID_ADMIN_PASSWORD || 'Admin123';
        }

        if (password !== voidAdminPassword) {
            return res.status(401).json({ success: false, message: 'Invalid admin password' });
        }

        // 2. Perform cancellation inside a transaction
        const result = await transaction(async (conn) => {
            // Lock PO for update
            const [poRows] = await conn.execute(
                `SELECT id, total_amount, paid_amount FROM purchase_orders WHERE id = ? FOR UPDATE`,
                [id]
            );

            if (poRows.length === 0) {
                throw new Error('Purchase Order not found');
            }
            const po = poRows[0];

            // Lock payment record for update
            const [pmtRows] = await conn.execute(
                `SELECT id, po_id, amount, is_cancelled FROM po_payments WHERE id = ? AND po_id = ? FOR UPDATE`,
                [paymentId, id]
            );

            if (pmtRows.length === 0) {
                throw new Error('Payment record not found for this Purchase Order');
            }

            const pmt = pmtRows[0];
            if (pmt.is_cancelled) {
                throw new Error('This payment record has already been cancelled');
            }

            // Mark payment as cancelled
            await conn.execute(
                `UPDATE po_payments 
                 SET is_cancelled = 1, cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ? 
                 WHERE id = ?`,
                [req.user.userId, reason || 'Payment cancelled by admin', paymentId]
            );

            // Recalculate total paid amount for active payments
            const [sumRows] = await conn.execute(
                `SELECT COALESCE(SUM(amount), 0) as total_paid 
                 FROM po_payments 
                 WHERE po_id = ? AND (is_cancelled = 0 OR is_cancelled IS NULL)`,
                [id]
            );

            const finalPaidAmount = parseFloat(sumRows[0].total_paid);
            const totalAmount = parseFloat(po.total_amount);

            let newPaymentStatus = 'unpaid';
            if (finalPaidAmount >= totalAmount - 0.01) {
                newPaymentStatus = 'paid';
            } else if (finalPaidAmount > 0) {
                newPaymentStatus = 'partial';
            }

            // Update PO paid_amount and payment_status
            await conn.execute(
                `UPDATE purchase_orders 
                 SET paid_amount = ?, payment_status = ?, updated_at = NOW() 
                 WHERE id = ?`,
                [finalPaidAmount, newPaymentStatus, id]
            );

            return {
                payment_id: paymentId,
                paid_amount: finalPaidAmount,
                payment_status: newPaymentStatus,
                outstanding: Math.max(0, totalAmount - finalPaidAmount)
            };
        });

        // 3. Log Audit Action
        await query(
            'INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values) VALUES (?, ?, ?, ?, ?)',
            [
                req.user.userId,
                'PO_PAYMENT_CANCELLED',
                'po_payments',
                paymentId,
                JSON.stringify({ po_id: id, reason })
            ]
        );

        logger.info(`PO Payment ${paymentId} for PO ${id} cancelled by user ${req.user.userId}`);
        res.json({
            success: true,
            message: 'Payment cancelled successfully',
            data: result
        });
    } catch (error) {
        logger.error('Cancel PO payment error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};


/**
 * Bulk Create POs via CSV Upload
 */
export const bulkCreatePOs = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded' });
        }

        const csvString = req.file.buffer.toString('utf8');
        let records = [];
        try {
            records = parse(csvString, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true
            });
        } catch (err) {
            return res.status(400).json({ success: false, message: `Invalid CSV format: ${err.message}` });
        }

        if (records.length === 0) {
            return res.status(400).json({ success: false, message: 'CSV file is empty' });
        }

        // Check if user uploaded an Item Creation CSV by mistake instead of a PO CSV
        const sampleKeys = Object.keys(records[0]).map(k => k.replace(/^\uFEFF/, '').trim().toLowerCase());
        const isItemCreationFile = sampleKeys.includes('category_name') && !sampleKeys.includes('quantity') && !sampleKeys.includes('qty');
        if (isItemCreationFile) {
            return res.status(400).json({
                success: false,
                message: 'It looks like you uploaded an Item Catalog CSV file (items_bulk_upload_sithuruya.csv) instead of a Purchase Order CSV file. Please upload a Purchase Order CSV file (such as po_bulk_upload_sithuruya.csv) which includes the quantity column.'
            });
        }

        // Fetch suppliers lookup
        const suppliersList = await query('SELECT id, name FROM suppliers');
        const supplierMap = new Map();
        suppliersList.forEach(s => supplierMap.set(s.name.trim().toLowerCase(), s.id));

        // Fetch items lookup
        const itemsList = await query('SELECT id, code, name, selling_price_excl_tax, tax_rate FROM items WHERE status = "active"');
        const itemNameMap = new Map();
        const itemCodeMap = new Map();
        const itemCleanMap = new Map();

        function normalizeItemName(nameStr) {
            if (!nameStr) return '';
            return String(nameStr)
                .replace(/^"|"$/g, '')
                .replace(/[\"']/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        itemsList.forEach(item => {
            if (item.name) {
                itemNameMap.set(item.name.trim().toLowerCase(), item);
                itemCleanMap.set(normalizeItemName(item.name), item);
            }
            if (item.code) {
                itemCodeMap.set(item.code.trim().toLowerCase(), item);
            }
        });

        // Helper function to extract quantity value from row with flexible header naming
        function getRowQty(r) {
            const keys = Object.keys(r);
            for (const key of keys) {
                const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase();
                if (cleanKey === 'quantity' || cleanKey === 'qty' || cleanKey === 'count' || cleanKey.includes('qty') || cleanKey.includes('quantity')) {
                    const val = r[key];
                    if (val !== undefined && val !== null) {
                        const qVal = parseFloat(String(val).replace(/[^0-9.]/g, '').trim());
                        if (!isNaN(qVal) && qVal > 0) return qVal;
                    }
                }
            }
            return 0;
        }

        // Filter rows that have a valid positive quantity entered
        const rowsWithQty = records.filter(r => getRowQty(r) > 0);

        if (rowsWithQty.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No items with quantity entered. Please ensure the uploaded CSV file contains a quantity column with values > 0.' 
            });
        }

        // Group rows by po_ref (or fallback to supplier_name)
        const poGroups = new Map();
        rowsWithQty.forEach((row, idx) => {
            let poRef = row.po_ref ? row.po_ref.trim() : '';
            if (!poRef) {
                const supp = row.supplier_name ? row.supplier_name.trim() : 'DEFAULT';
                poRef = `PO-${supp.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
            }
            if (!poGroups.has(poRef)) {
                poGroups.set(poRef, []);
            }
            poGroups.get(poRef).push({ ...row, csvLine: idx + 2 });
        });

        const results = [];
        let createdCount = 0;
        let failedCount = 0;

        const year = new Date().getFullYear();

/**
 * Helper to normalize date strings (handles YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY) into YYYY-MM-DD
 */
function normalizeDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return new Date().toISOString().split('T')[0];
    }

    const trimmed = dateStr.trim();
    if (!trimmed) {
        return new Date().toISOString().split('T')[0];
    }

    // Match YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }

    // Match DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
        let p1 = parseInt(dmyMatch[1], 10);
        let p2 = parseInt(dmyMatch[2], 10);
        let year = parseInt(dmyMatch[3], 10);

        let day = p1;
        let month = p2;

        if (p1 <= 12 && p2 > 12) {
            month = p1;
            day = p2;
        }

        const formattedDay = String(day).padStart(2, '0');
        const formattedMonth = String(month).padStart(2, '0');
        return `${year}-${formattedMonth}-${formattedDay}`;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
}

        for (const [poRef, groupRows] of poGroups.entries()) {
            const firstRow = groupRows[0];
            const supplierName = firstRow.supplier_name ? firstRow.supplier_name.trim() : '';
            const orderDateStr = normalizeDate(firstRow.order_date);
            const expectedDeliveryStr = firstRow.expected_delivery && firstRow.expected_delivery.trim() 
                ? normalizeDate(firstRow.expected_delivery) 
                : null;
            const notes = firstRow.notes ? firstRow.notes.trim() : `Bulk Upload (${poRef})`;


            if (!supplierName || !supplierMap.has(supplierName.toLowerCase())) {
                results.push({
                    po_ref: poRef,
                    status: 'error',
                    reason: `Supplier '${supplierName}' not found or not specified`
                });
                failedCount++;
                continue;
            }

            const supplierId = supplierMap.get(supplierName.toLowerCase());

            // Process line items for this PO
            let groupValid = true;
            let groupError = '';
            const processedItems = [];
            let subtotal = 0;
            let accumulatedTax = 0;

            for (const row of groupRows) {
                const itemName = row.item_name ? row.item_name.trim() : '';
                const itemCode = row.item_code ? row.item_code.trim() : '';
                const qty = getRowQty(row) || parseFloat(row.quantity) || 0;

                if (qty <= 0) {
                    continue; // Skip invalid or zero quantity
                }

                let matchedItem = null;
                // 1. Try item_code match first
                if (itemCode && itemCodeMap.has(itemCode.toLowerCase())) {
                    matchedItem = itemCodeMap.get(itemCode.toLowerCase());
                }

                // 2. Fall back to item_name match if code match fails or item_code is from a different environment
                if (!matchedItem && itemName) {
                    if (itemNameMap.has(itemName.toLowerCase())) {
                        matchedItem = itemNameMap.get(itemName.toLowerCase());
                    } else {
                        const cleanRowName = normalizeItemName(itemName);
                        if (itemCleanMap.has(cleanRowName)) {
                            matchedItem = itemCleanMap.get(cleanRowName);
                        } else {
                            const alphaOnly = cleanRowName.replace(/[^a-z0-9]/g, '');
                            if (alphaOnly) {
                                for (const item of itemsList) {
                                    const itemAlpha = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                                    if (itemAlpha === alphaOnly) {
                                        matchedItem = item;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                const taxRate = row.tax_rate !== undefined && row.tax_rate !== '' ? parseFloat(row.tax_rate) : (matchedItem?.tax_rate || 0);
                const unitPriceExcl = row.unit_price_excl_tax !== undefined && row.unit_price_excl_tax !== '' 
                    ? parseFloat(row.unit_price_excl_tax) 
                    : (matchedItem?.selling_price_excl_tax || 0);
                const unitPriceIncl = unitPriceExcl * (1 + taxRate / 100);

                // Auto-create missing item in catalog on-the-fly if not found in database
                if (!matchedItem && itemName) {
                    const cats = await query('SELECT id FROM categories WHERE status = "active" ORDER BY id ASC LIMIT 1');
                    const defaultCatId = (Array.isArray(cats) && cats.length > 0) ? cats[0].id : 1;

                    // Generate a collision-proof unique item code: ITEM-####
                    const existingCodes = await query('SELECT code FROM items WHERE code LIKE "ITEM-%"');
                    const codeList = Array.isArray(existingCodes) ? existingCodes : [];
                    const codeSet = new Set(codeList.map(c => c.code ? c.code.toUpperCase() : ''));
                    let nextNum = 1;
                    let newCode = `ITEM-${String(nextNum).padStart(4, '0')}`;
                    while (codeSet.has(newCode)) {
                        nextNum++;
                        newCode = `ITEM-${String(nextNum).padStart(4, '0')}`;
                    }

                    const newItemRes = await query(
                        `INSERT INTO items (
                            code, name, description, category_id, unit_of_measure, 
                            selling_price, tax_rate, tax_type, selling_price_excl_tax, selling_price_incl_tax, 
                            reorder_level, status
                        ) VALUES (?, ?, ?, ?, 'Piece', ?, ?, 'exclusive', ?, ?, 5, 'active')`,
                        [
                            newCode, itemName, 'Auto-created during Bulk PO upload', defaultCatId,
                            unitPriceExcl, taxRate, unitPriceExcl, unitPriceIncl
                        ]
                    );

                    matchedItem = {
                        id: newItemRes?.insertId || null,
                        code: newCode,
                        name: itemName,
                        selling_price_excl_tax: unitPriceExcl,
                        tax_rate: taxRate
                    };

                    itemNameMap.set(itemName.toLowerCase(), matchedItem);
                    itemCleanMap.set(normalizeItemName(itemName), matchedItem);
                }

                if (!matchedItem) {
                    groupValid = false;
                    groupError = `Item '${itemName || itemCode}' could not be created or matched in system.`;
                    break;
                }
                const lineExcl = qty * unitPriceExcl;
                const lineTax = lineExcl * (taxRate / 100);
                const lineIncl = qty * unitPriceIncl;

                subtotal += lineExcl;
                accumulatedTax += lineTax;

                processedItems.push({
                    item_id: matchedItem.id,
                    quantity: qty,
                    unit_price: unitPriceExcl,
                    unit_price_excl_tax: unitPriceExcl,
                    tax_rate: taxRate,
                    tax_amount: lineTax,
                    unit_price_incl_tax: unitPriceIncl,
                    total_price_excl_tax: lineExcl,
                    total_price_incl_tax: lineIncl,
                    total_price: lineIncl
                });
            }


            if (!groupValid) {
                results.push({
                    po_ref: poRef,
                    status: 'error',
                    reason: groupError
                });
                failedCount++;
                continue;
            }

            if (processedItems.length === 0) {
                results.push({
                    po_ref: poRef,
                    status: 'error',
                    reason: 'No valid line items found for PO'
                });
                failedCount++;
                continue;
            }

            const total_amount = subtotal + accumulatedTax;

            try {
                const poNumber = await transaction(async (conn) => {
                    // Generate PO Number inside transaction to prevent race conditions
                    const [lastPO] = await conn.execute(
                        `SELECT po_number FROM purchase_orders 
                         WHERE po_number LIKE ? 
                         ORDER BY id DESC LIMIT 1`,
                        [`PO-${year}-%`]
                    );

                    let nextNumber = 1;
                    if (lastPO && lastPO.length > 0 && lastPO[0].po_number) {
                        const lastNumber = parseInt(lastPO[0].po_number.split('-')[2]);
                        nextNumber = lastNumber + 1;
                    }
                    const po_num = `PO-${year}-${String(nextNumber).padStart(4, '0')}`;

                    // Insert PO Header
                    const [poResult] = await conn.execute(
                        `INSERT INTO purchase_orders (
                            po_number, supplier_id, order_date, expected_delivery, 
                            subtotal, tax_amount, total_amount, status, notes, created_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', ?, ?)`,
                        [
                            po_num, supplierId, orderDateStr, expectedDeliveryStr,
                            subtotal, accumulatedTax, total_amount, notes, req.user.userId
                        ]
                    );

                    const poId = poResult.insertId;

                    // Insert PO Items
                    for (const item of processedItems) {
                        await conn.execute(
                            `INSERT INTO po_items (
                                po_id, item_id, quantity, unit_price, tax_rate, tax_amount,
                                unit_price_excl_tax, unit_price_incl_tax, total_price_excl_tax, 
                                total_price_incl_tax, total_price
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                poId, item.item_id, item.quantity, item.unit_price, item.tax_rate, item.tax_amount,
                                item.unit_price_excl_tax, item.unit_price_incl_tax, item.total_price_excl_tax,
                                item.total_price_incl_tax, item.total_price
                            ]
                        );
                    }

                    return po_num;
                });

                createdCount++;
                results.push({
                    po_ref: poRef,
                    po_number: poNumber,
                    item_count: processedItems.length,
                    total_amount,
                    status: 'created',
                    reason: 'Success'
                });

            } catch (err) {
                failedCount++;
                results.push({
                    po_ref: poRef,
                    status: 'error',
                    reason: err.message
                });
            }
        }

        res.json({
            success: true,
            summary: {
                total_pos: poGroups.size,
                created: createdCount,
                failed: failedCount
            },
            results
        });

    } catch (error) {
        logger.error('Bulk create PO error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};


/**
 * Delete PO (only if Draft)
 */

