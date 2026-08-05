import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'autora_pos_db',
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Full list of permissions including full wildcard '*' and domain wildcards
const adminPermissions = [
    '*',
    'users:*',
    'items:*',
    'categories:*',
    'suppliers:*',
    'customers:*',
    'po:*',
    'grn:*',
    'transfers:*',
    'adjustments:*',
    'returns:*',
    'sales:*',
    'reports:*',
    'settings:*',
    'quotations:*',
    'backups:*',
    'expenses:*',
    'petty_cash:*'
];

async function grantAdminPermissions() {
    console.log(`🔌 Connecting to MySQL database '${dbConfig.database}' at ${dbConfig.host}...`);
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Ensure roles table exists
        await connection.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                description VARCHAR(255),
                is_system BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Ensure role_permissions table exists
        await connection.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role_id INT NOT NULL,
                permission VARCHAR(100) NOT NULL,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                UNIQUE KEY unique_role_permission (role_id, permission)
            )
        `);

        // 3. Get or insert Admin role
        const [roles] = await connection.query('SELECT id FROM roles WHERE LOWER(name) = "admin"');
        let adminRoleId;

        if (roles.length === 0) {
            console.log('➕ Creating "Admin" role...');
            const [result] = await connection.query(
                'INSERT INTO roles (name, description, is_system) VALUES (?, ?, ?)',
                ['Admin', 'System Administrator with full permissions', true]
            );
            adminRoleId = result.insertId;
        } else {
            adminRoleId = roles[0].id;
            console.log(`ℹ️ Found existing Admin role with ID: ${adminRoleId}`);
        }

        // 4. Clear old permissions for Admin role to ensure clean state
        await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [adminRoleId]);

        // 5. Insert all admin permissions
        const values = adminPermissions.map(p => [adminRoleId, p]);
        await connection.query(
            'INSERT INTO role_permissions (role_id, permission) VALUES ?',
            [values]
        );

        console.log(`✅ Assigned ${adminPermissions.length} full admin permissions to "Admin" role.`);

        // 6. Normalize user role names in `users` table to "Admin"
        const [updateResult] = await connection.query(
            "UPDATE users SET role = 'Admin' WHERE LOWER(role) = 'admin'"
        );
        console.log(`👤 Updated ${updateResult.affectedRows} admin user account(s) to 'Admin' role.`);

        await connection.commit();
        console.log('🎉 All permissions have been granted to Admin users successfully!');
        process.exit(0);

    } catch (error) {
        await connection.rollback();
        console.error('❌ Failed to grant permissions to Admin users:', error);
        process.exit(1);
    } finally {
        connection.release();
        await pool.end();
    }
}

grantAdminPermissions();
