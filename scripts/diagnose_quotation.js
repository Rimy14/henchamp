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

async function diagnose() {
    console.log('🔍 Starting diagnostic query for QT-20260805-8259...');
    const conn = await mysql.createConnection(dbConfig);
    try {
        // 1. Get quotation
        const [quotes] = await conn.query("SELECT * FROM quotations WHERE quote_number = 'QT-20260805-8259'");
        console.log('📜 Quotation:', quotes);

        if (quotes.length === 0) {
            console.log('❌ Quotation not found.');
            return;
        }
        const quoteId = quotes[0].id;

        // 2. Get quotation items
        const [quoteItems] = await conn.query("SELECT * FROM quotation_items WHERE quotation_id = ?", [quoteId]);
        console.log('📦 Quotation Items:', quoteItems);

        // 3. Get created sales
        const [sales] = await conn.query("SELECT * FROM sales WHERE notes LIKE ?", [`%${quotes[0].quote_number}%`]);
        console.log('💵 Sales Invoice:', sales);

        if (sales.length > 0) {
            const saleId = sales[0].id;

            // 4. Get sale items
            const [saleItems] = await conn.query("SELECT * FROM sale_items WHERE sale_id = ?", [saleId]);
            console.log('🏷️ Sale Items:', saleItems);

            // 5. Get sale item batches
            for (const sItem of saleItems) {
                const [itemBatches] = await conn.query("SELECT * FROM sale_item_batches WHERE sale_item_id = ?", [sItem.id]);
                console.log(`📦 Sale Item ${sItem.id} Batches:`, itemBatches);
            }

            // 6. Get stock ledger
            const [ledger] = await conn.query("SELECT * FROM stock_ledger WHERE reference_id = ?", [saleId]);
            console.log('📊 Stock Ledger entries:', ledger);
        }

        // 7. Get inventory levels for item
        for (const qItem of quoteItems) {
            if (qItem.item_id) {
                const [inv] = await conn.query("SELECT * FROM inventory WHERE item_id = ?", [qItem.item_id]);
                console.log(`📈 Current Inventory levels for Item #${qItem.item_id}:`, inv);

                const [batches] = await conn.query("SELECT * FROM inventory_batches WHERE item_id = ?", [qItem.item_id]);
                console.log(`📦 Batches for Item #${qItem.item_id}:`, batches);
            }
        }

    } catch (err) {
        console.error('Error during diagnostics:', err);
    } finally {
        await conn.end();
    }
}

diagnose();
