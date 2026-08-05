import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function importDatabase() {
    const host = process.env.DB_HOST || 'localhost';
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'autora_pos_db';
    const port = parseInt(process.env.DB_PORT || '3306');

    console.log(`🔌 Connecting to MySQL server at ${host}:${port} as ${user}...`);

    let connection;
    try {
        // Step 1: Connect without selecting a DB to ensure DB exists
        connection = await mysql.createConnection({
            host,
            user,
            password,
            port,
            multipleStatements: true
        });

        console.log(`📦 Creating database '${database}' if it doesn't exist...`);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await connection.query(`USE \`${database}\`;`);

        // Step 2: Read schema.sql
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at: ${schemaPath}`);
        }

        console.log(`📜 Reading SQL schema file from database/schema.sql...`);
        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log(`⏳ Executing schema import into '${database}'... (this may take a few seconds)`);
        await connection.query(sql);

        console.log(`✅ Database '${database}' successfully imported from schema.sql!`);

        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to import database schema:', error);
        if (connection) {
            await connection.end();
        }
        process.exit(1);
    }
}

importDatabase();
