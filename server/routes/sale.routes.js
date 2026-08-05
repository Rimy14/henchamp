import express from 'express';
import Decimal from 'decimal.js';
import { verifyToken } from '../middleware/auth.middleware.js';
import { checkPermission } from '../middleware/rbac.middleware.js';
import { validateSaleCreate } from '../middleware/validation.middleware.js';
import { query, transaction } from '../config/database.js';
import cache from '../utils/cache.js';

const router = express.Router();

router.use(verifyToken);



router.get('/', async (req, res) => {
    try {
        const { status, page = 1, limit = 5, search, startDate, endDate } = req.query;

        let whereClause = 'WHERE 1=1';
        let queryParams = [];

        if (status && status !== 'all') {
            whereClause += ' AND s.status = ?';
            queryParams.push(status);
        }

        if (search) {
            whereClause += ' AND (s.invoice_number LIKE ? OR c.name LIKE ?)';
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        if (startDate) {
            // Use DATE() to match from start of day (00:00:00)
            whereClause += ' AND DATE(s.sale_date) >= ?';
            queryParams.push(startDate);
        }

        if (endDate) {
            // Use DATE() to match until end of day (23:59:59)
            whereClause += ' AND DATE(s.sale_date) <= ?';
            queryParams.push(endDate);
        }

        // Ensure valid integers for pagination
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 50;
        const offset = (pageNum - 1) * limitNum;

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM sales s 
            LEFT JOIN customers c ON s.customer_id = c.id
            ${whereClause}
        `;
        const [countResult] = await query(countQuery, queryParams);
        const total = countResult.total;

        // Determine sort order
        // Pending invoices: Oldest sale_date first (ASC) to prioritize aging debt
        // All other views: Newest created_at first (DESC)
        const orderBy = (status === 'pending') ? 's.sale_date ASC' : 's.created_at DESC';

        // Get paginated data
        const salesQuery = `SELECT s.*, c.name as customer_name, c.credit_period, u.username as cashier_name,
                    sp.name as sales_person_name
             FROM sales s
             LEFT JOIN customers c ON s.customer_id = c.id
             LEFT JOIN users u ON s.cashier_id = u.id
             LEFT JOIN sales_persons sp ON s.sales_person_id = sp.id
             ${whereClause}
             ORDER BY ${orderBy}
             LIMIT ${limitNum} OFFSET ${offset}`;

        // Use queryParams (without limit/offset) as they are now inline
        const sales = await query(salesQuery, queryParams);

        res.json({
            success: true,
            data: sales,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single sale/invoice by ID with items
router.get('/:id', checkPermission('sales:read'), async (req, res) => {
    try {
        const { id } = req.params;

        // Get sale details
        const [sale] = await query(
            `SELECT s.*, c.name as customer_name, c.phone as customer_phone, 
                    u.username as cashier_name, sp.name as sales_person_name
             FROM sales s 
             LEFT JOIN customers c ON s.customer_id = c.id 
             LEFT JOIN users u ON s.cashier_id = u.id 
             LEFT JOIN sales_persons sp ON s.sales_person_id = sp.id
             WHERE s.id = ?`,
            [id]
        );

        if (!sale) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        // Get sale items
        const items = await query(
            `SELECT si.*, i.name as item_name, i.code as item_code 
             FROM sale_items si 
             JOIN items i ON si.item_id = i.id 
             WHERE si.sale_id = ?`,
            [id]
        );

        // Get payment records
        const paymentRecords = await query(
            `SELECT payment_method, amount, reference_number, notes, created_at 
             FROM sale_payments 
             WHERE sale_id = ? 
             ORDER BY created_at`,
            [id]
        );

        sale.items = items;
        sale.payments = paymentRecords;

        // Get operators assigned to this sale
        const operators = await query(
            `SELECT so.operator_id, o.name, o.employee_code 
             FROM sale_operators so 
             JOIN operators o ON so.operator_id = o.id 
             WHERE so.sale_id = ?
             ORDER BY o.name`,
            [id]
        );
        sale.operators = operators;

        res.json({ success: true, data: sale });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cancel sale/invoice and restore stock
router.put('/:id/cancel', checkPermission('sales:delete'), async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        const result = await transaction(async (conn) => {
            // Get sale details
            const [sale] = await conn.execute(
                'SELECT * FROM sales WHERE id = ?',
                [id]
            );

            if (!sale || sale.length === 0) {
                throw new Error('Invoice not found');
            }

            if (sale[0].status === 'cancelled') {
                throw new Error('Invoice is already cancelled');
            }

            // Update sale status to cancelled
            await conn.execute(
                'UPDATE sales SET status = ?, notes = CONCAT(COALESCE(notes, ""), "\\n[CANCELLED] ", ?) WHERE id = ?',
                ['cancelled', reason || 'No reason provided', id]
            );

            // Get Shop location
            const [shopLoc] = await conn.execute(
                "SELECT id FROM locations WHERE name = 'Shop'"
            );
            if (!shopLoc || shopLoc.length === 0) {
                throw new Error('Shop location not found');
            }
            const shopId = shopLoc[0].id;

            // Get all items in the sale
            const [saleItems] = await conn.execute(
                'SELECT * FROM sale_items WHERE sale_id = ?',
                [id]
            );

            // Restore stock for each item
            for (const item of saleItems) {
                // 1. Restore global stock quantity
                await conn.execute(
                    'UPDATE items SET current_stock = current_stock + ? WHERE id = ?',
                    [item.quantity, item.item_id]
                );

                // 2. Restore Shop location inventory
                await conn.execute(
                    'UPDATE inventory SET quantity = quantity + ? WHERE item_id = ? AND location_id = ?',
                    [item.quantity, item.item_id, shopId]
                );

                // 3. Get batch deductions from sale_item_batches directly
                const [batchAttributions] = await conn.execute(
                    `SELECT sib.* 
                     FROM sale_item_batches sib
                     JOIN sale_items si ON sib.sale_item_id = si.id
                     WHERE si.sale_id = ? AND si.item_id = ?`,
                    [id, item.item_id]
                );

                // 4. Restore batches
                for (const attribution of batchAttributions) {
                    // Restore batch quantity
                    await conn.execute(
                        'UPDATE inventory_batches SET current_quantity = current_quantity + ? WHERE id = ?',
                        [attribution.quantity, attribution.batch_id]
                    );

                    // Record batch restoration in ledger
                    const [batchInfo] = await conn.execute(
                        'SELECT current_quantity FROM inventory_batches WHERE id = ?',
                        [attribution.batch_id]
                    );

                    if (batchInfo && batchInfo.length > 0) {
                        await conn.execute(
                            `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, 
                             reference_id, quantity_before, quantity_change, quantity_after, 
                             unit_price, performed_by, notes)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                item.item_id,
                                'return',
                                'Batch Restored',
                                id,
                                batchInfo[0].current_quantity - attribution.quantity,
                                attribution.quantity,
                                batchInfo[0].current_quantity,
                                attribution.cost_price,
                                req.user.userId,
                                `Batch #${attribution.batch_id} restored from cancelled invoice (Relational)`
                            ]
                        );
                    }
                }

                // 5. Add Shop-specific ledger entry
                const [shopInv] = await conn.execute(
                    'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                    [item.item_id, shopId]
                );

                if (shopInv && shopInv.length > 0) {
                    await conn.execute(
                        `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, 
                         reference_id, quantity_before, quantity_change, quantity_after, 
                         unit_price, performed_by, notes)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            item.item_id,
                            'return',
                            'Shop Inventory Restored',
                            id,
                            shopInv[0].quantity - item.quantity,
                            item.quantity,
                            shopInv[0].quantity,
                            item.unit_price,
                            req.user.userId,
                            `Shop inventory restored from cancelled invoice`
                        ]
                    );
                }

                // 6. Add global restoration entry to stock ledger (original logic)
                await conn.execute(
                    `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id, 
                     quantity_before, quantity_change, quantity_after, unit_price, performed_by, notes) 
                     SELECT ?, 'return', 'Sale Cancelled', ?, current_stock - ?, ?, current_stock, ?, ?, ? 
                     FROM items WHERE id = ?`,
                    [
                        item.item_id,
                        id,
                        item.quantity,
                        item.quantity,
                        item.unit_price,
                        req.user.userId,
                        `Stock restored from cancelled invoice`,
                        item.item_id
                    ]
                );
            }

            return { sale_id: id, items_restored: saleItems.length };
        });

        // Invalidate items and reports/dashboard cache on invoice cancellation
        cache.deletePattern('items:*');
        cache.deletePattern('dashboard:*');
        cache.deletePattern('reports:*');

        res.json({
            success: true,
            message: 'Invoice cancelled and stock restored',
            data: result
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Receive payment for pending credit invoice
router.put('/:id/payment', checkPermission('sales:create'), async (req, res) => {
    try {
        const { id } = req.params;
        const { payments } = req.body;

        // Validation
        if (!payments || !Array.isArray(payments) || payments.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one payment is required' });
        }

        const result = await transaction(async (conn) => {
            // Get invoice details
            const [invoice] = await conn.execute(
                'SELECT * FROM sales WHERE id = ?',
                [id]
            );

            if (!invoice || invoice.length === 0) {
                throw new Error('Invoice not found');
            }

            const invoiceData = invoice[0];

            // Check if invoice is pending
            if (invoiceData.status !== 'pending') {
                throw new Error('Only pending invoices can receive payments');
            }

            // 1. Insert NEW payment records
            for (const payment of payments) {
                // Skip if this is a CREDIT payment
                if (payment.method && payment.method.toUpperCase() === 'CREDIT') continue;

                const paymentNotes = `Payment via ${payment.method}`;
                await conn.execute(
                    `INSERT INTO sale_payments (sale_id, payment_method, amount, reference_number, notes, created_at) 
                     VALUES (?, ?, ?, ?, ?, NOW())`,
                    [id, payment.method, parseFloat(payment.amount), null, paymentNotes]
                );
            }

            // 2. Delete ALL existing CREDIT records (case-insensitive)
            await conn.execute(
                "DELETE FROM sale_payments WHERE sale_id = ? AND UPPER(payment_method) = 'CREDIT'",
                [id]
            );

            // 3. Recalculate Total Paid (Real Money) from DB
            const [updatedPayments] = await conn.execute(
                "SELECT COALESCE(SUM(amount), 0) as paid FROM sale_payments WHERE sale_id = ? AND UPPER(payment_method) != 'CREDIT'",
                [id]
            );
            const finalRealPaid = parseFloat(updatedPayments[0].paid) || 0;
            const finalOutstanding = parseFloat(invoiceData.total_amount) - finalRealPaid;

            // 4. Update Sale Status
            const isFullyPaid = finalOutstanding <= 0.01;
            await conn.execute(
                `UPDATE sales 
                 SET status = ?, 
                     payment_status = ?
                 WHERE id = ?`,
                [isFullyPaid ? 'completed' : 'pending', isFullyPaid ? 'paid' : 'partial', id]
            );

            // 5. If outstanding balance remains, insert a NEW CREDIT record
            if (!isFullyPaid && finalOutstanding > 0) {
                await conn.execute(
                    `INSERT INTO sale_payments (sale_id, payment_method, amount, reference_number, notes, created_at) 
                     VALUES (?, ?, ?, ?, ?, NOW())`,
                    [id, 'CREDIT', finalOutstanding, null, 'Remaining Balance']
                );
            }

            return {
                sale_id: id,
                invoice_number: invoiceData.invoice_number,
                payments_count: payments.length,
                total_amount: finalRealPaid.toFixed(2),
                outstanding: finalOutstanding > 0 ? finalOutstanding.toFixed(2) : '0.00'
            };
        });

        res.json({
            success: true,
            message: 'Payment received successfully',
            data: result
        });
    } catch (error) {
        console.error('Error in payment endpoint:', error);
        console.error('Error stack:', error.stack);
        console.error('Error message:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', checkPermission('sales:create'), async (req, res) => {
    try {
        // Extract and provide defaults for optional fields to avoid undefined errors
        const {
            customer_id = null,
            items,
            discount_percentage = 0,
            discount_amount = 0,
            tax_percentage = 0,
            tax_amount = null, // New: explicit tax amount from frontend
            payment_method, // Deprecated - kept for backward compatibility
            payments, // New: array of { method, amount, reference, notes }
            operators, // Optional: array of operator IDs
            sales_person_id = null, // NEW: Sales Person ID (optional)
            notes = null,
            sale_date = null // Optional: Backdated sale date (YYYY-MM-DD) - Admin only
        } = req.body;

        // Admin-only validation for custom/backdated sale date
        let targetSaleDate = null;
        if (sale_date && typeof sale_date === 'string' && sale_date.trim()) {
            const todayStr = new Date().toISOString().split('T')[0];
            const trimmedDate = sale_date.trim();
            if (trimmedDate !== todayStr) {
                if (req.user.role !== 'Admin') {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied. Only Admin users can enter backdated sales.'
                    });
                }
            }
            targetSaleDate = trimmedDate;
        }

        const result = await transaction(async (conn) => {
            // Calculate totals with per-item discounts using Decimal.js for precision
            let subtotal = new Decimal(0);
            let totalLineTax = new Decimal(0);

            for (const item of items) {
                // Calculate item discount with precision
                const itemDiscount = item.discount_amount
                    ? new Decimal(item.discount_amount)
                    : new Decimal(item.quantity)
                        .times(item.unit_price)
                        .times(item.discount_percentage || 0)
                        .div(100);

                // Item total = (quantity * price) - discount
                const itemTotal = new Decimal(item.quantity)
                    .times(item.unit_price)
                    .minus(itemDiscount);
                    
                // Accumulate line item tax if tax_rate is provided
                if (item.tax_rate) {
                    const iTax = Decimal.max(0, itemTotal).times(item.tax_rate).div(100);
                    totalLineTax = totalLineTax.plus(iTax);
                }

                subtotal = subtotal.plus(itemTotal);
            }

            // Apply sale-level discount on top of item discounts
            const discount = discount_amount
                ? new Decimal(discount_amount)
                : subtotal.times(discount_percentage || 0).div(100);

            const taxableAmount = subtotal.minus(discount);
            
            // Determine total tax. 
            // If explicit tax_amount was passed (frontend aggregated line items with invoice discount), use it.
            // Else fallback to line taxes (proportionally reduced by invoice discount) or global tax_percentage.
            let tax = new Decimal(0);
            if (tax_amount !== null && tax_amount !== undefined) {
                tax = new Decimal(tax_amount);
            } else if (totalLineTax.greaterThan(0)) {
                // Proportional tax reduction if invoice discount exists
                if (discount.greaterThan(0) && subtotal.greaterThan(0)) {
                    const discountRatio = discount.div(subtotal);
                    tax = totalLineTax.times(new Decimal(1).minus(discountRatio));
                } else {
                    tax = totalLineTax;
                }
            } else if (tax_percentage > 0) {
                tax = taxableAmount.times(tax_percentage).div(100);
            }

            const total = taxableAmount.plus(tax);

            // Convert to numbers for database storage (rounded to 2 decimal places)
            const subtotalNum = subtotal.toDecimalPlaces(2).toNumber();
            const discountNum = discount.toDecimalPlaces(2).toNumber();
            const taxNum = tax.toDecimalPlaces(2).toNumber();
            const totalNum = total.toDecimalPlaces(2).toNumber();

            // Generate invoice number: INV-YYYYMMDD-0001
            const invoiceDateObj = targetSaleDate ? new Date(targetSaleDate) : new Date();
            const dateStr = invoiceDateObj.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

            const [lastInvoice] = await conn.execute(
                `SELECT invoice_number FROM sales 
                 WHERE invoice_number LIKE ? 
                 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
                [`INV-${dateStr}-%`]
            );

            let nextNumber = 1;
            if (lastInvoice && lastInvoice.length > 0 && lastInvoice[0].invoice_number) {
                // Extract number from format INV-YYYYMMDD-XXXX
                const lastNum = lastInvoice[0].invoice_number.split('-')[2];
                nextNumber = parseInt(lastNum) + 1;
            }

            const invoice_number = `INV-${dateStr}-${String(nextNumber).padStart(4, '0')}`;

            // ===== HANDLE PAYMENTS =====
            // Support both old single payment_method and new payments array
            let paymentRecords = [];
            let payment_status = (req.body.payment_status && req.body.payment_status.toLowerCase() === 'pending') ? 'pending' : 'paid';
            let invoice_status = (payment_status === 'pending') ? 'pending' : 'completed';
            let primaryPaymentMethod = payment_method || (payments && payments[0] ? payments[0].method : 'Cash'); // For legacy field

            if (total.equals(0) || totalNum === 0) {
                // Zero Total / 100% Discount / Promo items
                payment_status = 'paid';
                invoice_status = 'completed';
                primaryPaymentMethod = primaryPaymentMethod || 'Cash';
                paymentRecords = [{
                    method: primaryPaymentMethod,
                    amount: 0,
                    reference: null,
                    notes: '100% Discount / Promo Sale'
                }];
            } else if (payments && Array.isArray(payments) && payments.length > 0) {
                // New format: multiple payments
                paymentRecords = payments;
                primaryPaymentMethod = payments[0].method;


                // Check if this is a pure CREDIT sale (old behavior)
                const isCreditSale = payments.length === 1 && (payments[0].method && payments[0].method.toUpperCase() === 'CREDIT');

                if (isCreditSale) {
                    // Pure CREDIT sale - customer validation required
                    if (!customer_id) {
                        throw new Error('Customer is required for credit invoices');
                    }

                    // Set pending status for credit invoices
                    payment_status = 'pending';
                    invoice_status = 'pending';

                    // For credit sales, record the full amount as credit
                    paymentRecords = [{
                        method: 'CREDIT',
                        amount: totalNum,
                        reference: null,
                        notes: 'Pending payment - Credit sale'
                    }];
                } else {
                    // Regular payment or PARTIAL PAYMENT
                    // IMPORTANT: CREDIT payments don't count as "paid" - they represent unpaid amount
                    const totalPaid = payments.reduce((sum, p) => {
                        if (p.method && p.method.toUpperCase() === 'CREDIT') {
                            return sum; // Don't add CREDIT to paid amount
                        }
                        return sum.plus(new Decimal(p.amount));
                    }, new Decimal(0));

                    // Use 0.01 tolerance for rounding
                    const difference = totalPaid.minus(total).abs();

                    if (totalPaid.lessThan(total.minus(0.01))) {
                        // PARTIAL PAYMENT - paid less than total
                        if (!customer_id) {
                            throw new Error('Customer is required for partial payments');
                        }
                        payment_status = 'partial';
                        invoice_status = 'pending';

                        // Add a note about remaining balance
                        const remaining = total.minus(totalPaid);
                        console.log(`Partial payment: Paid ${totalPaid.toFixed(2)}, Remaining ${remaining.toFixed(2)}`);
                    } else if (difference.greaterThan(0.01)) {
                        // Overpayment
                        throw new Error(`Payment amount (${totalPaid.toFixed(2)}) exceeds total amount (${total.toFixed(2)})`);
                    } else {
                        // Full payment
                        if (req.body.payment_status && req.body.payment_status.toLowerCase() === 'pending') {
                            payment_status = 'pending';
                            invoice_status = 'pending';
                        } else {
                            payment_status = 'paid';
                            invoice_status = 'completed';
                        }
                    }
                }
            } else if (payment_method) {
                // Old format: single payment method (backward compatibility)
                if (payment_method.toUpperCase() === 'CREDIT' || (req.body.payment_status && req.body.payment_status.toLowerCase() === 'pending')) {
                    payment_status = 'pending';
                    invoice_status = 'pending';
                    const paidAmt = (req.body.payment_amount !== undefined) ? Number(req.body.payment_amount) : 0;
                    if (paidAmt > 0) {
                        paymentRecords = [{
                            method: payment_method,
                            amount: paidAmt,
                            reference: null,
                            notes: 'Pending payment'
                        }];
                    } else {
                        paymentRecords = [];
                    }
                } else {

                    paymentRecords = [{
                        method: payment_method,
                        amount: totalNum,
                        reference: null,
                        notes: null
                    }];
                }
            } else {
                throw new Error('Either payment_method or payments array is required');
            }


            const finalPaymentStatus = (payment_status && payment_status.toLowerCase() === 'pending') ? 'Pending' : ((payment_status && payment_status.toLowerCase() === 'partial') ? 'Partial' : 'Paid');
            const finalInvoiceStatus = (finalPaymentStatus === 'Pending' || finalPaymentStatus === 'Partial') ? 'pending' : 'completed';

            // Insert sale with targetSaleDate or CURDATE()
            const [saleResult] = await conn.execute(
                `INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, discount_amount, discount_percentage, 
                 tax_amount, tax_percentage, total_amount, payment_method, payment_status, status, cashier_id, sales_person_id, notes) 
                 VALUES (?, ?, COALESCE(?, CURDATE()), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoice_number,
                    customer_id || null,
                    targetSaleDate || null,
                    subtotalNum,
                    discountNum,
                    discount_percentage || 0,
                    taxNum,
                    tax_percentage || 0,
                    totalNum,
                    primaryPaymentMethod || paymentRecords[0].method,
                    finalPaymentStatus,
                    finalInvoiceStatus,
                    req.user.userId,
                    sales_person_id || null,
                    notes || null
                ]
            );


            const sale_id = saleResult.insertId;

            // ===== INSERT PAYMENT RECORDS =====
            const paymentTimestamp = targetSaleDate ? `${targetSaleDate} 12:00:00` : null;
            for (const payment of paymentRecords) {
                await conn.execute(
                    `INSERT INTO sale_payments (sale_id, payment_method, amount, reference_number, notes, created_at) 
                     VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
                    [
                        sale_id,
                        payment.method,
                        payment.amount,
                        payment.reference || null,
                        payment.notes || null,
                        paymentTimestamp
                    ]
                );
            }

            // ===== INSERT OPERATOR ASSIGNMENTS (OPTIONAL) =====
            // Only insert operators if provided
            if (operators && Array.isArray(operators) && operators.length > 0) {
                // Validate operators exist and are active
                const placeholders = operators.map(() => '?').join(',');
                const [validOperators] = await conn.execute(
                    `SELECT id FROM operators WHERE id IN (${placeholders}) AND status = 'active'`,
                    operators
                );

                if (validOperators.length !== operators.length) {
                    throw new Error('One or more invalid or inactive operator IDs');
                }

                // Insert operator assignments
                for (const operatorId of operators) {
                    await conn.execute(
                        'INSERT INTO sale_operators (sale_id, operator_id) VALUES (?, ?)',
                        [sale_id, operatorId]
                    );
                }
            }

            // Insert sale items and update stock
            for (const item of items) {
                // Calculate item discount
                const itemDiscount = item.discount_amount ||
                    ((item.quantity * item.unit_price) * (item.discount_percentage || 0) / 100);

                // Final item total after discount
                const itemTotal = (item.quantity * item.unit_price) - itemDiscount;

                // ===== CAPTURE ACTUAL COST AT TIME OF SALE (FIFO Weighted Average) =====
                // All items now use direct FIFO batch costing
                let actualCostPerUnit = 0; // Default to 0 if no cost found or service item
                let totalCostForSaleItem = new Decimal(0);
                let remainingQuantityToCost = new Decimal(item.quantity);

                console.log(`[DEBUG] Processing item_id: ${item.item_id}, quantity: ${item.quantity}. Calculating cost from its own batches (unified logic).`);

                const [batchesForCosting] = await conn.execute(`
                    SELECT id, cost_per_unit, current_quantity, received_date
                    FROM inventory_batches
                    WHERE item_id = ? AND current_quantity > 0
                    ORDER BY received_date ASC
                `, [item.item_id]);

                console.log(`[DEBUG] Batches found for item ${item.item_id}:`, batchesForCosting);

                for (const batch of batchesForCosting) {
                    if (remainingQuantityToCost.isZero()) break;

                    const batchQty = new Decimal(batch.current_quantity);
                    const costPerUnit = new Decimal(batch.cost_per_unit);

                    const qtyFromThisBatch = Decimal.min(batchQty, remainingQuantityToCost);

                    console.log(`[DEBUG]   Batch ID: ${batch.id}, cost_per_unit: ${batch.cost_per_unit}, current_quantity: ${batch.current_quantity}`);
                    console.log(`[DEBUG]   Consuming ${qtyFromThisBatch} from batch, remainingQuantityToCost before: ${remainingQuantityToCost}`);

                    totalCostForSaleItem = totalCostForSaleItem.plus(qtyFromThisBatch.times(costPerUnit));
                    remainingQuantityToCost = remainingQuantityToCost.minus(qtyFromThisBatch);

                    console.log(`[DEBUG]   totalCostForSaleItem: ${totalCostForSaleItem}, remainingQuantityToCost after: ${remainingQuantityToCost}`);
                }

                if (new Decimal(item.quantity).greaterThan(0) && totalCostForSaleItem.greaterThan(0)) {
                    actualCostPerUnit = totalCostForSaleItem.dividedBy(new Decimal(item.quantity)).toDecimalPlaces(4).toNumber();
                }
                console.log(`[DEBUG] Final actualCostPerUnit for item ${item.item_id}: ${actualCostPerUnit}`);

                const [saleItemResult] = await conn.execute(
                    `INSERT INTO sale_items (sale_id, item_id, quantity, unit_price, discount_amount, discount_percentage, total_price, cost_price)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        sale_id,
                        item.item_id,
                        item.quantity,
                        item.unit_price,
                        item.discount_amount || 0,
                        item.discount_percentage || 0,
                        itemTotal,
                        actualCostPerUnit  // Store calculated FIFO weighted average cost per unit
                    ]
                );
                const saleItemId = saleItemResult.insertId;

                // ===== DIRECT INVENTORY DEDUCTION (FIFO) =====
                // Get Shop location
                const [shopLoc] = await conn.execute("SELECT id FROM locations WHERE name = 'Shop'");
                const shopId = shopLoc[0].id;

                // Get item details for error messages
                const [itemDetails] = await conn.execute(
                    'SELECT name, code FROM items WHERE id = ?',
                    [item.item_id]
                );
                const itemName = itemDetails[0]?.name || `Item #${item.item_id}`;

                // Check Shop stock availability
                const [shopInv] = await conn.execute(
                    'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                    [item.item_id, shopId]
                );
                const shopStock = shopInv.length > 0 ? shopInv[0].quantity : 0;

                // STRICT VALIDATION: Fail sale if insufficient stock
                if (shopStock < item.quantity) {
                    throw new Error(`Insufficient stock in Shop for ${itemName}. Required: ${item.quantity}, Available: ${shopStock}`);
                }

                let remainingQtyToDeduct = item.quantity;

                // Get current stock before deduction (for ledger)
                const [currentShopInv] = await conn.execute(
                    'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                    [item.item_id, shopId]
                );
                const stockBeforeDeduction = currentShopInv[0]?.quantity || 0;

                // Get batches in FIFO order (oldest first)
                const [batchesToDeplete] = await conn.execute(`
                    SELECT id, grn_id, current_quantity, cost_per_unit, received_date
                    FROM inventory_batches
                    WHERE item_id = ? AND current_quantity > 0
                    ORDER BY received_date ASC
                `, [item.item_id]);

                // Consume from batches (FIFO)
                for (const batch of batchesToDeplete) {
                    if (remainingQtyToDeduct <= 0) break;

                    const qtyFromBatch = Math.min(batch.current_quantity, remainingQtyToDeduct);

                    // Update batch quantity
                    await conn.execute(
                        'UPDATE inventory_batches SET current_quantity = current_quantity - ? WHERE id = ?',
                        [qtyFromBatch, batch.id]
                    );

                    // Track specific batch attribution relationally
                    await conn.execute(
                        `INSERT INTO sale_item_batches (sale_item_id, batch_id, quantity, cost_price)
                         VALUES (?, ?, ?, ?)`,
                        [saleItemId, batch.id, qtyFromBatch, batch.cost_per_unit]
                    );

                    // Create stock ledger entry for this batch consumption
                    await conn.execute(
                        `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id,
                         quantity_before, quantity_change, quantity_after, unit_price, performed_by, notes)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            item.item_id,
                            'sale',
                            'Sale - FIFO Batch Consumption',
                            sale_id,
                            batch.current_quantity, // Qty before this specific deduction from batch
                            -qtyFromBatch,
                            batch.current_quantity - qtyFromBatch, // Qty after this specific deduction from batch
                            batch.cost_per_unit, // Use batch's cost per unit
                            req.user.userId,
                            `FIFO: Consumed ${qtyFromBatch} from Batch #${batch.id} (GRN #${batch.grn_id}) for ${itemName}`
                        ]
                    );

                    remainingQtyToDeduct -= qtyFromBatch;
                }

                // Update Shop Inventory (total)
                await conn.execute(
                    'UPDATE inventory SET quantity = quantity - ? WHERE item_id = ? AND location_id = ?',
                    [item.quantity, item.item_id, shopId]
                );

                // Update Total Stock (Legacy)
                await conn.execute(
                    'UPDATE items SET current_stock = current_stock - ? WHERE id = ?',
                    [item.quantity, item.item_id]
                );

                // Summary ledger entry for direct item sale
                await conn.execute(
                    `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id,
                     quantity_before, quantity_change, quantity_after, unit_price, performed_by, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        item.item_id,
                        'sale',
                        'Sale - Item Summary',
                        sale_id,
                        stockBeforeDeduction,
                        -item.quantity,
                        stockBeforeDeduction - item.quantity,
                        actualCostPerUnit, // Using the calculated actualCostPerUnit for the summary
                        req.user.userId,
                        `Total sold for ${itemName} from Shop (deducted from ${batchesToDeplete.length} batch(es))`
                    ]
                );
            }

            // Fetch complete sale data for receipt printing
            const [saleData] = await conn.execute(`
                SELECT id as sale_id, invoice_number, created_at, subtotal, discount_amount, 
                       tax_amount, total_amount as total, payment_status
                FROM sales WHERE id = ?
            `, [sale_id]);

            // Get sale items with product names
            const [saleItems] = await conn.execute(`
                SELECT si.*, i.name as product_name
                FROM sale_items si
                JOIN items i ON si.item_id = i.id
                WHERE si.sale_id = ?
            `, [sale_id]);

            // Convert Decimal types to numbers for frontend
            const sale = saleData[0];
            return {
                sale_id: sale.sale_id,
                invoice_number: sale.invoice_number,
                created_at: sale.created_at,
                subtotal: parseFloat(sale.subtotal),
                discount_amount: parseFloat(sale.discount_amount),
                tax_amount: parseFloat(sale.tax_amount),
                total: parseFloat(sale.total),
                payment_status: sale.payment_status,
                items: saleItems.map(item => ({
                    ...item,
                    name: item.product_name, // Explicitly set common name property
                    item_name: item.product_name, // Fallback 1
                    product_name: item.product_name, // Fallback 2
                    quantity: parseFloat(item.quantity),
                    unit_price: parseFloat(item.unit_price),
                    total_price: parseFloat(item.total_price),
                    discount_amount: parseFloat(item.discount_amount || 0)
                })),
                payments: paymentRecords.map(p => ({
                    method: p.method,
                    amount: parseFloat(p.amount),
                    reference: p.reference,
                    notes: p.notes
                }))
            };
        });

        // Invalidate items and reports/dashboard cache
        cache.deletePattern('items:*');
        cache.deletePattern('dashboard:*');
        cache.deletePattern('reports:*');

        res.status(201).json({ success: true, message: 'Sale completed', data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
