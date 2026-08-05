import { query } from '../server/config/database.js';

const tablesToTruncate = [
    'adjustment_batch_items',
    'audit_logs',
    'batch_consumption',
    'carts',
    'grn',
    'grn_items',
    'inventory',
    'inventory_batches',
    'monthly_costs',
    'monthly_sales_targets',
    'operator_monthly_targets',
    'po_items',
    'po_payments',
    'production',
    'purchase_orders',
    'quotation_items',
    'quotations',
    'sale_item_batches',
    'sale_items',
    'sale_operators',
    'sale_payments',
    'sales',
    'sales_person_monthly_targets',
    'stock_adjustments',
    'stock_ledger',
    'stock_transfers',
    'transfer_items'
];

async function runClean() {
    console.log('⚠️ Starting database transaction & inventory clean...');
    try {
        await query('SET FOREIGN_KEY_CHECKS = 0', []);
        
        for (const table of tablesToTruncate) {
            console.log(`🧹 Truncating table: ${table}`);
            await query(`TRUNCATE TABLE \`${table}\``, []);
        }

        await query('SET FOREIGN_KEY_CHECKS = 1', []);
        console.log('✅ All sale, quotation, production, purchase and inventory transactional tables truncated successfully.');
        console.log('ℹ️ Master data tables (users, items, categories, suppliers, locations, operators, sales_persons, uoms, and system settings) were preserved.');
    } catch (error) {
        console.error('❌ Error during truncation:', error);
    } finally {
        process.exit();
    }
}

runClean();
