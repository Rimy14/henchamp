import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetAndImportDatabase() {
    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'autora_pos_db';
    const port = parseInt(process.env.DB_PORT || '3306');

    console.log(`🔌 Connecting to MySQL server at ${host}:${port} as ${user}...`);

    let connection;
    try {
        connection = await mysql.createConnection({
            host,
            user,
            password,
            port,
            multipleStatements: true
        });

        // 1. DROP database if exists
        console.log(`⚠️ Dropping existing database '${database}' if it exists...`);
        await connection.query(`DROP DATABASE IF EXISTS \`${database}\`;`);

        // 2. CREATE database
        console.log(`✨ Creating fresh database '${database}'...`);
        await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await connection.query(`USE \`${database}\`;`);

        // 3. Locate SQL file (autora_db.sql prioritized)
        let sqlPath = path.join(__dirname, '..', 'database', 'autora_db.sql');
        if (!fs.existsSync(sqlPath)) {
            console.log(`⚠️ database/autora_db.sql not found, falling back to database/schema.sql...`);
            sqlPath = path.join(__dirname, '..', 'database', 'schema.sql');
        }

        if (!fs.existsSync(sqlPath)) {
            throw new Error(`No SQL import file found at ${sqlPath}`);
        }

        const relativePath = path.relative(path.join(__dirname, '..'), sqlPath);
        console.log(`📜 Reading SQL file from ${relativePath}...`);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log(`⏳ Executing database import into '${database}'... (this may take a few seconds)`);
        await connection.query(sql);

        console.log(`✅ Database '${database}' successfully created and imported from ${relativePath}!`);

        // 4. Ensure Admin permissions are granted
        console.log(`🔐 Ensuring Admin role and full permissions are configured...`);
        const adminPermissions = [
            '*', 'users:*', 'items:*', 'categories:*', 'suppliers:*', 'customers:*',
            'po:*', 'grn:*', 'transfers:*', 'adjustments:*', 'returns:*',
            'sales:*', 'reports:*', 'settings:*', 'quotations:*', 'backups:*',
            'expenses:*', 'petty_cash:*'
        ];

        // Ensure roles & role_permissions tables exist
        await connection.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                description VARCHAR(255),
                is_system BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role_id INT NOT NULL,
                permission VARCHAR(100) NOT NULL,
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                UNIQUE KEY unique_role_permission (role_id, permission)
            )
        `);

        // Get or insert Admin role
        const [roles] = await connection.query('SELECT id FROM roles WHERE LOWER(name) = "admin"');
        let adminRoleId;
        if (roles.length === 0) {
            const [result] = await connection.query(
                'INSERT INTO roles (name, description, is_system) VALUES (?, ?, ?)',
                ['Admin', 'System Administrator with full permissions', true]
            );
            adminRoleId = result.insertId;
        } else {
            adminRoleId = roles[0].id;
        }

        // Reset and insert permissions
        await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [adminRoleId]);
        const values = adminPermissions.map(p => [adminRoleId, p]);
        await connection.query('INSERT INTO role_permissions (role_id, permission) VALUES ?', [values]);
        await connection.query("UPDATE users SET role = 'Admin' WHERE LOWER(role) = 'admin'");

        console.log(`🎉 Complete database reset, import, and admin permission grant successful!`);

        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Database reset and import failed:', error);
        if (connection) {
            await connection.end();
        }
        process.exit(1);
    }
}

resetAndImportDatabase();
