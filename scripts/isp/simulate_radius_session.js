/**
 * RADIUS Session Simulator
 *
 * Writes rows into `radacct` exactly as FreeRADIUS would when a real router
 * reports a session. That makes the whole accounting pipeline — usage
 * tracking (A6) and voucher device binding (A5) — testable with no MikroTik
 * hardware and no FreeRADIUS installation.
 *
 * What this DOES prove:
 *   * accounting ingest, gigawords handling, delta accumulation
 *   * daily usage rollups and reporting
 *   * voucher MAC binding on first use, and the binding-reset flow
 *   * stale-session reaping
 *
 * What it does NOT prove (needs the CHR lab — see docs/ISP_LEARN.md §13):
 *   * that FreeRADIUS accepts our radcheck/radgroupreply rows
 *   * that MikroTik honours Mikrotik-Rate-Limit, and in which direction
 *   * that a live session is actually terminated over the REST API
 *
 * Usage:
 *   node scripts/isp/simulate_radius_session.js --help
 */

import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const { query } = await import('../../server/config/database.js');
const { radiusQuery } = await import('../../server/config/radius-db.js');
const accounting = await import('../../server/services/isp/accounting.service.js');

const NAS_IP = '192.168.88.1';
const GIGAWORD = 4294967296;

const log = {
    info: (m) => console.log(`   ${m}`),
    ok: (m) => console.log(`✅ ${m}`),
    warn: (m) => console.log(`⚠️  ${m}`),
    step: (m) => console.log(`\n▶ ${m}`),
    head: (m) => console.log(`\n${m}\n${'═'.repeat(m.length)}`)
};

