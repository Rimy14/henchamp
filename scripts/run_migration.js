/**
 * DB Migration Script
 * Imports autora_db.sql into henchamp_pos_db
 * Usage: node scripts/run_migration.js
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile   = path.join(__dirname, '..', 'database', 'autora_db.sql');

const host     = process.env.DB_HOST || 'localhost';
const port     = process.env.DB_PORT || '3306';
const user     = process.env.DB_USER || 'root';
const database = process.env.DB_NAME || 'henchamp_pos_db';

console.log('\n🚀  HenChamp POS — DB Migration');
console.log('================================');
console.log(`📂  SQL File : ${sqlFile}`);
console.log(`🌐  Host     : ${host}:${port}`);
console.log(`🗄️  Database : ${database}`);
console.log(`👤  User     : ${user}\n`);

if (!existsSync(sqlFile)) {
    console.error(`❌  SQL file not found: ${sqlFile}`);
    process.exit(1);
}

// Prompt for MySQL password securely (hides input)
function promptPassword(prompt) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });

        // Hide typed characters
        process.stdout.write(prompt);
        process.stdin.setRawMode?.(true);

        let password = '';
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        const onData = (char) => {
            if (char === '\n' || char === '\r' || char === '\u0004') {
                process.stdin.setRawMode?.(false);
                process.stdin.removeListener('data', onData);
                rl.close();
                console.log(''); // newline after hidden input
                resolve(password);
            } else if (char === '\u0003') {
                process.exit(); // Ctrl+C
            } else if (char === '\u007f') {
                password = password.slice(0, -1); // Backspace
            } else {
                password += char;
            }
        };

        process.stdin.on('data', onData);
    });
}

async function runMigration() {
    let password = process.env.DB_PASSWORD || '';

    // If password is empty or was explicitly wrong, prompt interactively
    if (!password) {
        password = await promptPassword(`🔑  MySQL password for '${user}' (leave blank if none): `);
    }

    const runCmd = (pwd) => {
        execSync(
            `mysql -h ${host} -P ${port} -u ${user} ${database} < "${sqlFile}"`,
            {
                stdio: 'inherit',
                shell: true,
                env: { ...process.env, MYSQL_PWD: pwd }, // secure: avoids CLI password warning
            }
        );
    };

    try {
        console.log('⏳  Running migration...\n');
        runCmd(password);
        console.log('\n✅  Migration completed successfully!');
        console.log(`    Database "${database}" is ready.\n`);
    } catch {
        // First attempt failed — prompt for password if it wasn't already prompted
        if (process.env.DB_PASSWORD !== undefined && process.env.DB_PASSWORD !== '') {
            console.log('\n⚠️   Password from .env failed. Please enter it manually:');
            const manualPwd = await promptPassword(`🔑  MySQL password for '${user}': `);
            try {
                console.log('\n⏳  Retrying migration...\n');
                runCmd(manualPwd);
                console.log('\n✅  Migration completed successfully!');
                console.log(`    Database "${database}" is ready.\n`);
                console.log(`💡  Tip: Update DB_PASSWORD in your .env file with the correct password.\n`);
            } catch (err2) {
                console.error('\n❌  Migration failed!');
                console.error('    Check that MySQL is running and the user has access to:', database);
                process.exit(1);
            }
        } else {
            console.error('\n❌  Migration failed!');
            console.error('    Check that MySQL is running and the user has access to:', database);
            process.exit(1);
        }
    }
}

runMigration();
