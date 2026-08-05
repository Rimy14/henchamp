import pool from '../server/config/database.js';

async function migrate() {
    try {
        console.log('Starting Petty Cash database migration...');

        // 1. Create petty_cash_funds table if not exists
        console.log('Creating petty_cash_funds table if not exists...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS \`petty_cash_funds\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`reference_no\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
              \`opened_by\` int NOT NULL,
              \`opened_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
              \`opening_balance\` decimal(12,2) NOT NULL,
              \`current_balance\` decimal(12,2) NOT NULL,
              \`status\` enum('open','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
              \`closed_by\` int DEFAULT NULL,
              \`closed_at\` datetime DEFAULT NULL,
              \`closing_note\` text COLLATE utf8mb4_unicode_ci,
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (\`id\`),
              UNIQUE KEY \`reference_no_UNIQUE\` (\`reference_no\`),
              KEY \`fk_pcf_opened_by_idx\` (\`opened_by\`),
              KEY \`fk_pcf_closed_by_idx\` (\`closed_by\`),
              CONSTRAINT \`fk_pcf_closed_by\` FOREIGN KEY (\`closed_by\`) REFERENCES \`users\` (\`id\`),
              CONSTRAINT \`fk_pcf_opened_by\` FOREIGN KEY (\`opened_by\`) REFERENCES \`users\` (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ petty_cash_funds table created/verified successfully.');

        // 2. Create petty_cash_transactions table if not exists
        console.log('Creating petty_cash_transactions table if not exists...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS \`petty_cash_transactions\` (
              \`id\` int NOT NULL AUTO_INCREMENT,
              \`fund_id\` int NOT NULL,
              \`type\` enum('replenishment','disbursement') COLLATE utf8mb4_unicode_ci NOT NULL,
              \`category\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`description\` text COLLATE utf8mb4_unicode_ci NOT NULL,
              \`amount\` decimal(12,2) NOT NULL,
              \`balance_after\` decimal(12,2) NOT NULL,
              \`reference_no\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
              \`transaction_date\` date NOT NULL,
              \`recorded_by\` int NOT NULL,
              \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
              \`is_voided\` tinyint(1) DEFAULT '0',
              \`void_reason\` text COLLATE utf8mb4_unicode_ci,
              PRIMARY KEY (\`id\`),
              KEY \`fk_pct_fund_idx\` (\`fund_id\`),
              KEY \`fk_pct_recorded_by_idx\` (\`recorded_by\`),
              CONSTRAINT \`fk_pct_fund\` FOREIGN KEY (\`fund_id\`) REFERENCES \`petty_cash_funds\` (\`id\`) ON DELETE CASCADE,
              CONSTRAINT \`fk_pct_recorded_by\` FOREIGN KEY (\`recorded_by\`) REFERENCES \`users\` (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ petty_cash_transactions table created/verified successfully.');

        console.log('🎉 Petty cash migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
