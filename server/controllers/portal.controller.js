import { query, transaction } from '../config/database.js';
import logger from '../utils/logger.js';
import Decimal from 'decimal.js';
import cache from '../utils/cache.js';

/**
 * Passwordless Customer Login
 */
export async function customerLogin(req, res) {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email address is required.' });
        }

        // Find customer in database
        const customers = await query(
            'SELECT id, name, email, phone, status, company FROM customers WHERE email = ?',
            [email.trim()]
        );

        if (customers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No customer account found with that email address. Please make sure the email is registered.'
            });
        }

        const customer = customers[0];

        if (customer.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: 'Your customer account is currently inactive. Please contact support.'
            });
        }

        // Set customer token cookie (valid for 24 hours)
        res.cookie('customerToken', customer.id.toString(), {
            httpOnly: false, // Accessible by frontend for simple state management
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });

        res.json({
            success: true,
            message: 'Logged in successfully',
            customer
        });
    } catch (error) {
        logger.error('Error during customer login:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Get Customer Profile & Dynamic Plan Package
 */
export async function getCustomerProfile(req, res) {
    try {
        const customerId = req.cookies.customerToken;

        if (!customerId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please login first.' });
        }

        const customers = await query(
            'SELECT id, name, email, phone, address, city, company, status FROM customers WHERE id = ?',
            [customerId]
        );

        if (customers.length === 0) {
            return res.status(404).json({ success: false, message: 'Customer profile not found.' });
        }

        const customer = customers[0];

        // Dynamically assign plan package information based on company type
        let planDetails = {
            plan_name: 'HenChamp Standard Package',
            quota: 'Standard Support & Office Stationary supply',
            billing_frequency: 'Monthly',
            price: 'KSh 15,000.00',
            status: 'Active'
        };

        if (customer.company === 'PRINTHUB') {
            planDetails = {
                plan_name: 'HenChamp PrintHub Premium Package',
                quota: 'Express printing priority, free local deliveries',
                billing_frequency: 'Monthly',
                price: 'KSh 45,000.00',
                status: 'Active'
            };
        } else if (customer.company === 'NATURAL') {
            planDetails = {
                plan_name: 'HenChamp Natural Eco Package',
                quota: 'Eco-friendly stationary supplies & green logistics priority',
                billing_frequency: 'Monthly',
                price: 'KSh 30,000.00',
                status: 'Active'
            };
        }

        res.json({
            success: true,
            customer: {
                ...customer,
                plan: planDetails
            }
        });
    } catch (error) {
        logger.error('Error fetching customer profile:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Get Customer Invoices Logs
 */
export async function getCustomerInvoices(req, res) {
    try {
        const customerId = req.cookies.customerToken;

        if (!customerId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please login first.' });
        }

        // Query sales invoice matching the customer's ID
        const invoices = await query(
            `SELECT id, invoice_number, sale_date, subtotal, discount_amount, tax_amount, total_amount, payment_method, payment_status, status, notes
             FROM sales
             WHERE customer_id = ?
             ORDER BY sale_date DESC`,
            [customerId]
        );

        res.json({
            success: true,
            invoices
        });
    } catch (error) {
        logger.error('Error fetching customer invoices:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

/**
 * Place Customer Order from Storefront Portal
 */
export async function placeCustomerOrder(req, res) {
    try {
        const customerId = req.cookies.customerToken;
        const { items, payment_method = 'Credit', notes = '' } = req.body;

        if (!customerId) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please login first.' });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart items are required to place an order.' });
        }

        // Execute inside single database transaction
        const result = await transaction(async (conn) => {
            // Get Shop location
            const [shopLoc] = await conn.query("SELECT id FROM locations WHERE name = 'Shop'");
            if (shopLoc.length === 0) {
                throw new Error("Shop location not configured in database.");
            }
            const shopId = shopLoc[0].id;

            // Fetch actual prices and validate stock levels first
            let totalSubtotal = new Decimal(0);
            const validatedItems = [];

            for (const cartItem of items) {
                const [dbItems] = await conn.query(
                    'SELECT id, name, selling_price, status FROM items WHERE id = ?',
                    [cartItem.item_id]
                );

                if (dbItems.length === 0) {
                    throw new Error(`Item #${cartItem.item_id} not found in database.`);
                }

                const item = dbItems[0];
                const quantity = parseInt(cartItem.quantity || 1);
                const unitPrice = new Decimal(item.selling_price || 0);
                const lineTotal = unitPrice.times(quantity);

                totalSubtotal = totalSubtotal.plus(lineTotal);

                // Verify stock availability in Shop location
                const [shopInv] = await conn.query(
                    'SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?',
                    [item.id, shopId]
                );
                const shopStock = shopInv.length > 0 ? shopInv[0].quantity : 0;

                if (shopStock < quantity) {
                    throw new Error(`Insufficient stock for "${item.name}". Required: ${quantity}, Available: ${shopStock}`);
                }

                validatedItems.push({
                    item_id: item.id,
                    name: item.name,
                    quantity,
                    unit_price: unitPrice.toNumber(),
                    total_price: lineTotal.toNumber()
                });
            }

            // Generate Invoice number
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const [lastInvoice] = await conn.query(
                `SELECT invoice_number FROM sales WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
                [`INV-${dateStr}-%`]
            );
            let nextNumber = 1;
            if (lastInvoice && lastInvoice.length > 0 && lastInvoice[0].invoice_number) {
                const lastNum = lastInvoice[0].invoice_number.split('-')[2];
                nextNumber = parseInt(lastNum) + 1;
            }
            const invoice_number = `INV-${dateStr}-${String(nextNumber).padStart(4, '0')}`;

            const finalPaymentStatus = (payment_method.toUpperCase() === 'CREDIT') ? 'Pending' : 'Paid';
            const finalInvoiceStatus = (finalPaymentStatus === 'Pending') ? 'pending' : 'completed';

            // Insert Sales Header
            const [saleResult] = await conn.query(
                `INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, discount_amount, tax_amount, total_amount, payment_method, payment_status, status, cashier_id, notes) 
                 VALUES (?, ?, NOW(), ?, 0, 0, ?, ?, ?, ?, 1, ?)`,
                [
                    invoice_number,
                    customerId,
                    totalSubtotal.toNumber(),
                    totalSubtotal.toNumber(),
                    payment_method,
                    finalPaymentStatus,
                    finalInvoiceStatus,
                    notes || 'Direct Customer Portal Checkout Order'
                ]
            );
            const saleId = saleResult.insertId;

            // Insert Payments
            await conn.query(
                `INSERT INTO sale_payments (sale_id, payment_method, amount, notes) VALUES (?, ?, ?, ?)`,
                [
                    saleId,
                    payment_method,
                    totalSubtotal.toNumber(),
                    payment_method.toUpperCase() === 'CREDIT' ? 'Pending Payment - Portal Credit Order' : 'Full payment processed online'
                ]
            );

            // Insert Sale Items & Run FIFO stock depletion
            for (const item of validatedItems) {
                // Cost Calculation (FIFO average costing)
                const [batchesForCosting] = await conn.query(`
                    SELECT id, cost_per_unit, current_quantity
                    FROM inventory_batches
                    WHERE item_id = ? AND current_quantity > 0
                    ORDER BY received_date ASC
                `, [item.item_id]);

                let totalCost = new Decimal(0);
                let tempRemaining = new Decimal(item.quantity);

                for (const batch of batchesForCosting) {
                    if (tempRemaining.isZero()) break;
                    const batchQty = new Decimal(batch.current_quantity);
                    const costPerUnit = new Decimal(batch.cost_per_unit);
                    const qtyFromThisBatch = Decimal.min(batchQty, tempRemaining);
                    totalCost = totalCost.plus(qtyFromThisBatch.times(costPerUnit));
                    tempRemaining = tempRemaining.minus(qtyFromThisBatch);
                }

                const costPricePerUnit = item.quantity > 0 
                    ? totalCost.dividedBy(new Decimal(item.quantity)).toDecimalPlaces(4).toNumber() 
                    : 0;

                const [saleItemResult] = await conn.query(
                    `INSERT INTO sale_items (sale_id, item_id, quantity, unit_price, total_price, cost_price) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        saleId,
                        item.item_id,
                        item.quantity,
                        item.unit_price,
                        item.total_price,
                        costPricePerUnit
                    ]
                );
                const saleItemId = saleItemResult.insertId;

                // Perform FIFO batch updates & ledger logging
                let remainingQtyToDeduct = item.quantity;
                const [batchesToDeplete] = await conn.query(`
                    SELECT id, grn_id, current_quantity, cost_per_unit
                    FROM inventory_batches
                    WHERE item_id = ? AND current_quantity > 0
                    ORDER BY received_date ASC
                `, [item.item_id]);

                for (const batch of batchesToDeplete) {
                    if (remainingQtyToDeduct <= 0) break;
                    const qtyFromBatch = Math.min(batch.current_quantity, remainingQtyToDeduct);

                    // Update batch current quantity
                    await conn.query(
                        'UPDATE inventory_batches SET current_quantity = current_quantity - ? WHERE id = ?',
                        [qtyFromBatch, batch.id]
                    );

                    // Insert sale_item_batches
                    await conn.query(
                        `INSERT INTO sale_item_batches (sale_item_id, batch_id, quantity, cost_price) VALUES (?, ?, ?, ?)`,
                        [saleItemId, batch.id, qtyFromBatch, batch.cost_per_unit]
                    );

                    // Insert stock_ledger
                    await conn.query(
                        `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id, quantity_before, quantity_change, quantity_after, unit_price, performed_by, notes) 
                         VALUES (?, 'sale', 'Portal Order - FIFO Batch Consumption', ?, ?, ?, ?, ?, 1, ?)`,
                        [
                            item.item_id,
                            saleId,
                            batch.current_quantity,
                            -qtyFromBatch,
                            batch.current_quantity - qtyFromBatch,
                            batch.cost_per_unit,
                            `Portal order: Consumed ${qtyFromBatch} from Batch #${batch.id} for ${item.name}`
                        ]
                    );

                    remainingQtyToDeduct -= qtyFromBatch;
                }

                // Update location stock
                await conn.query(
                    'UPDATE inventory SET quantity = quantity - ? WHERE item_id = ? AND location_id = ?',
                    [item.quantity, item.item_id, shopId]
                );
            }

            // ===== GENERATE DELIVERY NOTE =====
            const deliveryDateObj = new Date();
            const dnDateStr = deliveryDateObj.toISOString().slice(0, 10).replace(/-/g, '');

            const [lastDN] = await conn.query(
                `SELECT delivery_number FROM delivery_notes WHERE delivery_number LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
                [`DN-${dnDateStr}-%`]
            );

            let nextDNNumber = 1;
            if (lastDN && lastDN.length > 0 && lastDN[0].delivery_number) {
                const lastDNNum = lastDN[0].delivery_number.split('-')[2];
                nextDNNumber = parseInt(lastDNNum) + 1;
            }
            const delivery_number = `DN-${dnDateStr}-${String(nextDNNumber).padStart(4, '0')}`;

            const [dnResult] = await conn.query(
                `INSERT INTO delivery_notes (delivery_number, sale_id, delivery_date, status, notes) 
                 VALUES (?, ?, NOW(), 'Pending', 'Portal Direct Ordering Delivery Note')`,
                [delivery_number, saleId]
            );
            const deliveryNoteId = dnResult.insertId;

            for (const item of validatedItems) {
                await conn.query(
                    `INSERT INTO delivery_note_items (delivery_note_id, item_id, description, quantity) VALUES (?, ?, ?, ?)`,
                    [deliveryNoteId, item.item_id, item.name, item.quantity]
                );
            }

            return {
                saleId,
                invoiceNumber: invoice_number,
                deliveryNumber: delivery_number
            };
        });

        // Invalidate items and reports/dashboard cache
        cache.deletePattern('items:*');
        cache.deletePattern('reports:*');

        res.json({
            success: true,
            message: 'Order successfully placed!',
            data: result
        });

    } catch (error) {
        logger.error('Error placing portal order:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}
