import pool from '../server/config/database.js';

async function migrate() {
    try {
        console.log('Creating units_of_measure table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS units_of_measure (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                short_name VARCHAR(10) NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ Table created successfully');

        const initialUnits = [
            ['Pieces', 'pcs'],
            ['Kilograms', 'kg'],
            ['Liters', 'ltr'],
            ['Meters', 'mtr'],
            ['Box', 'box'],
            ['Set', 'set'],
            ['Square Feet', 'sqft'],
            ['Feet', 'ft'],
            ['Numbers', 'nos'],
            ['Milliliters', 'ml']
        ];

        console.log('Inserting initial units...');
        for (const [name, short_name] of initialUnits) {
            await pool.query(
                'INSERT IGNORE INTO units_of_measure (name, short_name) VALUES (?, ?)',
                [name, short_name]
            );
        }
        console.log('✅ Initial units inserted successfully');

        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
