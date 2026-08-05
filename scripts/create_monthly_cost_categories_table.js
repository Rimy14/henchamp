import { query } from '../server/config/database.js';

export async function migrateMonthlyCostCategories() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS \`monthly_cost_categories\` (
                \`id\` int NOT NULL AUTO_INCREMENT,
                \`name\` varchar(100) NOT NULL UNIQUE,
                \`description\` varchar(255) DEFAULT NULL,
                \`is_active\` tinyint(1) DEFAULT '1',
                \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `, []);

        // Check if category_id column already exists in monthly_costs
        try {
            const cols = await query(`SHOW COLUMNS FROM \`monthly_costs\` LIKE 'category_id'`, []);
            if (cols.length === 0) {
                await query(`
                    ALTER TABLE \`monthly_costs\`
                    ADD COLUMN \`category_id\` int DEFAULT NULL AFTER \`amount\`,
                    ADD COLUMN \`category\` varchar(100) DEFAULT NULL AFTER \`category_id\`;
                `, []);
            }
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME' && alterErr.errno !== 1060) {
                console.log('Notice on altering monthly_costs categories:', alterErr.message);
            }
        }

        // Check if is_voided column exists in monthly_costs
        try {
            const voidCols = await query(`SHOW COLUMNS FROM \`monthly_costs\` LIKE 'is_voided'`, []);
            if (voidCols.length === 0) {
                await query(`
                    ALTER TABLE \`monthly_costs\`
                    ADD COLUMN \`is_voided\` tinyint(1) DEFAULT '0',
                    ADD COLUMN \`void_reason\` varchar(255) DEFAULT NULL,
                    ADD COLUMN \`voided_at\` timestamp NULL DEFAULT NULL,
                    ADD COLUMN \`voided_by\` varchar(100) DEFAULT NULL;
                `, []);
                console.log('Added void tracking columns to monthly_costs table');
            }
        } catch (voidErr) {
            if (voidErr.code !== 'ER_DUP_FIELDNAME' && voidErr.errno !== 1060) {
                console.log('Notice on altering monthly_costs void columns:', voidErr.message);
            }
        }

        const defaultCategories = [
            { name: 'Rent & Facilities', description: 'Shop, warehouse, and office property lease' },
            { name: 'Utilities & Power', description: 'Electricity (CEB), water, gas bills' },
            { name: 'Salaries & Payroll', description: 'Staff wages, commissions, EPF/ETF contributions' },
            { name: 'Software & IT Services', description: 'Internet, phone bills, POS/cloud subscriptions' },
            { name: 'Marketing & Advertising', description: 'Social media ads, print flyers, promotional banners' },
            { name: 'Repairs & Maintenance', description: 'Equipment servicing, machinery and shop upkeep' },
            { name: 'Insurance & Taxes', description: 'Business liability insurance, municipal council rates' },
            { name: 'General Overhead', description: 'Miscellaneous recurring operational costs' }
        ];

        for (const cat of defaultCategories) {
            await query(`
                INSERT INTO monthly_cost_categories (name, description)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE description = VALUES(description)
            `, [cat.name, cat.description]);
        }

        return true;
    } catch (error) {
        console.error('❌ Migration failed for monthly_cost_categories:', error);
        return false;
    }
}

// Allow running standalone
if (process.argv[1] && process.argv[1].includes('create_monthly_cost_categories_table.js')) {
    migrateMonthlyCostCategories().then(() => process.exit(0)).catch(() => process.exit(1));
}
