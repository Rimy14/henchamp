/**
 * ISP Demo Seed
 *
 * Creates realistic Kenyan-market packages, subscribers, a router record and
 * a voucher batch so the module can be exercised by hand.
 *
 *   node scripts/isp/seed_isp_demo.js
 *   node scripts/isp/seed_isp_demo.js --reset   (wipe ISP data first)
 *
 * Idempotent: re-running updates rather than duplicating.
 *
 * Also sets a known password on the Admin user so the API can be logged into
 * locally. DEVELOPMENT ONLY — see the warning printed at the end.
 */

import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

const { query } = await import('../../server/config/database.js');
const { radiusQuery } = await import('../../server/config/radius-db.js');
const provisioning = await import('../../server/services/isp/provisioning.service.js');
const voucherService = await import('../../server/services/isp/voucher.service.js');
const nasService = await import('../../server/services/isp/nas.service.js');
const { encrypt, generateSecret } = await import('../../server/services/isp/crypto.js');

const DEV_ADMIN_PASSWORD = 'Admin@123';

const log = {
    info: (m) => console.log(`   ${m}`),
    ok: (m) => console.log(`✅ ${m}`),
    warn: (m) => console.log(`⚠️  ${m}`),
    head: (m) => console.log(`\n${m}\n${'─'.repeat(m.length)}`)
};

// =====================================================
// PACKAGES — priced for the Kenyan starter market
// =====================================================

const PACKAGES = [
    // --- Hotspot vouchers -------------------------------------------------
    {
        code: 'HS-1HR', name: 'Hotspot 1 Hour', service_type: 'hotspot',
        price: 20.00, validity_minutes: 60,
        rate_up_kbps: 1000, rate_down_kbps: 3000,
        data_cap_mb: null, simultaneous_use: 1,
        description: 'One hour of Wi-Fi, locked to a single device'
    },
    {
        code: 'HS-DAY', name: 'Hotspot Day Pass', service_type: 'hotspot',
        price: 50.00, validity_minutes: 1440,
        rate_up_kbps: 1000, rate_down_kbps: 5000,
        data_cap_mb: 2048, simultaneous_use: 1,
        description: '24 hours, 2 GB cap, single device'
    },
    {
        code: 'HS-WEEK', name: 'Hotspot Weekly', service_type: 'hotspot',
        price: 250.00, validity_minutes: 10080,
        rate_up_kbps: 2000, rate_down_kbps: 8000,
        // 20 GB — deliberately above the 4 GiB uint32 boundary so the
        // gigawords path is exercised by the seed data itself.
        data_cap_mb: 20480, simultaneous_use: 1,
        description: '7 days, 20 GB cap — exercises the >4 GiB gigawords path'
    },
    // --- PPPoE home plans -------------------------------------------------
    {
        code: 'PPP-HOME-5M', name: 'Home Basic 5 Mbps', service_type: 'pppoe',
        price: 1500.00, validity_days: 30,
        rate_up_kbps: 1000, rate_down_kbps: 5000,
        burst_up_kbps: 2000, burst_down_kbps: 8000, burst_time_seconds: 8,
        data_cap_mb: null, simultaneous_use: 1,
        description: 'Unlimited 5 Mbps home connection'
    },
    {
        code: 'PPP-HOME-10M', name: 'Home Plus 10 Mbps', service_type: 'pppoe',
        price: 2500.00, validity_days: 30,
        rate_up_kbps: 2000, rate_down_kbps: 10000,
        burst_up_kbps: 4000, burst_down_kbps: 20000, burst_time_seconds: 8,
        data_cap_mb: null, simultaneous_use: 1,
        description: 'Unlimited 10 Mbps home connection with burst'
    },
    {
        code: 'PPP-BIZ-20M', name: 'Business 20 Mbps', service_type: 'pppoe',
        price: 6000.00, validity_days: 30,
        rate_up_kbps: 10000, rate_down_kbps: 20000,
        data_cap_mb: null, simultaneous_use: 2,
        description: 'Business plan, two concurrent sessions'
    }
];

const SUBSCRIBERS = [
    { full_name: 'John Kamau',      phone: '254712345001', pkg: 'PPP-HOME-10M', status: 'active' },
    { full_name: 'Grace Wanjiru',   phone: '254712345002', pkg: 'PPP-HOME-5M',  status: 'active' },
    { full_name: 'Peter Otieno',    phone: '254712345003', pkg: 'PPP-HOME-10M', status: 'grace' },
    { full_name: 'Mary Achieng',    phone: '254712345004', pkg: 'PPP-HOME-5M',  status: 'suspended' },
    { full_name: 'Nairobi Cyber Cafe', phone: '254712345005', pkg: 'PPP-BIZ-20M', status: 'active' },
    { full_name: 'David Mwangi',    phone: '254712345006', pkg: 'PPP-HOME-5M',  status: 'pending' }
];

