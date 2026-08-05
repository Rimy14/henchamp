/**
 * ISP Migration Runner
 *
 * Creates the FreeRADIUS database + schema, then applies every
 * database/migrations/isp/*.sql file in filename order.
 *
 * All migrations are written to be idempotent (CREATE TABLE IF NOT EXISTS,
 * guarded INSERTs), so this is safe to re-run. It is the ISP counterpart to
 * the existing scripts/run_migration.js.
 *
 *   node scripts/isp/run_isp_migrations.js
 *   node scripts/isp/run_isp_migrations.js --verify   (report state, change nothing)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ISP_MIGRATIONS_DIR = path.join(ROOT, 'database/migrations/isp');
const RADIUS_SCHEMA = path.join(ROOT, 'database/freeradius/schema.sql');

const APP_DB = process.env.DB_NAME || 'henchamp_pos_db';
const RADIUS_DB = process.env.RADIUS_DB_NAME || 'henchamp_radius';

const ISP_TABLES = [
    'isp_packages', 'isp_subscribers', 'isp_subscriptions',
    'isp_voucher_batches', 'isp_vouchers',
    'isp_nas', 'isp_sessions',
    'isp_usage_daily', 'isp_audit_log', 'isp_job_state'
];

const RADIUS_TABLES = [
    'radacct', 'radcheck', 'radreply', 'radgroupcheck',
    'radgroupreply', 'radusergroup', 'radpostauth', 'nas'
];

const log = {
    info: (m) => console.log(`   ${m}`),
    ok: (m) => console.log(`✅ ${m}`),
    warn: (m) => console.log(`⚠️  ${m}`),
    err: (m) => console.error(`❌ ${m}`),
    head: (m) => console.log(`\n${m}\n${'─'.repeat(m.length)}`)
};

/**
 * Split a SQL file into individual statements.
 *
 * Naive `split(';')` breaks on semicolons inside strings and comments, which
 * our migrations do contain (comment text, ENUM values). This strips comments
 * and respects quoting instead.
 */
function splitStatements(sql) {
    const statements = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = sql[i + 1];

        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') { inBlockComment = false; i++; }
            continue;
        }
        if (!inSingle && !inDouble && !inBacktick) {
            if (ch === '-' && next === '-') { inLineComment = true; i++; continue; }
            if (ch === '#') { inLineComment = true; continue; }
            if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
        }

        if (ch === "'" && !inDouble && !inBacktick && sql[i - 1] !== '\\') inSingle = !inSingle;
        else if (ch === '"' && !inSingle && !inBacktick && sql[i - 1] !== '\\') inDouble = !inDouble;
        else if (ch === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;

        if (ch === ';' && !inSingle && !inDouble && !inBacktick) {
            const trimmed = current.trim();
            if (trimmed) statements.push(trimmed);
            current = '';
            continue;
        }
        current += ch;
    }

    const tail = current.trim();
    if (tail) statements.push(tail);
    return statements;
}

async function tablesIn(conn, database, expected) {
    const [rows] = await conn.query(
        `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?`,
        [database]
    );
    const present = new Set(rows.map((r) => r.t));
    return {
        present: expected.filter((t) => present.has(t)),
        missing: expected.filter((t) => !present.has(t))
    };
}

async function applyFile(conn, file, label) {
    const sql = await fs.readFile(file, 'utf8');
    const statements = splitStatements(sql);
    let executed = 0;

    for (const statement of statements) {
        try {
            await conn.query(statement);
            executed++;
        } catch (error) {
            log.err(`${label} — statement failed:`);
            console.error(statement.slice(0, 400));
            throw error;
        }
    }

    log.ok(`${label} (${executed} statement${executed === 1 ? '' : 's'})`);
}

async function verify(conn) {
    log.head('Verification');

    const app = await tablesIn(conn, APP_DB, ISP_TABLES);
    log.info(`${APP_DB}: ${app.present.length}/${ISP_TABLES.length} ISP tables`);
    if (app.missing.length) log.warn(`missing: ${app.missing.join(', ')}`);

    const radius = await tablesIn(conn, RADIUS_DB, RADIUS_TABLES);
    log.info(`${RADIUS_DB}: ${radius.present.length}/${RADIUS_TABLES.length} RADIUS tables`);
    if (radius.missing.length) log.warn(`missing: ${radius.missing.join(', ')}`);

    const [perms] = await conn.query(
        `SELECT r.name AS role, rp.permission
           FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
          WHERE rp.permission LIKE 'isp:%' ORDER BY r.name, rp.permission`,
        []
    );
    log.info(`ISP permissions seeded: ${perms.length}`);
    for (const p of perms) log.info(`  ${p.role.padEnd(12)} ${p.permission}`);

    const ok = app.missing.length === 0 && radius.missing.length === 0 && perms.length > 0;
    console.log('');
    if (ok) log.ok('All ISP migrations verified.');
    else log.err('Verification incomplete — re-run without --verify.');
    return ok;
}

async function main() {
    const verifyOnly = process.argv.includes('--verify');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: false
    });

    try {
        // Confirm the base schema exists — the ISP tables have foreign keys
        // into customers and users, so importing out of order fails with a
        // confusing errno 1824 rather than an obvious message.
        const [baseCheck] = await conn.query(
            `SELECT table_name AS t FROM information_schema.tables
              WHERE table_schema = ? AND table_name IN ('users','customers')`,
            [APP_DB]
        );
        if (baseCheck.length < 2) {
            log.err(
                `Base schema missing from ${APP_DB}. ISP tables have foreign keys into ` +
                `users and customers.\n   Import it first:\n` +
                `   docker exec -i henchamp-mysql mysql -uroot -p<pass> ${APP_DB} < database/schema.sql`
            );
            process.exitCode = 1;
            return;
        }

        if (verifyOnly) {
            await conn.changeUser({ database: APP_DB });
            const ok = await verify(conn);
            process.exitCode = ok ? 0 : 1;
            return;
        }

        // --- FreeRADIUS database -------------------------------------------
        log.head('FreeRADIUS schema');
        await conn.query(
            `CREATE DATABASE IF NOT EXISTS \`${RADIUS_DB}\` ` +
            `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        log.ok(`database ${RADIUS_DB} ready`);
        await conn.changeUser({ database: RADIUS_DB });
        await applyFile(conn, RADIUS_SCHEMA, 'freeradius/schema.sql');

        // --- ISP migrations -------------------------------------------------
        log.head('ISP migrations');
        await conn.changeUser({ database: APP_DB });

        const files = (await fs.readdir(ISP_MIGRATIONS_DIR))
            .filter((f) => f.endsWith('.sql'))
            .sort();

        if (files.length === 0) {
            log.warn(`no .sql files in ${ISP_MIGRATIONS_DIR}`);
        }

        for (const file of files) {
            await applyFile(conn, path.join(ISP_MIGRATIONS_DIR, file), file);
        }

        const ok = await verify(conn);
        process.exitCode = ok ? 0 : 1;
    } catch (error) {
        log.err(`Migration failed: ${error.message}`);
        if (error.sqlMessage) log.err(`SQL: ${error.sqlMessage}`);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
}

main();
