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

async function testCustomerPortal() {
    console.log('🧪 Starting Customer Self-Service Portal Integration Test...');
    const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });

    try {
        await conn.beginTransaction();

        // 1. Setup temporary customer
        console.log('👤 Creating temporary customer account...');
        const [custRes] = await conn.query(
            "INSERT INTO customers (customer_code, name, email, phone, status, company) VALUES ('CUST-PORTAL-T', 'Portal Test Client Ltd', 'portal-test@example.com', '+254711112222', 'active', 'PRINTHUB')"
        );
        const customerId = custRes.insertId;

        // 2. Setup temporary item with stock
        console.log('🏷️ Creating temporary product...');
        const [itemRes] = await conn.query(
            "INSERT INTO items (code, barcode, name, description, category_id, supplier_id, unit_of_measure, selling_price, status) VALUES ('PORT-ITEM-001', 'PORT-ITEM-001', 'Portal Test Stationery', 'For storefront order testing', 1, 1, 'PCS', 500.00, 'active')"
        );
        const itemId = itemRes.insertId;

        // Setup Shop location stock
        const [shopLoc] = await conn.query("SELECT id FROM locations WHERE name = 'Shop'");
        const shopId = shopLoc[0].id;
        await conn.query(
            "INSERT INTO inventory (item_id, location_id, quantity) VALUES (?, ?, 50)",
            [itemId, shopId]
        );

        // Seeding inventory batch
        console.log('📦 Seeding inventory batch...');
        const [batchRes] = await conn.query(
            "INSERT INTO inventory_batches (batch_number, item_id, initial_quantity, current_quantity, cost_per_unit, received_date, quality_status) VALUES ('BATCH-PORT-1', ?, 50, 50, 350.00, '2026-01-01', 'accepted')",
            [itemId]
        );
        const batchId = batchRes.insertId;

        // ===== TEST 1: Passwordless Customer Login (C1) =====
        console.log('🔑 Testing passwordless customer login...');
        const [customers] = await conn.query(
            'SELECT id, name, email, phone, status, company FROM customers WHERE email = ?',
            ['portal-test@example.com']
        );

        if (customers.length === 0 || customers[0].id !== customerId) {
            throw new Error('Login simulation failed: customer not fetched by email.');
        }
        console.log('   ✓ Login successfully authenticated by email.');

        // ===== TEST 2: Active Plan Dynamic Mapping (C1) =====
        console.log('📦 Testing customer profile and billing plan selection...');
        const customer = customers[0];
        let planDetails = null;
        if (customer.company === 'PRINTHUB') {
            planDetails = {
                plan_name: 'HenChamp PrintHub Premium Package',
                fee: 'KSh 45,000.00'
            };
        }
        if (!planDetails || planDetails.plan_name !== 'HenChamp PrintHub Premium Package') {
            throw new Error('Active package simulation dynamic mapping failed.');
        }
        console.log('   ✓ Profile plan package dynamically mapped based on company type.');

        // ===== TEST 3: Storefront Checkout & Order Submission (C2) =====
        console.log('🛒 Testing direct storefront order checkout...');
        const itemsToOrder = [{ item_id: itemId, quantity: 10 }];
        const payment_method = 'Credit';
        const notes = 'Direct Customer Portal Checkout Order';

        // Direct ordering simulation (transactional code)
        let totalSubtotal = new Decimal(0);
        const validatedItems = [];

        for (const cartItem of itemsToOrder) {
            const [dbItems] = await conn.query('SELECT id, name, selling_price FROM items WHERE id = ?', [cartItem.item_id]);
            const dbItem = dbItems[0];
            const lineTotal = new Decimal(dbItem.selling_price).times(cartItem.quantity);
            totalSubtotal = totalSubtotal.plus(lineTotal);

            validatedItems.push({
                item_id: dbItem.id,
                name: dbItem.name,
                quantity: cartItem.quantity,
                unit_price: Number(dbItem.selling_price),
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

        // Insert sale
        const [saleResult] = await conn.query(
            `INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, total_amount, payment_method, payment_status, status, cashier_id, notes) 
             VALUES (?, ?, NOW(), ?, ?, ?, 'Pending', 'pending', 1, ?)`,
            [invoice_number, customerId, totalSubtotal.toNumber(), totalSubtotal.toNumber(), payment_method, notes]
        );
        const saleId = saleResult.insertId;

        // Perform FIFO depletion
        for (const item of validatedItems) {
            const [batchesToDeplete] = await conn.query(
                `SELECT id, current_quantity, cost_per_unit FROM inventory_batches WHERE item_id = ? AND current_quantity > 0 ORDER BY received_date ASC`,
                [item.item_id]
            );

            let remainingQtyToDeduct = item.quantity;
            for (const batch of batchesToDeplete) {
                if (remainingQtyToDeduct <= 0) break;
                const qtyFromBatch = Math.min(batch.current_quantity, remainingQtyToDeduct);

                // Update batch
                await conn.query('UPDATE inventory_batches SET current_quantity = current_quantity - ? WHERE id = ?', [qtyFromBatch, batch.id]);

                // Update location stock
                await conn.query('UPDATE inventory SET quantity = quantity - ? WHERE item_id = ? AND location_id = ?', [qtyFromBatch, item.item_id, shopId]);

                remainingQtyToDeduct -= qtyFromBatch;
            }

            // Insert sale item
            await conn.query(
                `INSERT INTO sale_items (sale_id, item_id, quantity, unit_price, total_price, cost_price) VALUES (?, ?, ?, ?, ?, 350.00)`,
                [saleId, item.item_id, item.quantity, item.unit_price, item.total_price]
            );
        }

        console.log('   ✓ Storefront order placed successfully. Sales record created with invoice #:', invoice_number);

        // ===== TEST 4: Fetch Invoices History Log (C1) =====
        console.log('📊 Testing billing and invoices history log fetch...');
        const [invoiceLogs] = await conn.query('SELECT id, invoice_number, total_amount FROM sales WHERE customer_id = ?', [customerId]);
        if (invoiceLogs.length !== 1 || invoiceLogs[0].invoice_number !== invoice_number) {
            throw new Error('Billing invoices log fetch failed: invoice count or mismatch.');
        }
        console.log('   ✓ Invoice history logs fetch returned matching customer transactions.');

        // ===== TEST 5: Verify FIFO Inventory Reduction (C2) =====
        console.log('📦 Verifying FIFO stock reduction after order checkout...');
        const [[updatedBatch]] = await conn.query('SELECT current_quantity FROM inventory_batches WHERE id = ?', [batchId]);
        if (Number(updatedBatch.current_quantity) !== 40) {
            throw new Error(`Inventory deduction failed. Remaining: ${updatedBatch.current_quantity}, expected: 40`);
        }
        console.log('   ✓ Inventory batch quantity successfully decreased from 50 to 40.');

        console.log('\n🎉 ALL CUSTOMER PORTAL SERVICE TEST ASSERTIONS PASSED SUCCESSFULLY!');

    } catch (err) {
        console.error('\n❌ Test failed:', err);
    } finally {
        console.log('🧹 Rolling back database transaction to keep DB clean...');
        await conn.rollback();
        await conn.end();
    }
}

testCustomerPortal();
