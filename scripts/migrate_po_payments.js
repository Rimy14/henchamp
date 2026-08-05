import pool from '../server/config/database.js';

async function migrate() {
    try {
        console.log('Starting PO Payments database migration...');

        // Helper to check if a column exists
        const columnExists = async (table, column) => {
            const [rows] = await pool.query(
                `SELECT COUNT(*) AS count 
                 FROM INFORMATION_SCHEMA.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = ? 
                 AND COLUMN_NAME = ?`,
                [table, column]
            );
            return rows[0].count > 0;
        };

        // 1. Add payment_status column if not exists
        if (!(await columnExists('purchase_orders', 'payment_status'))) {
            console.log("Adding 'payment_status' column to purchase_orders...");
            await pool.query(
                `ALTER TABLE purchase_orders 
                 ADD COLUMN payment_status ENUM('unpaid', 'partial', 'paid') NOT NULL DEFAULT 'unpaid'`
            );
            console.log("✅ 'payment_status' column added successfully.");
        } else {
            console.log("Column 'payment_status' already exists on purchase_orders.");
        }

        // 2. Add paid_amount column if not exists
        if (!(await columnExists('purchase_orders', 'paid_amount'))) {
            console.log("Adding 'paid_amount' column to purchase_orders...");
            await pool.query(
                `ALTER TABLE purchase_orders 
                 ADD COLUMN paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00`
            );
            console.log("✅ 'paid_amount' column added successfully.");
        } else {
            console.log("Column 'paid_amount' already exists on purchase_orders.");
        }

        // 3. Add due_date column if not exists
        if (!(await columnExists('purchase_orders', 'due_date'))) {
            console.log("Adding 'due_date' column to purchase_orders...");
            await pool.query(
                `ALTER TABLE purchase_orders 
                 ADD COLUMN due_date DATE NULL`
            );
            console.log("✅ 'due_date' column added successfully.");
        } else {
            console.log("Column 'due_date' already exists on purchase_orders.");
        }

        // 4. Create po_payments table
        console.log('Creating po_payments table if not exists...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS po_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                po_id INT NOT NULL,
                supplier_id INT NOT NULL,
                payment_method VARCHAR(50) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                reference_number VARCHAR(100),
                notes TEXT,
                paid_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (po_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
                FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE,
                FOREIGN KEY (created_by) REFERENCES users (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log('✅ Table po_payments created or checked successfully.');

        // 5. Backfill due_date for existing POs based on Supplier payment terms or order date
        console.log('Backfilling due_date for existing POs...');
        // Let's fetch all purchase orders that have null due_date
        const [existingPOs] = await pool.query(
            `SELECT po.id, po.order_date, s.payment_terms 
             FROM purchase_orders po
             LEFT JOIN suppliers s ON po.supplier_id = s.id
             WHERE po.due_date IS NULL`
        );

        for (const po of existingPOs) {
            let termsDays = 0;
            if (po.payment_terms) {
                // Try parsing numbers out of payment terms (e.g. "Net 30" or "30 Days")
                const match = po.payment_terms.match(/\d+/);
                if (match) {
                    termsDays = parseInt(match[0]);
                }
            }

            const orderDate = new Date(po.order_date);
            orderDate.setDate(orderDate.getDate() + termsDays);
            const formattedDueDate = orderDate.toISOString().split('T')[0];

            await pool.query(
                'UPDATE purchase_orders SET due_date = ? WHERE id = ?',
                [formattedDueDate, po.id]
            );
        }
        console.log(`✅ Backfilled ${existingPOs.length} purchase orders with a calculated due_date.`);

        console.log('🎉 Database migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
