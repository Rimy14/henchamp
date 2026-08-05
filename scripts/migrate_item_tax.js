import { query } from '../server/config/database.js';

export async function migrateItemTax() {
    try {
        console.log('Migrating database schema for Item-Level Tax System...');

        // 1. Alter items table
        try {
            const itemCols = await query(`SHOW COLUMNS FROM \`items\` LIKE 'tax_rate'`, []);
            if (itemCols.length === 0) {
                await query(`
                    ALTER TABLE \`items\`
                    ADD COLUMN \`tax_rate\` decimal(5,2) DEFAULT '0.00' AFTER \`selling_price\`,
                    ADD COLUMN \`tax_type\` enum('exclusive','inclusive') DEFAULT 'exclusive' AFTER \`tax_rate\`,
                    ADD COLUMN \`selling_price_excl_tax\` decimal(15,2) DEFAULT NULL AFTER \`tax_type\`,
                    ADD COLUMN \`selling_price_incl_tax\` decimal(15,2) DEFAULT NULL AFTER \`selling_price_excl_tax\`;
                `, []);
                console.log('Added tax columns to items table');

                // Backfill existing items
                await query(`
                    UPDATE \`items\` 
                    SET \`selling_price_excl_tax\` = \`selling_price\`,
                        \`selling_price_incl_tax\` = \`selling_price\` * (1 + COALESCE(\`tax_rate\`, 0) / 100)
                    WHERE \`selling_price_excl_tax\` IS NULL;
                `, []);
                console.log('Backfilled tax price columns for existing items');
            }
        } catch (itemErr) {
            if (itemErr.code !== 'ER_DUP_FIELDNAME' && itemErr.errno !== 1060) {
                console.log('Notice on altering items table:', itemErr.message);
            }
        }

        // 2. Alter po_items table
        try {
            const poItemCols = await query(`SHOW COLUMNS FROM \`po_items\` LIKE 'tax_rate'`, []);
            if (poItemCols.length === 0) {
                await query(`
                    ALTER TABLE \`po_items\`
                    ADD COLUMN \`unit_price_excl_tax\` decimal(15,2) DEFAULT NULL AFTER \`unit_price\`,
                    ADD COLUMN \`tax_rate\` decimal(5,2) DEFAULT '0.00' AFTER \`unit_price_excl_tax\`,
                    ADD COLUMN \`tax_amount\` decimal(15,2) DEFAULT '0.00' AFTER \`tax_rate\`,
                    ADD COLUMN \`unit_price_incl_tax\` decimal(15,2) DEFAULT NULL AFTER \`tax_amount\`,
                    ADD COLUMN \`total_price_excl_tax\` decimal(15,2) DEFAULT NULL AFTER \`unit_price_incl_tax\`,
                    ADD COLUMN \`total_price_incl_tax\` decimal(15,2) DEFAULT NULL AFTER \`total_price_excl_tax\`;
                `, []);
                console.log('Added tax columns to po_items table');

                // Backfill existing po_items
                await query(`
                    UPDATE \`po_items\` 
                    SET \`unit_price_excl_tax\` = \`unit_price\`,
                        \`unit_price_incl_tax\` = \`unit_price\`,
                        \`total_price_excl_tax\` = \`total_price\`,
                        \`total_price_incl_tax\` = \`total_price\`
                    WHERE \`unit_price_excl_tax\` IS NULL;
                `, []);
                console.log('Backfilled tax columns for existing po_items');
            }
        } catch (poErr) {
            if (poErr.code !== 'ER_DUP_FIELDNAME' && poErr.errno !== 1060) {
                console.log('Notice on altering po_items table:', poErr.message);
            }
        }

        console.log('✅ Item-Level Tax System database migration complete!');
        return true;
    } catch (error) {
        console.error('❌ Migration failed for item tax system:', error);
        return false;
    }
}

// Allow running standalone
if (process.argv[1] && process.argv[1].includes('migrate_item_tax.js')) {
    migrateItemTax().then(() => process.exit(0)).catch(() => process.exit(1));
}
