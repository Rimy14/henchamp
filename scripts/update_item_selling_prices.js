import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'autora_pos_db',
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const MARKUP_FACTOR = 2.5; // Selling price = 2.5 * Cost price

async function updateSellingPrices() {
    console.log(`🔌 Connecting to MySQL database '${dbConfig.database}' at ${dbConfig.host}...`);
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Fetch all items
        const [items] = await connection.query('SELECT id, code, name, tax_rate, tax_type FROM items');
        console.log(`📋 Found ${items.length} total items in database.`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const item of items) {
            let costPrice = 0;

            // Strategy A: Latest inventory batch cost
            const [batches] = await connection.query(
                `SELECT cost_per_unit 
                 FROM inventory_batches 
                 WHERE item_id = ? 
                 ORDER BY received_date DESC, id DESC 
                 LIMIT 1`,
                [item.id]
            );

            if (batches.length > 0 && parseFloat(batches[0].cost_per_unit) > 0) {
                costPrice = parseFloat(batches[0].cost_per_unit);
            } else {
                // Strategy B: Latest GRN item cost
                try {
                    const [grnItems] = await connection.query(
                        `SELECT unit_cost 
                         FROM grn_items 
                         WHERE item_id = ? 
                         ORDER BY id DESC 
                         LIMIT 1`,
                        [item.id]
                    );

                    if (grnItems.length > 0 && parseFloat(grnItems[0].unit_cost) > 0) {
                        costPrice = parseFloat(grnItems[0].unit_cost);
                    }
                } catch (e) {
                    // Ignore if table missing
                }

                if (costPrice === 0) {
                    // Strategy C: Latest Purchase Order item cost (po_items)
                    try {
                        const [poItems] = await connection.query(
                            `SELECT unit_price 
                             FROM po_items 
                             WHERE item_id = ? 
                             ORDER BY id DESC 
                             LIMIT 1`,
                            [item.id]
                        );

                        if (poItems.length > 0 && parseFloat(poItems[0].unit_price) > 0) {
                            costPrice = parseFloat(poItems[0].unit_price);
                        }
                    } catch (e) {
                        // Ignore if table missing
                    }
                }
            }

            if (costPrice > 0) {
                const newSellingPrice = parseFloat((costPrice * MARKUP_FACTOR).toFixed(2));
                const taxRateNum = parseFloat(item.tax_rate) || 0;
                const taxTypeVal = item.tax_type || 'exclusive';

                let priceExcl = newSellingPrice;
                let priceIncl = newSellingPrice;

                if (taxTypeVal === 'inclusive') {
                    priceIncl = newSellingPrice;
                    priceExcl = taxRateNum > 0 ? parseFloat((priceIncl / (1 + taxRateNum / 100)).toFixed(2)) : priceIncl;
                } else {
                    priceExcl = newSellingPrice;
                    priceIncl = parseFloat((priceExcl * (1 + taxRateNum / 100)).toFixed(2));
                }

                await connection.query(
                    `UPDATE items 
                     SET selling_price = ?, 
                         selling_price_excl_tax = ?, 
                         selling_price_incl_tax = ?, 
                         updated_at = NOW() 
                     WHERE id = ?`,
                    [newSellingPrice, priceExcl, priceIncl, item.id]
                );

                updatedCount++;
                console.log(`  [UPDATED] ${item.code} (${item.name}): Cost = ${costPrice.toFixed(2)} -> Selling Price (2.5x) = ${newSellingPrice.toFixed(2)}`);
            } else {
                skippedCount++;
            }
        }

        await connection.commit();
        console.log(`\n🎉 Successfully updated selling prices for ${updatedCount} items (Skipped ${skippedCount} items with 0 cost price).`);
        process.exit(0);

    } catch (error) {
        await connection.rollback();
        console.error('❌ Failed to update selling prices:', error);
        process.exit(1);
    } finally {
        connection.release();
        await pool.end();
    }
}

updateSellingPrices();
