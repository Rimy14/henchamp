import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'henchamp_pos_db',
    port: parseInt(process.env.DB_PORT || '3306'),
};

async function testCustomerCRM() {
    console.log('🧪 Starting Customer CRM Purchase History Integration Test...');
    const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });

    try {
        await conn.beginTransaction();

        // 1. Setup temporary customer
        console.log('👤 Creating temporary customer...');
        const [custRes] = await conn.query(
            "INSERT INTO customers (customer_code, name, email, phone, status, company) VALUES ('CUST-CRM-T', 'CRM Test Client Ltd', 'crm-test@example.com', '+254700000000', 'active', 'PRINTHUB')"
        );
        const customerId = custRes.insertId;

        // 2. Setup temporary sales invoice for customer
        console.log('📄 Creating temporary sales invoice...');
        const [saleRes] = await conn.query(
            "INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status, status, cashier_id, notes) VALUES ('INV-CRM-0001', ?, NOW(), 1200.00, 0, 0, 1200.00, 'Cash', 'Paid', 'completed', 1, 'CRM test sale')",
            [customerId]
        );
        const saleId = saleRes.insertId;

        // ===== TEST: Fetch Customer Purchase History =====
        console.log('🔍 Simulating CRM customer purchase history query...');
        const [history] = await conn.query(
            `SELECT id, invoice_number, sale_date, subtotal, tax_amount, discount_amount, total_amount, payment_method, payment_status 
             FROM sales 
             WHERE customer_id = ? 
             ORDER BY sale_date DESC`,
            [customerId]
        );

        if (history.length !== 1) {
            throw new Error(`Customer history count mismatch: expected 1, found ${history.length}`);
        }

        const invoice = history[0];
        if (invoice.invoice_number !== 'INV-CRM-0001' || Number(invoice.total_amount) !== 1200) {
            throw new Error(`Invoice details mismatch: expected INV-CRM-0001 with total 1200, got ${invoice.invoice_number} with ${invoice.total_amount}`);
        }

        console.log('   ✓ Purchase history details successfully verified!');
        console.log('\n🎉 ALL CUSTOMER CRM TEST ASSERTIONS PASSED SUCCESSFULLY!');

    } catch (err) {
        console.error('\n❌ Test failed:', err);
    } finally {
        console.log('🧹 Rolling back database transaction...');
        await conn.rollback();
        await conn.end();
    }
}

testCustomerCRM();
