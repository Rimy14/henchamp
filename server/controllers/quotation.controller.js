/**
 * Quotation Controller
 * Handles all quotation operations including creation, approval, and management
 */

import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';
import Decimal from 'decimal.js';

/**
 * Get all quotations with details
 */
export async function getAllQuotations(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || '';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (status) {
            whereClause += ' AND q.status = ?';
            params.push(status);
        }

        if (startDate && endDate) {
            whereClause += ' AND q.quote_date BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM quotations q ${whereClause}`;
        const countResult = await query(countSql, params);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // Get paginated quotations with details
        const sql = `
            SELECT 
                q.*,
                u.username as created_by_name,
                a.username as approved_by_name,
                (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count
            FROM quotations q
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN users a ON q.approved_by = a.id
            ${whereClause}
            ORDER BY q.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const quotations = await query(sql, params);

        res.json({
            success: true,
            data: quotations,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        });
    } catch (error) {
        logger.error('Error fetching quotations:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Get single quotation with items
 */
export async function getQuotationById(req, res) {
    try {
        const { id } = req.params;

        // Get quotation details
        const quotationSql = `
            SELECT 
                q.*,
                u.username as created_by_name,
                a.username as approved_by_name
            FROM quotations q
            LEFT JOIN users u ON q.created_by = u.id
            LEFT JOIN users a ON q.approved_by = a.id
            WHERE q.id = ?
        `;
        const quotations = await query(quotationSql, [id]);

        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }

        const quotation = quotations[0];

        // Get quotation items
        const itemsSql = `
            SELECT 
                qi.*,
                i.name as item_name,
                i.code as item_code,
                i.unit_of_measure
            FROM quotation_items qi
            LEFT JOIN items i ON qi.item_id = i.id
            WHERE qi.quotation_id = ?
            ORDER BY qi.id
        `;
        const items = await query(itemsSql, [id]);

        quotation.items = items;

        res.json({ success: true, data: quotation });
    } catch (error) {
        logger.error('Error fetching quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Create new quotation
 */
export async function createQuotation(req, res) {
    try {
        const {
            customer_id,
            customer_name,
            customer_contact,
            customer_address,
            quote_date,
            validity_days,
            payment_terms,
            tax_percentage,
            discount_percentage,
            notes,
            items
        } = req.body;

        // Validation
        if (!customer_name) {
            return res.status(400).json({ success: false, message: 'Customer name is required' });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one item is required' });
        }

        if (!quote_date) {
            return res.status(400).json({ success: false, message: 'Quote date is required' });
        }

        const userId = req.user.userId;

        // Calculate totals
        let subtotal = 0;
        items.forEach(item => {
            subtotal += parseFloat(item.total_price);
        });

        const taxAmount = (subtotal * (parseFloat(tax_percentage) || 0)) / 100;
        const discountAmount = (subtotal * (parseFloat(discount_percentage) || 0)) / 100;
        const totalAmount = subtotal + taxAmount - discountAmount;

        // Generate unique quote number
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const quote_number = `QT-${dateStr}-${randomSuffix}`;

        await transaction(async (conn) => {
            // Insert quotation
            const quotationSql = `
                INSERT INTO quotations (
                    customer_id, customer_name, customer_contact, customer_address,
                    quote_date, validity_days, payment_terms,
                    subtotal, tax_percentage, tax_amount, 
                    discount_percentage, discount_amount,
                    total_amount,
                    status, notes, created_by, quote_number
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const quotationParams = [
                customer_id || null,
                customer_name,
                customer_contact || null,
                customer_address || null,
                quote_date,
                validity_days || 7,
                payment_terms || null,
                subtotal.toFixed(2),
                tax_percentage || 0,
                taxAmount.toFixed(2),
                discount_percentage || 0,
                discountAmount.toFixed(2),
                totalAmount.toFixed(2),
                'Draft',
                notes || null,
                userId,
                quote_number
            ];

            const [result] = await conn.query(quotationSql, quotationParams);
            const quotationId = result.insertId;

            // Insert quotation items
            for (const item of items) {
                const itemSql = `
                    INSERT INTO quotation_items (
                        quotation_id, item_id, description, quantity, unit_price, total_price
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `;

                await conn.query(itemSql, [
                    quotationId,
                    item.item_id || null,
                    item.description,
                    item.quantity,
                    item.unit_price,
                    item.total_price
                ]);
            }

            res.status(201).json({
                success: true,
                message: 'Quotation created successfully',
                data: { id: quotationId }
            });
        });
    } catch (error) {
        logger.error('Error creating quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Update quotation details
 */
export async function updateQuotation(req, res) {
    try {
        const { id } = req.params;
        const {
            customer_id,
            customer_name,
            customer_contact,
            customer_address,
            quote_date,
            validity_days,
            payment_terms,
            tax_percentage,
            discount_percentage,
            notes,
            items
        } = req.body;

        // Validation
        if (!customer_name) {
            return res.status(400).json({ success: false, message: 'Customer name is required' });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one item is required' });
        }

        if (!quote_date) {
            return res.status(400).json({ success: false, message: 'Quote date is required' });
        }

        // Check if quotation exists
        const quotations = await query('SELECT * FROM quotations WHERE id = ?', [id]);
        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }

        const userId = req.user.userId;

        // Calculate totals
        let subtotal = 0;
        items.forEach(item => {
            subtotal += parseFloat(item.total_price);
        });

        const taxAmount = (subtotal * (parseFloat(tax_percentage) || 0)) / 100;
        const discountAmount = (subtotal * (parseFloat(discount_percentage) || 0)) / 100;
        const totalAmount = subtotal + taxAmount - discountAmount;

        await transaction(async (conn) => {
            // Update quotation
            const updateSql = `
                UPDATE quotations SET
                    customer_id = ?, customer_name = ?, customer_contact = ?, customer_address = ?,
                    quote_date = ?, validity_days = ?, payment_terms = ?,
                    subtotal = ?, tax_percentage = ?, tax_amount = ?, 
                    discount_percentage = ?, discount_amount = ?,
                    total_amount = ?,
                    notes = ?, updated_at = NOW()
                WHERE id = ?
            `;

            const updateParams = [
                customer_id || null,
                customer_name,
                customer_contact || null,
                customer_address || null,
                quote_date,
                validity_days || 7,
                payment_terms || null,
                subtotal.toFixed(2),
                tax_percentage || 0,
                taxAmount.toFixed(2),
                discount_percentage || 0,
                discountAmount.toFixed(2),
                totalAmount.toFixed(2),
                notes || null,
                id
            ];

            await conn.query(updateSql, updateParams);

            // Delete existing items
            await conn.query('DELETE FROM quotation_items WHERE quotation_id = ?', [id]);

            // Insert new items
            for (const item of items) {
                const itemSql = `
                    INSERT INTO quotation_items (
                        quotation_id, item_id, description, quantity, unit_price, total_price
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `;

                await conn.query(itemSql, [
                    id,
                    item.item_id || null,
                    item.description,
                    item.quantity,
                    item.unit_price,
                    item.total_price
                ]);
            }

            res.json({
                success: true,
                message: 'Quotation updated successfully',
                data: { id }
            });
        });
    } catch (error) {
        logger.error('Error updating quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Update quotation status
 */
export async function updateQuotationStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user.userId;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required' });
        }

        // Validate status
        const validStatuses = ['Draft', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Get current quotation
        const quotations = await query('SELECT * FROM quotations WHERE id = ?', [id]);
        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }

        const quotation = quotations[0];

        // Build update query
        let updateSql = 'UPDATE quotations SET status = ?, updated_at = NOW()';
        const params = [status];

        if (notes) {
            updateSql += ', notes = ?';
            params.push(notes);
        }

        // If approving, set approved_by and approved_at
        if (status === 'Approved') {
            updateSql += ', approved_by = ?, approved_at = NOW()';
            params.push(userId);
        }

        updateSql += ' WHERE id = ?';
        params.push(id);

        await query(updateSql, params);

        res.json({ success: true, message: `Quotation ${status.toLowerCase()} successfully` });
    } catch (error) {
        logger.error('Error updating quotation status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
        // Delete quotation (items will be deleted by CASCADE)
        await query('DELETE FROM quotations WHERE id = ?', [id]);

        res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
        logger.error('Error deleting quotation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Convert quotation to invoice and generate delivery note
 */
export async function convertToInvoice(req, res) {
    try {
        const { id } = req.params;
        const { payment_method = 'Credit', notes = '' } = req.body;
        const userId = req.user.userId;

        // 1. Retrieve the quotation
        const quotations = await query('SELECT * FROM quotations WHERE id = ?', [id]);
        if (quotations.length === 0) {
            return res.status(404).json({ success: false, message: 'Quotation not found' });
        }
        const quotation = quotations[0];

        // 2. Validate status (must be Approved)
        if (quotation.status !== 'Approved') {
            return res.status(400).json({ 
                success: false, 
                message: `Only approved quotations can be converted to an invoice. Current status: ${quotation.status}` 
            });
        }

        // 3. Get quotation items
        const quotationItems = await query('SELECT * FROM quotation_items WHERE quotation_id = ?', [id]);
        if (quotationItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Quotation has no items' });
        }

        // Run entire transaction
        const result = await transaction(async (conn) => {
            // Get Shop location
            const [shopLoc] = await conn.query("SELECT id FROM locations WHERE name = 'Shop'");
            if (shopLoc.length === 0) {
                throw new Error("Shop location not configured in database.");
            }
            const shopId = shopLoc[0].id;

            // Strict Validation: check stock availability for all physical items first
            for (const item of quotationItems) {
                if (item.item_id) {
                    const [shopInv] = await conn.query(
                        'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                        [item.item_id, shopId]
                    );
                    const shopStock = shopInv.length > 0 ? shopInv[0].quantity : 0;
                    
                    // Fetch item details for readable error
                    const [itemDetails] = await conn.query('SELECT name FROM items WHERE id = ?', [item.item_id]);
                    const itemName = itemDetails[0]?.name || `Item #${item.item_id}`;

                    if (shopStock < item.quantity) {
                        throw new Error(`Insufficient stock in Shop for "${itemName}". Required: ${item.quantity}, Available: ${shopStock}`);
                    }
                }
            }

            // Generate Invoice number: INV-YYYYMMDD-0001
            const invoiceDateObj = new Date();
            const dateStr = invoiceDateObj.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

            const [lastInvoice] = await conn.query(
                `SELECT invoice_number FROM sales 
                 WHERE invoice_number LIKE ? 
                 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
                [`INV-${dateStr}-%`]
            );

            let nextNumber = 1;
            if (lastInvoice && lastInvoice.length > 0 && lastInvoice[0].invoice_number) {
                const lastNum = lastInvoice[0].invoice_number.split('-')[2];
                nextNumber = parseInt(lastNum) + 1;
            }
            const invoice_number = `INV-${dateStr}-${String(nextNumber).padStart(4, '0')}`;

            // Determine payment and invoice status
            const finalPaymentStatus = (payment_method.toUpperCase() === 'CREDIT') ? 'Pending' : 'Paid';
            const finalInvoiceStatus = (finalPaymentStatus === 'Pending') ? 'pending' : 'completed';

            const invoiceNotes = notes || `Converted from Quotation #${quotation.quote_number}`;

            // Insert into sales table
            const [saleResult] = await conn.query(
                `INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, discount_amount, discount_percentage, 
                 tax_amount, tax_percentage, total_amount, payment_method, payment_status, status, cashier_id, notes) 
                 VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoice_number,
                    quotation.customer_id || null,
                    quotation.subtotal,
                    quotation.discount_amount || 0,
                    quotation.discount_percentage || 0,
                    quotation.tax_amount || 0,
                    quotation.tax_percentage || 0,
                    quotation.total_amount,
                    payment_method,
                    finalPaymentStatus,
                    finalInvoiceStatus,
                    userId,
                    invoiceNotes
                ]
            );
            const saleId = saleResult.insertId;

            // Insert payments
            await conn.query(
                `INSERT INTO sale_payments (sale_id, payment_method, amount, notes) 
                 VALUES (?, ?, ?, ?)`,
                [
                    saleId,
                    payment_method,
                    quotation.total_amount,
                    payment_method.toUpperCase() === 'CREDIT' ? 'Pending payment - Credit sale' : 'Full payment received'
                ]
            );

            // Insert sale items, perform FIFO depletion
            for (const item of quotationItems) {
                let actualCostPerUnit = 0;
                let totalCostForSaleItem = new Decimal(0);
                let remainingQtyToDeduct = item.quantity;

                if (item.item_id) {
                    // Get batches for FIFO calculation
                    const [batchesForCosting] = await conn.query(`
                        SELECT id, cost_per_unit, current_quantity, grn_id
                        FROM inventory_batches
                        WHERE item_id = ? AND current_quantity > 0
                        ORDER BY received_date ASC
                    `, [item.item_id]);

                    // Calculate average cost price based on FIFO
                    let tempRemaining = new Decimal(item.quantity);
                    for (const batch of batchesForCosting) {
                        if (tempRemaining.isZero()) break;
                        const batchQty = new Decimal(batch.current_quantity);
                        const costPerUnit = new Decimal(batch.cost_per_unit);
                        const qtyFromThisBatch = Decimal.min(batchQty, tempRemaining);

                        totalCostForSaleItem = totalCostForSaleItem.plus(qtyFromThisBatch.times(costPerUnit));
                        tempRemaining = tempRemaining.minus(qtyFromThisBatch);
                    }

                    if (item.quantity > 0 && totalCostForSaleItem.greaterThan(0)) {
                        actualCostPerUnit = totalCostForSaleItem.dividedBy(new Decimal(item.quantity)).toDecimalPlaces(4).toNumber();
                    }
                }

                // Insert into sale_items
                const [saleItemResult] = await conn.query(
                    `INSERT INTO sale_items (sale_id, item_id, quantity, unit_price, total_price, cost_price)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        saleId,
                        item.item_id || null,
                        item.quantity,
                        item.unit_price,
                        item.total_price,
                        actualCostPerUnit
                    ]
                );
                const saleItemId = saleItemResult.insertId;

                // Perform direct FIFO depletion & logging
                if (item.item_id) {
                    // Fetch batches to deplete
                    const [batchesToDeplete] = await conn.query(`
                        SELECT id, grn_id, current_quantity, cost_per_unit
                        FROM inventory_batches
                        WHERE item_id = ? AND current_quantity > 0
                        ORDER BY received_date ASC
                    `, [item.item_id]);

                    const [itemDetails] = await conn.query('SELECT name FROM items WHERE id = ?', [item.item_id]);
                    const itemName = itemDetails[0]?.name || `Item #${item.item_id}`;

                    for (const batch of batchesToDeplete) {
                        if (remainingQtyToDeduct <= 0) break;

                        const qtyFromBatch = Math.min(batch.current_quantity, remainingQtyToDeduct);

                        // Update batch quantity
                        await conn.query(
                            'UPDATE inventory_batches SET current_quantity = current_quantity - ? WHERE id = ?',
                            [qtyFromBatch, batch.id]
                        );

                        // Insert sale_item_batches
                        await conn.query(
                            `INSERT INTO sale_item_batches (sale_item_id, batch_id, quantity, cost_price)
                             VALUES (?, ?, ?, ?)`,
                            [saleItemId, batch.id, qtyFromBatch, batch.cost_per_unit]
                        );

                        // Insert stock_ledger
                        await conn.query(
                            `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id,
                             quantity_before, quantity_change, quantity_after, unit_price, performed_by, notes)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                item.item_id,
                                'sale',
                                'Sale - FIFO Batch Consumption',
                                saleId,
                                batch.current_quantity,
                                -qtyFromBatch,
                                batch.current_quantity - qtyFromBatch,
                                batch.cost_per_unit,
                                userId,
                                `FIFO: Consumed ${qtyFromBatch} from Batch #${batch.id} (GRN #${batch.grn_id}) for ${itemName}`
                            ]
                        );

                        remainingQtyToDeduct -= qtyFromBatch;
                    }

                    // Update location-level stock (Shop inventory)
                    await conn.query(
                        'UPDATE inventory SET quantity = quantity - ? WHERE item_id = ? AND location_id = ?',
                        [item.quantity, item.item_id, shopId]
                    );
                }
            }

            // ===== GENERATE DELIVERY NOTE =====
            const deliveryDateObj = new Date();
            const dnDateStr = deliveryDateObj.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

            const [lastDN] = await conn.query(
                `SELECT delivery_number FROM delivery_notes 
                 WHERE delivery_number LIKE ? 
                 ORDER BY id DESC LIMIT 1 FOR UPDATE`,
                [`DN-${dnDateStr}-%`]
            );

            let nextDNNumber = 1;
            if (lastDN && lastDN.length > 0 && lastDN[0].delivery_number) {
                const lastDNNum = lastDN[0].delivery_number.split('-')[2];
                nextDNNumber = parseInt(lastDNNum) + 1;
            }
            const delivery_number = `DN-${dnDateStr}-${String(nextDNNumber).padStart(4, '0')}`;

            const dnNotes = `Generated automatically from invoice conversion of Quotation #${quotation.quote_number}`;

            const [dnResult] = await conn.query(
                `INSERT INTO delivery_notes (delivery_number, sale_id, delivery_date, status, notes)
                 VALUES (?, ?, NOW(), 'Shipped', ?)`,
                [delivery_number, saleId, dnNotes]
            );
            const deliveryNoteId = dnResult.insertId;

            // Insert delivery note items
            for (const item of quotationItems) {
                await conn.query(
                    `INSERT INTO delivery_note_items (delivery_note_id, item_id, description, quantity)
                     VALUES (?, ?, ?, ?)`,
                    [deliveryNoteId, item.item_id || null, item.description, item.quantity]
                );
            }

            // Update Quotation status to 'Invoiced'
            await conn.query(
                `UPDATE quotations SET status = 'Invoiced', updated_at = NOW() WHERE id = ?`,
                [id]
            );

            return {
                saleId,
                invoiceNumber: invoice_number,
                deliveryNoteId,
                deliveryNumber: delivery_number
            };
        });

        res.json({
            success: true,
            message: 'Quotation successfully converted to invoice and delivery note',
            data: result
        });
    } catch (error) {
        logger.error('Error converting quotation to invoice:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}