async function resetIspData() {
    log.head('Resetting ISP data');

    // Child tables first — foreign keys.
    for (const table of [
        'isp_usage_daily', 'isp_sessions', 'isp_audit_log', 'isp_job_state',
        'isp_vouchers', 'isp_voucher_batches', 'isp_subscriptions',
        'isp_subscribers', 'isp_nas', 'isp_packages'
    ]) {
        await query(`DELETE FROM ${table}`);
    }

    for (const table of ['radcheck', 'radreply', 'radgroupcheck', 'radgroupreply',
                         'radusergroup', 'radacct', 'radpostauth', 'nas']) {
        await radiusQuery(`DELETE FROM ${table}`);
    }

    log.ok('ISP and RADIUS tables cleared');
}

async function seedAdminPassword() {
    log.head('Development admin login');

    const hash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 10);
    const result = await query(
        `UPDATE users SET password_hash = ? WHERE username = 'Admin'`,
        [hash]
    );

    if (result.affectedRows > 0) {
        log.ok(`Admin password set to "${DEV_ADMIN_PASSWORD}"`);
    } else {
        log.warn('No user named "Admin" found — create one to use the API');
    }
}

async function seedPackages() {
    log.head('Packages');

    for (const pkg of PACKAGES) {
        const radiusGroup = `pkg_${pkg.code.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

        await query(
            `INSERT INTO isp_packages
                (code, name, description, service_type, price, currency,
                 validity_days, validity_minutes, rate_up_kbps, rate_down_kbps,
                 burst_up_kbps, burst_down_kbps, burst_time_seconds,
                 data_cap_mb, simultaneous_use, radius_group, status)
             VALUES (?, ?, ?, ?, ?, 'KES', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
             ON DUPLICATE KEY UPDATE
                name = VALUES(name), description = VALUES(description),
                price = VALUES(price), validity_days = VALUES(validity_days),
                validity_minutes = VALUES(validity_minutes),
                rate_up_kbps = VALUES(rate_up_kbps), rate_down_kbps = VALUES(rate_down_kbps),
                burst_up_kbps = VALUES(burst_up_kbps), burst_down_kbps = VALUES(burst_down_kbps),
                burst_time_seconds = VALUES(burst_time_seconds),
                data_cap_mb = VALUES(data_cap_mb), simultaneous_use = VALUES(simultaneous_use)`,
            [
                pkg.code, pkg.name, pkg.description, pkg.service_type, pkg.price,
                pkg.validity_days || null, pkg.validity_minutes || null,
                pkg.rate_up_kbps || null, pkg.rate_down_kbps || null,
                pkg.burst_up_kbps || null, pkg.burst_down_kbps || null,
                pkg.burst_time_seconds || null,
                pkg.data_cap_mb || null, pkg.simultaneous_use, radiusGroup
            ]
        );
    }

    const stored = await query(`SELECT * FROM isp_packages WHERE status = 'active'`);
    for (const pkg of stored) {
        await provisioning.provisionPackage(pkg);
        const cap = pkg.data_cap_mb ? `${(pkg.data_cap_mb / 1024).toFixed(0)} GB` : 'uncapped';
        log.info(`${pkg.code.padEnd(14)} ${String(pkg.rate_up_kbps || 0).padStart(6)}k up / ` +
                 `${String(pkg.rate_down_kbps || 0).padStart(6)}k down  ${cap}`);
    }

    log.ok(`${stored.length} packages seeded and provisioned into RADIUS`);
    return stored;
}

async function seedNas() {
    log.head('Router (NAS)');

    const existing = await query(`SELECT id FROM isp_nas WHERE shortname = 'chr-lab'`);
    if (existing.length > 0) {
        log.info('chr-lab already registered');
        return existing[0].id;
    }

    const nas = await nasService.upsertNas({
        name: 'CHR Lab Router',
        shortname: 'chr-lab',
        // 192.168.88.1 is the RouterOS factory default. Nothing is listening
        // in this environment, which is intentional: it exercises the
        // "router unreachable" path so that error handling is visible.
        nas_ip: '192.168.88.1',
        radius_secret: 'henchamp_radius_secret',
        api_host: '192.168.88.1',
        api_port: 443,
        api_user: 'admin',
        api_password: 'changeme',
        api_use_tls: 1,
        coa_port: 1700
    });

    log.ok(`Registered "${nas.shortname}" at ${nas.nas_ip} (in both app and FreeRADIUS)`);
    log.info('Not reachable in this environment — that is expected and exercises error handling');
    return nas.id;
}

async function seedSubscribers(packages) {
    log.head('Subscribers');

    const byCode = Object.fromEntries(packages.map((p) => [p.code, p]));
    const credentials = [];
    let index = 1;

    for (const spec of SUBSCRIBERS) {
        const pkg = byCode[spec.pkg];
        const code = `HC-ISP-${String(index).padStart(5, '0')}`;
        const username = spec.phone;
        const secret = generateSecret(16);

        const cycleStart = new Date();
        cycleStart.setDate(1);
        const cycleEnd = new Date(cycleStart);
        cycleEnd.setDate(cycleEnd.getDate() + (pkg.validity_days || 30));

        await query(
            `INSERT INTO isp_subscribers
                (subscriber_code, full_name, phone, service_type, radius_username,
                 radius_secret_enc, package_id, status, billing_cycle_start,
                 billing_cycle_end, installed_at)
             VALUES (?, ?, ?, 'pppoe', ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                full_name = VALUES(full_name), package_id = VALUES(package_id),
                status = VALUES(status)`,
            [
                code, spec.full_name, spec.phone, username, encrypt(secret),
                pkg.id, spec.status,
                cycleStart.toISOString().slice(0, 10),
                cycleEnd.toISOString().slice(0, 10)
            ]
        );

        const stored = (await query(
            'SELECT * FROM isp_subscribers WHERE subscriber_code = ?', [code]
        ))[0];

        await provisioning.provisionSubscriber(stored, pkg);

        // Reflect the seeded status in RADIUS, so a "suspended" seed row is
        // genuinely blocked rather than merely labelled.
        const radius = await import('../../server/services/isp/radius.service.js');
        if (['suspended', 'terminated'].includes(spec.status)) {
            await radius.blockUser(username);
        } else {
            await radius.unblockUser(username);
        }

        credentials.push({ code, name: spec.full_name, username, secret, status: spec.status, pkg: spec.pkg });
        log.info(`${code}  ${spec.full_name.padEnd(20)} ${spec.pkg.padEnd(14)} ${spec.status}`);
        index++;
    }

    log.ok(`${credentials.length} subscribers seeded and provisioned`);
    return credentials;
}

async function seedVouchers(packages) {
    log.head('Voucher batch');

    const dayPass = packages.find((p) => p.code === 'HS-DAY');
    const existing = await query('SELECT COUNT(*) AS n FROM isp_voucher_batches');

    if (existing[0].n > 0) {
        log.info('Voucher batches already exist — skipping');
        const codes = await query(
            'SELECT code, status, bound_mac FROM isp_vouchers ORDER BY id LIMIT 10'
        );
        return codes;
    }

    const result = await voucherService.generateBatch({
        packageId: dayPass.id,
        quantity: 10,
        codeLength: 8,
        userId: 1,
        notes: 'Demo seed batch'
    });

    log.ok(`Generated batch ${result.batch.batch_no} — ${result.vouchers.length} codes`);
    for (const v of result.vouchers.slice(0, 5)) {
        log.info(`  ${v.code}`);
    }
    log.info(`  ... and ${result.vouchers.length - 5} more`);

    return result.vouchers;
}

async function main() {
    try {
        if (process.argv.includes('--reset')) {
            await resetIspData();
        }

        await seedAdminPassword();
        const packages = await seedPackages();
        await seedNas();
        const subscribers = await seedSubscribers(packages);
        const vouchers = await seedVouchers(packages);

        log.head('Summary');
        log.info(`Packages     ${packages.length}`);
        log.info(`Subscribers  ${subscribers.length}`);
        log.info(`Vouchers     ${vouchers.length}`);
        log.info('');
        log.info('Log in at http://localhost:7001 with:');
        log.info(`   username: Admin`);
        log.info(`   password: ${DEV_ADMIN_PASSWORD}`);
        log.info('');
        log.info('Next: simulate RADIUS traffic to exercise usage tracking and A5 binding:');
        log.info('   node scripts/isp/simulate_radius_session.js --help');
        console.log('');
        log.warn('DEVELOPMENT SEED. Never run against production — it sets a known admin password.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