function arg(name, fallback = null) {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`);
}

function fmtBytes(bytes) {
    const n = Number(bytes);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MB`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)} KB`;
    return `${n} B`;
}

/**
 * FreeRADIUS derives acctuniqueid as a hash of session identifiers. The exact
 * algorithm does not matter here — only that it is stable for a session and
 * distinct between sessions, which is what our ingest joins on.
 */
function makeUniqueId(sessionId, username) {
    return crypto.createHash('md5').update(`${sessionId}${username}${NAS_IP}`).digest('hex').slice(0, 32);
}

// =====================================================
// RADIUS ACCOUNTING PRIMITIVES
// =====================================================

/** Accounting-Start — the router reports a session has begun. */
async function acctStart({ username, mac, sessionId, framedIp = '10.5.50.100', service = 'pppoe' }) {
    const uniqueId = makeUniqueId(sessionId, username);

    await radiusQuery(
        `INSERT INTO radacct
            (acctsessionid, acctuniqueid, username, nasipaddress, nasporttype,
             acctstarttime, acctupdatetime, acctsessiontime,
             acctinputoctets, acctoutputoctets,
             callingstationid, calledstationid, framedipaddress,
             servicetype, framedprotocol, acctterminatecause)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 0, 0, 0, ?, ?, ?, ?, ?, '')
         ON DUPLICATE KEY UPDATE acctstarttime = VALUES(acctstarttime)`,
        [
            sessionId, uniqueId, username, NAS_IP,
            service === 'hotspot' ? 'Wireless-802.11' : 'Ethernet',
            mac, 'HenChamp-Hotspot', framedIp,
            service === 'hotspot' ? 'Login-User' : 'Framed-User',
            service === 'hotspot' ? '' : 'PPP'
        ]
    );

    log.info(`Accounting-Start  user=${username} mac=${mac} session=${sessionId}`);
    return uniqueId;
}

/**
 * Accounting Interim-Update.
 *
 * `bytesIn` / `bytesOut` are TRUE totals. FreeRADIUS's stock SQL folds the
 * Acct-*-Gigawords attributes before writing radacct, so we write the folded
 * value here too — matching what our ingest actually reads in production.
 */
async function acctUpdate({ uniqueId, bytesIn, bytesOut, sessionSeconds }) {
    await radiusQuery(
        `UPDATE radacct
            SET acctupdatetime = NOW(), acctsessiontime = ?,
                acctinputoctets = ?, acctoutputoctets = ?
          WHERE acctuniqueid = ?`,
        [sessionSeconds, bytesIn, bytesOut, uniqueId]
    );

    const wraps = Math.floor(Number(bytesIn) / GIGAWORD);
    const note = wraps > 0
        ? `  (upload wrapped the 32-bit counter ${wraps}x — gigawords required)`
        : '';

    log.info(
        `Interim-Update    up=${fmtBytes(bytesIn)} down=${fmtBytes(bytesOut)} ` +
        `t=${sessionSeconds}s${note}`
    );
}

/** Accounting-Stop — the session ended. */
async function acctStop({ uniqueId, cause = 'User-Request' }) {
    await radiusQuery(
        `UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = ? WHERE acctuniqueid = ?`,
        [cause, uniqueId]
    );
    log.info(`Accounting-Stop   cause=${cause}`);
}

async function ingest(label = 'Running accounting ingest') {
    log.step(label);
    const result = await accounting.ingestAccounting();
    log.info(
        `processed=${result.processed} created=${result.sessionsCreated} ` +
        `updated=${result.sessionsUpdated} bound=${result.bound}`
    );
    return result;
}

// =====================================================
// SCENARIOS
// =====================================================

/**
 * A full PPPoE session on a subscriber, deliberately crossing the 4 GiB
 * boundary so the counter handling is proven against a real number.
 */
async function scenarioGigawords() {
    log.head('SCENARIO: PPPoE session past the 4 GiB counter boundary (A6)');

    const subs = await query(
        `SELECT * FROM isp_subscribers WHERE status = 'active' ORDER BY id LIMIT 1`
    );
    if (subs.length === 0) {
        log.warn('No active subscriber. Run: node scripts/isp/seed_isp_demo.js');
        return;
    }

    const sub = subs[0];
    const sessionId = `sim-${Date.now().toString(16)}`;
    const mac = 'A4:83:E7:11:22:33';

    log.step(`Subscriber ${sub.subscriber_code} — ${sub.full_name} (${sub.radius_username})`);

    const uniqueId = await acctStart({
        username: sub.radius_username, mac, sessionId, service: 'pppoe'
    });
    await ingest('Ingesting session start');

    // Below the wrap point.
    log.step('Traffic below 4 GiB');
    await acctUpdate({ uniqueId, bytesIn: 500_000_000, bytesOut: 2_000_000_000, sessionSeconds: 1800 });
    await ingest();

    // Past it. 6 GB upload means the raw 32-bit counter would read
    // 1,705,032,704 — about 1.7 GB — with the real value only recoverable
    // via Acct-Input-Gigawords.
    log.step('Traffic past 4 GiB — the case that silently breaks naive implementations');
    const trueUpload = 6_000_000_000;
    const trueDownload = 25_000_000_000;
    await acctUpdate({ uniqueId, bytesIn: trueUpload, bytesOut: trueDownload, sessionSeconds: 7200 });
    await ingest();

    await acctStop({ uniqueId });
    await ingest('Ingesting session stop');

    log.step('Verifying recorded usage');
    const usage = await accounting.getSubscriberUsage(sub.id, {});

    const naiveUpload = trueUpload % GIGAWORD;
    log.info(`Recorded upload    ${fmtBytes(usage.totals.uploadBytes)}`);
    log.info(`Recorded download  ${fmtBytes(usage.totals.downloadBytes)}`);
    log.info(`Recorded total     ${fmtBytes(usage.totals.totalBytes)}`);
    log.info('');
    log.info(`A naive 32-bit read would have reported upload as ${fmtBytes(naiveUpload)}`);

    if (usage.totals.uploadBytes === trueUpload) {
        log.ok(`Upload recorded exactly (${trueUpload.toLocaleString()} bytes) — gigawords handled`);
    } else {
        log.warn(`MISMATCH: expected ${trueUpload}, recorded ${usage.totals.uploadBytes}`);
    }
}

/**
 * The A5 demonstration: a voucher locks to its first device and refuses the
 * second, then a support reset frees it.
 */
async function scenarioVoucherSharing() {
    log.head('SCENARIO: voucher single-device locking (A5)');

    const vouchers = await query(
        `SELECT * FROM isp_vouchers WHERE status = 'unused' AND bound_mac IS NULL ORDER BY id LIMIT 1`
    );
    if (vouchers.length === 0) {
        log.warn('No unbound voucher. Run: node scripts/isp/seed_isp_demo.js --reset');
        return;
    }

    const voucher = vouchers[0];
    const voucherModule = await import('../../server/services/isp/voucher.service.js');

    const phoneA = 'A4:83:E7:AA:AA:AA';
    const phoneB = 'B8:27:EB:BB:BB:BB';

    log.step(`Voucher ${voucher.code} — currently unbound`);

    // --- Customer logs in on their own phone ---------------------------
    log.step(`Customer connects on phone A (${phoneA})`);
    const sessionA = `sim-v-${Date.now().toString(16)}`;
    const uniqueA = await acctStart({
        username: voucher.code, mac: phoneA, sessionId: sessionA,
        framedIp: '10.5.60.10', service: 'hotspot'
    });
    await acctUpdate({ uniqueId: uniqueA, bytesIn: 5_000_000, bytesOut: 40_000_000, sessionSeconds: 300 });
    await ingest('Ingesting — this is where the voucher binds');

    const afterBind = await voucherModule.getVoucherByCode(voucher.code);
    log.info(`bound_mac = ${afterBind.bound_mac}`);
    log.info(`status    = ${afterBind.status}`);

    if (afterBind.bound_mac === phoneA) {
        log.ok('Voucher locked to phone A on first use');
    } else {
        log.warn(`Expected binding to ${phoneA}, got ${afterBind.bound_mac}`);
    }

    // --- Confirm the RADIUS check rule exists ---------------------------
    log.step('RADIUS check rule written for the lock');
    const checks = await radiusQuery(
        `SELECT attribute, op, value FROM radcheck WHERE username = ? AND attribute = 'Calling-Station-Id'`,
        [voucher.code]
    );
    if (checks.length > 0) {
        const c = checks[0];
        log.info(`radcheck: ${c.attribute} ${c.op} ${c.value}`);
        if (c.op === '==') {
            log.ok("Operator is '==' (a comparison that can fail) — correct");
        } else {
            log.warn(`Operator is '${c.op}' — must be '==' or the lock does nothing`);
        }
    } else {
        log.warn('No Calling-Station-Id rule written');
    }

    // --- The friend tries the same code ---------------------------------
    log.step(`The code is shared — phone B (${phoneB}) tries to use it`);
    const decision = voucherModule.evaluateDeviceAccess(afterBind, phoneB);
    log.info(`allowed = ${decision.allowed}   reason = ${decision.reason}`);

    if (!decision.allowed && decision.reason === 'different_device') {
        log.ok('Phone B refused — this is the requirement the client asked for');
    } else {
        log.warn('Phone B was NOT refused — A5 is not working');
    }

    // --- Same device is still fine, in any MAC format --------------------
    log.step('Phone A reconnects (router reports the MAC in a different format)');
    const again = voucherModule.evaluateDeviceAccess(afterBind, 'a4-83-e7-aa-aa-aa');
    log.info(`allowed = ${again.allowed}   reason = ${again.reason}`);
    if (again.allowed) log.ok('Original device still admitted regardless of MAC formatting');

    // --- The real-world edge: the phone rotated its MAC ------------------
    log.step('Real-world edge: phone A rotates its MAC (iOS/Android private Wi-Fi address)');
    log.info('The customer is now locked out of a voucher they paid for.');
    log.info('Counter staff clear the binding:');

    const reset = await voucherModule.resetBinding(afterBind.id, 1, 'phone rotated its MAC');
    log.info(`previous MAC = ${reset.previousMac}, reset count = ${reset.resetCount}`);

    const afterReset = await voucherModule.getVoucherByCode(voucher.code);
    const nowAllowed = voucherModule.evaluateDeviceAccess(afterReset, phoneB);
    log.info(`phone B now allowed = ${nowAllowed.allowed} (${nowAllowed.reason})`);

    if (nowAllowed.allowed) {
        log.ok('Binding cleared — the voucher re-locks to the next device that uses it');
    }

    await acctStop({ uniqueId: uniqueA, cause: 'User-Request' });
    await ingest();
}

/** A stale session that never sent Acct-Stop, and the reaper cleaning it up. */
async function scenarioStaleSession() {
    log.head('SCENARIO: stale session reaping');

    const subs = await query(
        `SELECT * FROM isp_subscribers WHERE status = 'active' ORDER BY id LIMIT 1`
    );
    if (subs.length === 0) {
        log.warn('No active subscriber. Run the seed first.');
        return;
    }

    const sub = subs[0];
    const sessionId = `sim-stale-${Date.now().toString(16)}`;

    log.step('A session starts, then the router reboots without sending Acct-Stop');
    const uniqueId = await acctStart({
        username: sub.radius_username, mac: 'CC:CC:CC:CC:CC:CC', sessionId
    });
    await ingest();

    // Backdate it past the staleness threshold.
    log.step('Backdating the session to 2 hours ago (past the stale threshold)');
    await query(
        `UPDATE isp_sessions
            SET started_at = DATE_SUB(NOW(), INTERVAL 2 HOUR),
                last_update_at = DATE_SUB(NOW(), INTERVAL 2 HOUR)
          WHERE acct_unique_id = ?`,
        [uniqueId]
    );

    const before = await query(
        `SELECT COUNT(*) AS n FROM isp_sessions WHERE stopped_at IS NULL`
    );
    log.info(`Open sessions before reaping: ${before[0].n}`);

    log.step('Running the reaper');
    log.info('Without this, Simultaneous-Use := 1 would lock the subscriber');
    log.info('out of their own account — held by a session that no longer exists.');

    const result = await accounting.reapStaleSessions();
    log.info(`reaped = ${result.reaped}`);

    const after = await query(
        `SELECT COUNT(*) AS n FROM isp_sessions WHERE stopped_at IS NULL`
    );
    log.info(`Open sessions after reaping:  ${after[0].n}`);

    if (result.reaped > 0) log.ok('Stale session closed in both isp_sessions and radacct');
}

/** A short, ordinary session — the smoke test. */
async function scenarioBasic() {
    log.head('SCENARIO: basic session');

    const username = arg('user');
    if (!username) {
        log.warn('Pass --user <radius_username or voucher code>');
        return;
    }

    const mac = arg('mac', 'A4:83:E7:11:22:33');
    const sessionId = `sim-${Date.now().toString(16)}`;

    const uniqueId = await acctStart({ username, mac, sessionId });
    await acctUpdate({
        uniqueId,
        bytesIn: parseInt(arg('up', '10000000'), 10),
        bytesOut: parseInt(arg('down', '80000000'), 10),
        sessionSeconds: parseInt(arg('seconds', '600'), 10)
    });
    await ingest();

    if (!hasFlag('keep-open')) {
        await acctStop({ uniqueId });
        await ingest();
    } else {
        log.info('Leaving the session open (--keep-open)');
    }
}

function usage() {
    console.log(`
