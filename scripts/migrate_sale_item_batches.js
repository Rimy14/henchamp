import pool from '../server/config/database.js';

async function migrate() {
    try {
        console.log('Creating sale_item_batches table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sale_item_batches (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_item_id INT NOT NULL,
                batch_id INT NOT NULL,
                quantity DECIMAL(10,2) NOT NULL,
                cost_price DECIMAL(10,4) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
                FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('✅ Table sale_item_batches created successfully');
        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
