import { query } from '../server/config/database.js';

async function migrate() {
    try {
        console.log('Creating petty_cash_categories table...');

        await query(`
            CREATE TABLE IF NOT EXISTS \`petty_cash_categories\` (
                \`id\` int NOT NULL AUTO_INCREMENT,
                \`name\` varchar(100) NOT NULL UNIQUE,
                \`description\` varchar(255) DEFAULT NULL,
                \`is_active\` tinyint(1) DEFAULT '1',
                \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `, []);

        console.log('Seeding default petty cash categories...');

        const defaultCategories = [
            { name: 'Transport / Travel', description: 'Taxi, fuel, bus, vehicle expenses' },
            { name: 'Stationery / Office Supplies', description: 'Pens, paper, printer cartridges, office items' },
            { name: 'Refreshments / Food', description: 'Tea, coffee, snacks, staff meals' },
            { name: 'Repairs / Maintenance', description: 'Office, machinery, or shop repairs' },
            { name: 'Courier / Postage', description: 'Postal, delivery, courier charges' },
            { name: 'Other Expenses', description: 'Miscellaneous petty cash expenses' }
        ];

        for (const cat of defaultCategories) {
            await query(`
                INSERT INTO petty_cash_categories (name, description)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE description = VALUES(description)
            `, [cat.name, cat.description]);
        }

        console.log('✅ Petty cash categories table created and seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
