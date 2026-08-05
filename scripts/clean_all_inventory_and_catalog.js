import pool from '../server/config/database.js';

/**
 * Full Clean Script: Inventory, Sales, POs, GRNs, Items, Categories & Suppliers.
 * Preserves Core System Setup: Users, Locations, Roles, System Settings, UOMs.
 */

const tablesToTruncate = [
    // Transaction & Operations Data
    'adjustment_batch_items',
    'audit_logs',
    'batch_consumption',
    'bom_items',
    'bom',
    'carts',
    'grn_items',
    'grn',
    'inventory_batches',
    'inventory',
    'po_items',
    'po_payments',
    'purchase_orders',
    'production',
    'quotation_items',
    'quotations',
    'sale_item_batches',
    'sale_items',
    'sale_operators',
    'sale_payments',
    'sales',
    'stock_adjustments',
    'stock_ledger',
    'stock_transfers',
    'transfer_items',
    'monthly_costs',
    'monthly_sales_targets',
    'operator_monthly_targets',
    'sales_person_monthly_targets',

    // Item & Catalog Data
    'items',
    'categories',
    'suppliers'
];

async function runClean() {
    console.log('⚠️  STARTING FULL INVENTORY & CATALOG DATA CLEANUP...');
    console.log('----------------------------------------------------');
    
    try {
        // Disable foreign key constraints temporarily
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        
        for (const table of tablesToTruncate) {
            console.log(`🧹 Truncating table: ${table}`);
            await pool.query(`TRUNCATE TABLE \`${table}\``);
        }

        // Re-enable foreign key constraints
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('----------------------------------------------------');
        console.log('✅ CLEANUP COMPLETE!');
        console.log('✨ Cleared: Sales, Orders, GRNs, Inventory, Items, Categories, Suppliers.');
        console.log('🔒 Preserved: Users, Locations, UOMs, Roles, System Settings.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

runClean();
