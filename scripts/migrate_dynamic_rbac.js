import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'digital_printing_erp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const initialPermissions = {
    Admin: [
        'users:*', 'items:*', 'categories:*', 'suppliers:*', 'customers:*',
        'po:*', 'grn:*', 'transfers:*', 'adjustments:*', 'returns:*',
        'sales:*', 'reports:*', 'settings:*', 'quotations:*'
    ],
    Coordinator: [
        'items:read', 'items:create', 'items:update',
        'categories:read', 'categories:create', 'categories:update',
        'suppliers:read', 'suppliers:create', 'suppliers:update',
        'po:read', 'po:create', 'po:update',
        'grn:read', 'grn:create',
        'transfers:*', 'adjustments:*', 'returns:*',
        'reports:read', 'reports:inventory', 'reports:purchase',
        'sales:*', 'customers:*',
        'quotations:read', 'quotations:create', 'quotations:delete'
    ],
    Cashier: [
        'items:read', 'customers:read', 'customers:create',
        'sales:*', 'reports:read', 'reports:sales'
    ]
};

async function migrate() {
    console.log('Starting Dynamic RBAC migration...');
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Create tables
        console.log('Creating roles table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                description VARCHAR(255),
                is_system BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Creating role_permissions table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role_id INT NOT NULL,
                permission VARCHAR(100) NOT NULL,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                UNIQUE KEY unique_role_permission (role_id, permission)
            )
        `);

        // 2. Insert default roles
        for (const [roleName, permissions] of Object.entries(initialPermissions)) {
            // Check if role exists
            const [existing] = await connection.query('SELECT id FROM roles WHERE name = ?', [roleName]);
            let roleId;

            if (existing.length === 0) {
                const desc = roleName === 'Admin' ? 'System Administrator' : 
                             roleName === 'Coordinator' ? 'Inventory & Operations Coordinator' : 
                             'Sales Cashier';
                const [result] = await connection.query(
                    'INSERT INTO roles (name, description, is_system) VALUES (?, ?, ?)',
                    [roleName, desc, true]
                );
                roleId = result.insertId;
                console.log(`Created role: ${roleName}`);
            } else {
                roleId = existing[0].id;
                console.log(`Role ${roleName} already exists, updating permissions...`);
            }

            // Delete old permissions to prevent duplicates
            await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

            // Insert new permissions
            if (permissions.length > 0) {
                const values = permissions.map(p => [roleId, p]);
                await connection.query(
                    'INSERT INTO role_permissions (role_id, permission) VALUES ?',
                    [values]
                );
                console.log(`Assigned ${permissions.length} permissions to ${roleName}`);
            }
        }

        await connection.commit();
        console.log('Migration completed successfully!');

    } catch (error) {
        await connection.rollback();
        console.error('Migration failed:', error);
    } finally {
        connection.release();
        await pool.end();
    }
}

migrate();
