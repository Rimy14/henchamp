/**
 * FreeRADIUS Database Pool
 *
 * A second connection pool pointed at the FreeRADIUS schema
 * (`henchamp_radius`), kept separate from the application pool in
 * config/database.js.
 *
 * Why two databases on one server:
 *   * FreeRADIUS owns its schema and replaces it on upgrade. Merging it into
 *     henchamp_pos_db would mean an upgrade could drop our data.
 *   * The RADIUS DB user can then be restricted to localhost with no access
 *     to application tables — relevant because radcheck necessarily holds
 *     Cleartext-Password (see services/isp/crypto.js for why).
 *   * It keeps the boundary honest: these tables are an integration surface
 *     shared with another process, not ours to reshape.
 *
 * Same MySQL instance, so there is no distributed-transaction problem — but
 * a single transaction still cannot span both schemas through two separate
 * pools, which is why provisioning writes RADIUS rows inside their own
 * transaction and reconciles rather than assuming atomicity across both.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
    host: process.env.RADIUS_DB_HOST || process.env.DB_HOST || 'localhost',
    user: process.env.RADIUS_DB_USER || process.env.DB_USER || 'root',
    password: process.env.RADIUS_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.RADIUS_DB_NAME || 'henchamp_radius',
    port: parseInt(process.env.RADIUS_DB_PORT || process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: parseInt(process.env.RADIUS_DB_CONNECTION_LIMIT || '5'),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // Must match the application pool. radacct timestamps are written by
    // FreeRADIUS and read by us; a mismatch here silently shifts every
    // session time and corrupts usage-by-day rollups.
    timezone: process.env.DB_TIMEZONE || '+03:00'
});

/**
 * Verify the RADIUS database is reachable and has the expected schema.
 * Called at boot so a misconfiguration surfaces immediately rather than on
 * the first subscriber provisioning attempt.
 *
 * @returns {Promise<boolean>}
 */
const testRadiusConnection = async () => {
    try {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(
                `SELECT COUNT(*) AS n FROM information_schema.tables
                  WHERE table_schema = DATABASE()
                    AND table_name IN ('radcheck','radreply','radgroupcheck',
                                       'radgroupreply','radusergroup','radacct','nas')`
            );
            if (rows[0].n < 7) {
                console.error(
                    `❌ RADIUS database is reachable but incomplete (${rows[0].n}/7 tables). ` +
                    `Run: node scripts/isp/run_isp_migrations.js`
                );
                return false;
            }
            console.log('✅ RADIUS database connected successfully');
            return true;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('❌ RADIUS database connection failed:', error.message);
        return false;
    }
};

/**
 * Execute a query against the RADIUS database.
 * Mirrors the helper in config/database.js so call sites read the same.
 */
const radiusQuery = async (sql, params) => {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('RADIUS query error:', error);
        throw error;
    }
};

/**
 * Run a callback inside a RADIUS-database transaction.
 * The callback receives the connection; use connection.execute().
 */
const radiusTransaction = async (callback) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

export { pool, radiusQuery, radiusTransaction, testRadiusConnection };
export default pool;
