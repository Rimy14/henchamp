import pool from '../server/config/database.js';

async function migrateItemCodes() {
    try {
        console.log('🔄 Running migration: Standardizing all existing item codes to ITEM-#### format...');

        // Fetch all items sorted by ID
        const [items] = await pool.query('SELECT id, code, name FROM items ORDER BY id ASC');

        if (items.length === 0) {
            console.log('ℹ️ No items found in database.');
            process.exit(0);
        }

        console.log(`Found ${items.length} items to standardize...`);

        // First pass: Temporary prefix to prevent duplicate key errors during swap
        for (let i = 0; i < items.length; i++) {
            const tempCode = `TEMP-${items[i].id}-${Date.now()}`;
            await pool.query('UPDATE items SET code = ? WHERE id = ?', [tempCode, items[i].id]);
        }

        // Second pass: Update to final ITEM-#### format sequentially
        for (let i = 0; i < items.length; i++) {
            const nextNumber = i + 1;
            const newCode = `ITEM-${String(nextNumber).padStart(4, '0')}`;
            const oldCode = items[i].code;

            await pool.query('UPDATE items SET code = ? WHERE id = ?', [newCode, items[i].id]);
            console.log(`  -> Item ID ${items[i].id} ("${items[i].name}") updated: '${oldCode}' -> '${newCode}'`);
        }

        console.log('🎉 Item codes migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrateItemCodes();
