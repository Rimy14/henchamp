import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import Decimal from 'decimal.js';

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'henchamp_pos_db',
    port: parseInt(process.env.DB_PORT || '3306'),
};

async function testConversion() {
    console.log('🧪 Starting Quotation to Invoice Conversion Integration Test...');
    const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });

    try {
        await conn.beginTransaction();

        // 1. Setup temporary customer
        console.log('👤 Creating temporary test customer...');
        const [custRes] = await conn.query(
            "INSERT INTO customers (customer_code, name, email, phone, status) VALUES ('CUST-TEST', 'Test Customer LLC', 'test@example.com', '123456', 'active')"
        );
        const customerId = custRes.insertId;

        // 2. Setup temporary item
        console.log('🏷️ Creating temporary test item...');
        const [itemRes] = await conn.query(
            "INSERT INTO items (code, barcode, name, description, category_id, supplier_id, unit_of_measure, selling_price, status) VALUES ('TEST-ITEM-001', 'TEST-ITEM-001', 'Test Physical Item', 'For testing FIFO depletion', 1, 1, 'PCS', 150.00, 'active')"
        );
        const itemId = itemRes.insertId;

        // 3. Setup Shop location stock
        const [shopLoc] = await conn.query("SELECT id FROM locations WHERE name = 'Shop'");
        const shopId = shopLoc[0].id;
        await conn.query(
            "INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, 20)",
            [itemId, shopId]
        );

        // 4. Setup two inventory batches for FIFO depletion (10 units each, received at different dates)
        console.log('📦 Seeding two test inventory batches...');
        // Batch 1 (oldest, cost 100)
        const [batch1Res] = await conn.query(
            "INSERT INTO inventory_batches (batch_number, item_id, initial_quantity, current_quantity, cost_per_unit, received_date, quality_status) VALUES ('BATCH-T1-OLD', ?, 10, 10, 100.00, '2026-01-01', 'accepted')",
            [itemId]
        );
        const batch1Id = batch1Res.insertId;

        // Batch 2 (newer, cost 120)
        const [batch2Res] = await conn.query(
            "INSERT INTO inventory_batches (batch_number, item_id, initial_quantity, current_quantity, cost_per_unit, received_date, quality_status) VALUES ('BATCH-T2-NEW', ?, 10, 10, 120.00, '2026-02-01', 'accepted')",
            [itemId]
        );
        const batch2Id = batch2Res.insertId;

        // 5. Setup quotation
        console.log('📜 Creating approved test quotation for 15 units...');
        const [quoteRes] = await conn.query(
            `INSERT INTO quotations (quote_number, customer_id, customer_name, quote_date, subtotal, total_amount, status, created_by)
             VALUES ('QT-TEST-CONV', ?, 'Test Customer LLC', CURDATE(), 2250.00, 2250.00, 'Approved', 1)`,
            [customerId]
        );
        const quotationId = quoteRes.insertId;

        await conn.query(
            `INSERT INTO quotation_items (quotation_id, item_id, description, quantity, unit_price, total_price)
             VALUES (?, ?, 'Test Physical Item', 15, 150.00, 2250.00)`,
            [quotationId, itemId]
        );

        // 6. Run the conversion logic directly as a transaction callback to verify it
        console.log('🔄 Simulating backend convertToInvoice controller code...');
        
        // --- CONVERSION LOGIC ---
        // Retrieve quotation
        const [quotations] = await conn.query('SELECT * FROM quotations WHERE id = ?', [quotationId]);
        const quotation = quotations[0];

        // Retrieve items
        const [quotationItems] = await conn.query('SELECT * FROM quotation_items WHERE quotation_id = ?', [quotationId]);

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

        // Create sale invoice
        const [saleResult] = await conn.query(
            `INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, total_amount, payment_method, payment_status, status, cashier_id)
             VALUES (?, ?, NOW(), ?, ?, 'Credit', 'Pending', 'pending', 1)`,
            [invoice_number, customerId, quotation.subtotal, quotation.total_amount]
        );
        const saleId = saleResult.insertId;

        // Perform FIFO depletion
        for (const item of quotationItems) {
            let actualCostPerUnit = 0;
            let totalCostForSaleItem = new Decimal(0);
            let remainingQtyToDeduct = item.quantity;

            if (item.item_id) {
                // Get batches for costing
                const [batchesForCosting] = await conn.query(`
                    SELECT id, cost_per_unit, current_quantity
                    FROM inventory_batches
                    WHERE item_id = ? AND current_quantity > 0
                    ORDER BY received_date ASC
                `, [item.item_id]);

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

            // Insert sale item
            const [saleItemResult] = await conn.query(
                `INSERT INTO sale_items (sale_id, item_id, quantity, unit_price, total_price, cost_price)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [saleId, item.item_id, item.quantity, item.unit_price, item.total_price, actualCostPerUnit]
            );
            const saleItemId = saleItemResult.insertId;

            // FIFO depletion loop
            if (item.item_id) {
                const [batchesToDeplete] = await conn.query(`
                    SELECT id, current_quantity, cost_per_unit
                    FROM inventory_batches
                    WHERE item_id = ? AND current_quantity > 0
                    ORDER BY received_date ASC
                `, [item.item_id]);

                for (const batch of batchesToDeplete) {
                    if (remainingQtyToDeduct <= 0) break;
                    const qtyFromBatch = Math.min(batch.current_quantity, remainingQtyToDeduct);

                    // Update batch
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
                        `INSERT INTO stock_ledger (item_id, transaction_type, reference_type, reference_id, quantity_before, quantity_change, quantity_after, unit_price, performed_by)
                         VALUES (?, 'sale', 'Sale - FIFO Batch Consumption', ?, ?, ?, ?, ?, 1)`,
                        [item.item_id, saleId, batch.current_quantity, -qtyFromBatch, batch.current_quantity - qtyFromBatch, batch.cost_per_unit]
                    );

                    remainingQtyToDeduct -= qtyFromBatch;
                }

                // Update inventory location total
                await conn.query(
                    'UPDATE inventory SET quantity = quantity - ? WHERE item_id = ? AND location_id = ?',
                    [item.quantity, item.item_id, shopId]
                );
            }
        }

        // Generate Delivery Note
        const dnDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
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
             VALUES (?, ?, NOW(), 'Shipped', 'Test DN')`,
            [delivery_number, saleId]
        );
        const deliveryNoteId = dnResult.insertId;

        for (const item of quotationItems) {
            await conn.query(
                `INSERT INTO delivery_note_items (delivery_note_id, item_id, description, quantity)
                 VALUES (?, ?, ?, ?)`,
                [deliveryNoteId, item.item_id, item.description, item.quantity]
            );
        }

        // Update quotation status
        await conn.query(
            `UPDATE quotations SET status = 'Invoiced' WHERE id = ?`,
            [quotationId]
        );

        // --- VERIFICATIONS ---
        console.log('🔍 Running assertions...');

        // 1. Verify Quotation status is updated to 'Invoiced'
        const [[updatedQuote]] = await conn.query('SELECT status FROM quotations WHERE id = ?', [quotationId]);
        if (updatedQuote.status !== 'Invoiced') {
            throw new Error(`Quotation status is not Invoiced. Found: ${updatedQuote.status}`);
        }
        console.log('   ✓ Quotation status successfully updated to "Invoiced"');

        // 2. Verify Invoice creation
        const [[createdInvoice]] = await conn.query('SELECT invoice_number, total_amount FROM sales WHERE id = ?', [saleId]);
        if (!createdInvoice || createdInvoice.invoice_number !== invoice_number) {
            throw new Error('Invoice not found or invoice number mismatch.');
        }
        console.log('   ✓ Invoice successfully created with number:', createdInvoice.invoice_number);

        // 3. Verify FIFO Batch depletion (FIFO checks)
        // Batch 1 (oldest, qty 10) should be fully depleted (current_quantity = 0)
        const [[updatedBatch1]] = await conn.query('SELECT current_quantity FROM inventory_batches WHERE id = ?', [batch1Id]);
        if (Number(updatedBatch1.current_quantity) !== 0) {
            throw new Error(`FIFO fail: Batch 1 (oldest) was not fully depleted. Remaining: ${updatedBatch1.current_quantity}`);
        }
        console.log('   ✓ FIFO depletion: Batch 1 (oldest) successfully depleted to 0');

        // Batch 2 (newer, qty 10) should have 5 units remaining (current_quantity = 5)
        const [[updatedBatch2]] = await conn.query('SELECT current_quantity FROM inventory_batches WHERE id = ?', [batch2Id]);
        if (Number(updatedBatch2.current_quantity) !== 5) {
            throw new Error(`FIFO fail: Batch 2 was not correctly depleted. Remaining: ${updatedBatch2.current_quantity}`);
        }
        console.log('   ✓ FIFO depletion: Batch 2 (newer) successfully depleted to 5');

        // 4. Verify Shop location inventory is now 5 (20 - 15)
        const [[updatedInventory]] = await conn.query('SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?', [itemId, shopId]);
        if (Number(updatedInventory.quantity) !== 5) {
            throw new Error(`Shop inventory mismatch. Found: ${updatedInventory.quantity}, Expected: 5`);
        }
        console.log('   ✓ Shop inventory correctly decremented from 20 to 5');

        // 5. Verify Delivery Note creation
        const [[createdDN]] = await conn.query('SELECT delivery_number FROM delivery_notes WHERE id = ?', [deliveryNoteId]);
        if (!createdDN || createdDN.delivery_number !== delivery_number) {
            throw new Error('Delivery Note not found or delivery number mismatch.');
        }
        console.log('   ✓ Delivery Note successfully created with number:', createdDN.delivery_number);

        const [dnItems] = await conn.query('SELECT * FROM delivery_note_items WHERE delivery_note_id = ?', [deliveryNoteId]);
        if (dnItems.length !== 1 || dnItems[0].quantity !== 15 || dnItems[0].item_id !== itemId) {
            throw new Error('Delivery Note items mismatch.');
        }
        console.log('   ✓ Delivery Note items successfully logged');

        console.log('\n🎉 ALL INTEGRATION TEST ASSERTIONS PASSED SUCCESSFULLY!');
        
    } catch (err) {
        console.error('\n❌ Test failed:', err);
    } finally {
        // Rollback all changes so we don't contaminate the DB
        console.log('🧹 Rolling back database transaction to keep DB clean...');
        await conn.rollback();
        await conn.end();
    }
}

testConversion();