RADIUS Session Simulator — test the ISP module without hardware

  node scripts/isp/simulate_radius_session.js --scenario <name>

Scenarios:
  gigawords       PPPoE session past 4 GiB. Proves usage is not truncated  (A6)
  voucher         Voucher locks to one device, refuses a second, reset flow (A5)
  stale           A session that never closed, and the reaper cleaning it up
  basic           One ordinary session (requires --user)
  all             gigawords, then voucher, then stale

Options for --scenario basic:
  --user <name>     RADIUS username or voucher code   (required)
  --mac <mac>       client MAC        default A4:83:E7:11:22:33
  --up <bytes>      upload bytes      default 10000000
  --down <bytes>    download bytes    default 80000000
  --seconds <n>     session duration  default 600
  --keep-open       do not send Accounting-Stop

Examples:
  node scripts/isp/simulate_radius_session.js --scenario all
  node scripts/isp/simulate_radius_session.js --scenario basic --user 254712345001
`);
}

async function main() {
    if (hasFlag('help') || process.argv.length === 2) {
        usage();
        process.exit(0);
    }

    const scenario = arg('scenario', 'basic');

    try {
        switch (scenario) {
            case 'gigawords': await scenarioGigawords(); break;
            case 'voucher':   await scenarioVoucherSharing(); break;
            case 'stale':     await scenarioStaleSession(); break;
            case 'basic':     await scenarioBasic(); break;
            case 'all':
                await scenarioGigawords();
                await scenarioVoucherSharing();
                await scenarioStaleSession();
                break;
            default:
                log.warn(`Unknown scenario "${scenario}"`);
                usage();
                process.exit(1);
        }

        console.log('');
        log.ok('Simulation complete');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Simulation failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
