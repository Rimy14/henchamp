/**
 * ISP API Verification
 *
 * Exercises every ISP endpoint against a running server, over real HTTP,
 * with real authentication and a real database. Unit tests mock the data
 * layer; this proves the wiring — routes, permissions, controllers,
 * services, SQL — actually holds together.
 *
 *   node server/server.js &                    # in another terminal
 *   node scripts/isp/verify_isp_api.js
 *
 * Exits non-zero if anything fails, so it can gate a release.
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.APP_URL || 'http://localhost:7001';
const USERNAME = process.env.VERIFY_USER || 'Admin';
const PASSWORD = process.env.VERIFY_PASS || 'Admin@123';

let cookie = null;
let passed = 0;
let failed = 0;
const failures = [];

const c = {
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`
};

function section(title) {
    console.log(`\n${c.bold(title)}\n${'─'.repeat(title.length)}`);
}

/**
 * Assert a condition, recording the outcome rather than throwing, so one
 * failure does not hide the state of everything after it.
 */
function check(label, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  ${c.green('✓')} ${label}`);
    } else {
        failed++;
        failures.push(label);
        console.log(`  ${c.red('✗')} ${label} ${detail ? c.dim(`— ${detail}`) : ''}`);
    }
}

async function call(method, path, body) {
    const res = await fetch(`${BASE}/api${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];

    let payload = null;
    const text = await res.text();
    if (text) {
        try { payload = JSON.parse(text); } catch { payload = text; }
    }

    return { status: res.status, body: payload };
}

async function main() {
    console.log(c.bold(`\nISP API Verification — ${BASE}\n`));

    // --- Reachability ---------------------------------------------------
    section('Server');
    try {
        const health = await call('GET', '/health');
        check('server is reachable', health.status === 200, `status ${health.status}`);
    } catch (error) {
        console.log(c.red(`\n✗ Cannot reach ${BASE} — is the server running?\n`));
        console.log(c.dim('  Start it with:  node server/server.js\n'));
        process.exit(1);
    }

    // --- Auth ------------------------------------------------------------
    section('Authentication');
    const login = await call('POST', '/auth/login', { username: USERNAME, password: PASSWORD });
    check('login succeeds', login.status === 200, `status ${login.status}: ${JSON.stringify(login.body)?.slice(0, 120)}`);
    check('session cookie issued', Boolean(cookie), 'no set-cookie header');

    if (!cookie) {
        console.log(c.red('\nCannot continue without a session. Run: node scripts/isp/seed_isp_demo.js\n'));
        process.exit(1);
    }

    // --- Permissions ------------------------------------------------------
    section('Authorisation');
    const noAuthRes = await fetch(`${BASE}/api/isp/dashboard`);
    check('unauthenticated request is rejected', noAuthRes.status === 401, `status ${noAuthRes.status}`);

    // --- Dashboard --------------------------------------------------------
    section('Dashboard (A7)');
    const dash = await call('GET', '/isp/dashboard');
    check('GET /isp/dashboard returns 200', dash.status === 200, `status ${dash.status}`);
    check('reports subscriber counts', typeof dash.body?.data?.subscribers?.total === 'number');
    check('reports voucher counts', typeof dash.body?.data?.vouchers?.total === 'number');
    check('reports today\'s usage', typeof dash.body?.data?.usageToday?.totalBytes === 'number');
    check('reports background job state', Array.isArray(dash.body?.data?.jobs));

    // --- Packages ---------------------------------------------------------
    section('Packages');
    const packages = await call('GET', '/isp/packages');
    check('GET /isp/packages returns 200', packages.status === 200);
    check('packages exist (run the seed if not)', packages.body?.data?.length > 0,
          `found ${packages.body?.data?.length ?? 0}`);

    const hotspotPkg = packages.body?.data?.find((p) => p.service_type === 'hotspot');
    const pppoePkg = packages.body?.data?.find((p) => p.service_type === 'pppoe');
    check('a hotspot package exists', Boolean(hotspotPkg));
    check('a PPPoE package exists', Boolean(pppoePkg));

    if (pppoePkg) {
        const detail = await call('GET', `/isp/packages/${pppoePkg.id}`);
        check('package detail includes its RADIUS policy', Boolean(detail.body?.data?.radius_policy));

        const rateLimit = detail.body?.data?.radius_policy?.reply
            ?.find((a) => a.attribute === 'Mikrotik-Rate-Limit');
        check('Mikrotik-Rate-Limit is provisioned', Boolean(rateLimit),
              JSON.stringify(detail.body?.data?.radius_policy?.reply));

        if (rateLimit) {
            // Format must be "<up>/<down>" — rx first, per MikroTik.
            const matches = /^\d+[kM]\/\d+[kM]/.test(rateLimit.value);
            check(`rate limit is well-formed (${rateLimit.value})`, matches);
        }

        const simUse = detail.body?.data?.radius_policy?.check
            ?.find((a) => a.attribute === 'Simultaneous-Use');
        check('Simultaneous-Use is provisioned', Boolean(simUse));
    }

    // Validation: a half-configured rate must be refused, not accepted.
    const badPackage = await call('POST', '/isp/packages', {
        code: `TEST-BAD-${Date.now()}`, name: 'Bad', service_type: 'pppoe',
        rate_up_kbps: 1000   // no matching down
    });
    check('rejects a half-configured rate limit', badPackage.status === 400,
          `status ${badPackage.status}`);

    // --- Subscribers -------------------------------------------------------
    section('Subscribers (A1, A3)');
    const subs = await call('GET', '/isp/subscribers');
    check('GET /isp/subscribers returns 200', subs.status === 200);
    check('subscribers exist', subs.body?.data?.length > 0, `found ${subs.body?.data?.length ?? 0}`);

    check('list never leaks the encrypted secret',
          !JSON.stringify(subs.body || {}).includes('radius_secret_enc'));

    const active = subs.body?.data?.find((s) => s.status === 'active');
    const suspended = subs.body?.data?.find((s) => s.status === 'suspended');

    if (active) {
        const detail = await call('GET', `/isp/subscribers/${active.id}`);
        check('subscriber detail returns 200', detail.status === 200);
        check('detail includes usage', Boolean(detail.body?.data?.usage));
        check('detail includes audit trail', Array.isArray(detail.body?.data?.audit));
        check('detail never leaks the encrypted secret',
              !JSON.stringify(detail.body || {}).includes('radius_secret_enc'));

        const sync = await call('GET', `/isp/subscribers/${active.id}/sync`);
        check('sync check returns 200', sync.status === 200);
        check('active subscriber is in sync with RADIUS', sync.body?.data?.inSync === true,
              JSON.stringify(sync.body?.data?.issues));
    }

    if (suspended) {
        const sync = await call('GET', `/isp/subscribers/${suspended.id}/sync`);
        check('suspended subscriber is in sync (RADIUS is blocking them)',
              sync.body?.data?.inSync === true, JSON.stringify(sync.body?.data?.issues));
        check('suspended subscriber is blocked in RADIUS',
              sync.body?.data?.radius?.blocked === true);
    }

    // --- Lifecycle idempotency over real HTTP -------------------------------
    section('Lifecycle idempotency (the Dev 2 contract)');
    if (active) {
        const first = await call('POST', `/isp/subscribers/${active.id}/suspend`,
                                 { reason: 'verification test', disconnect_now: false });
        check('suspend returns 200', first.status === 200, `status ${first.status}`);
        check('suspend reports a change', first.body?.data?.changed === true);

        const second = await call('POST', `/isp/subscribers/${active.id}/suspend`,
                                  { reason: 'verification test', disconnect_now: false });
        check('DUPLICATE suspend still returns 200 (not an error)', second.status === 200);
        check('duplicate suspend is a no-op', second.body?.data?.changed === false);

        const restore1 = await call('POST', `/isp/subscribers/${active.id}/restore`,
                                    { reason: 'verification test' });
        check('restore returns 200', restore1.status === 200);
        check('restore reports a change', restore1.body?.data?.changed === true);

        // The duplicate-webhook case: must not extend the cycle again.
        const restore2 = await call('POST', `/isp/subscribers/${active.id}/restore`,
                                    { reason: 'duplicate M-Pesa callback' });
        check('DUPLICATE restore returns 200', restore2.status === 200);
        check('duplicate restore is a no-op (no second free month)',
              restore2.body?.data?.changed === false);

        const restore3 = await call('POST', `/isp/subscribers/${active.id}/restore`,
                                    { reason: 'triplicate M-Pesa callback' });
        check('TRIPLICATE restore is still a no-op', restore3.body?.data?.changed === false);
    }

    // --- Billing read path (Dev 2) -----------------------------------------
    section('Billing read path (for Dev 2)');
    const billable = await call('GET', '/isp/subscribers/billable');
    check('GET /isp/subscribers/billable returns 200', billable.status === 200,
          `status ${billable.status}`);
    check('billable list is an array', Array.isArray(billable.body?.data));
    check('billable list never leaks secrets',
          !JSON.stringify(billable.body || {}).includes('radius_secret_enc'));

    // --- Vouchers (A2, A5) ---------------------------------------------------
    section('Vouchers (A2, A5)');
    const vouchers = await call('GET', '/isp/vouchers');
    check('GET /isp/vouchers returns 200', vouchers.status === 200);
    check('vouchers exist', vouchers.body?.data?.length > 0,
          `found ${vouchers.body?.data?.length ?? 0}`);
    check('voucher list never leaks the encrypted secret',
          !JSON.stringify(vouchers.body || {}).includes('secret_enc'));

    const batches = await call('GET', '/isp/vouchers/batches');
    check('GET /isp/vouchers/batches returns 200', batches.status === 200);

    if (hotspotPkg) {
        const generated = await call('POST', '/isp/vouchers/generate', {
            package_id: hotspotPkg.id, quantity: 3, code_length: 8, notes: 'API verification'
        });
        check('voucher generation returns 201', generated.status === 201, `status ${generated.status}`);
        check('returns the requested number of codes',
              generated.body?.data?.vouchers?.length === 3);

        const codes = generated.body?.data?.vouchers?.map((v) => v.code) || [];
        check('codes avoid ambiguous characters (0 O 1 I L)',
              codes.every((code) => !/[01OIL]/.test(code)), codes.join(','));
        check('all codes provisioned into RADIUS',
              generated.body?.data?.provisioning?.provisioned === 3);

        // A5 device-access rule over HTTP.
        if (codes[0]) {
            const unbound = await call('GET',
                `/isp/vouchers/check/${codes[0]}?mac=AA:BB:CC:DD:EE:FF`);
            check('unbound voucher admits a first device',
                  unbound.body?.data?.allowed === true, JSON.stringify(unbound.body?.data));
        }
    }

    // A5 against a voucher that is already locked.
    const boundVoucher = vouchers.body?.data?.find((v) => v.bound_mac);
    if (boundVoucher) {
        const sameDevice = await call('GET',
            `/isp/vouchers/check/${boundVoucher.code}?mac=${encodeURIComponent(boundVoucher.bound_mac)}`);
        check('A5: locked voucher admits its own device',
              sameDevice.body?.data?.allowed === true);

        const otherDevice = await call('GET',
            `/isp/vouchers/check/${boundVoucher.code}?mac=99:99:99:99:99:99`);
        check('A5: locked voucher REFUSES a different device',
              otherDevice.body?.data?.allowed === false &&
              otherDevice.body?.data?.reason === 'different_device',
              JSON.stringify(otherDevice.body?.data));
    } else {
        console.log(c.dim('  · no locked voucher yet — run: node scripts/isp/simulate_radius_session.js --scenario voucher'));
    }

    // --- Sessions & usage (A6) ------------------------------------------------
    section('Sessions & usage (A6)');
    const openSessions = await call('GET', '/isp/sessions/open');
    check('GET /isp/sessions/open returns 200', openSessions.status === 200);

    const liveSessions = await call('GET', '/isp/sessions/live');
    check('GET /isp/sessions/live returns 200', liveSessions.status === 200);
    check('live view flags completeness when a router is unreachable',
          typeof liveSessions.body?.meta?.complete === 'boolean');

    const history = await call('GET', '/isp/sessions/history');
    check('GET /isp/sessions/history returns 200', history.status === 200);

    const talkers = await call('GET', '/isp/usage/top-talkers?days=30&limit=5');
    check('GET /isp/usage/top-talkers returns 200', talkers.status === 200);

    const ingest = await call('POST', '/isp/jobs/accounting-ingest', {});
    check('accounting ingest runs on demand', ingest.status === 200, `status ${ingest.status}`);
    check('ingest reports a watermark', ingest.body?.data?.watermark !== undefined);

    const reaper = await call('POST', '/isp/jobs/session-reaper', {});
    check('session reaper runs on demand', reaper.status === 200);

    // --- NAS (A4) ---------------------------------------------------------------
    section('Routers / NAS (A4)');
    const nas = await call('GET', '/isp/nas');
    check('GET /isp/nas returns 200', nas.status === 200);
    check('NAS list never leaks the RADIUS secret',
          !JSON.stringify(nas.body || {}).includes('radius_secret_enc'));
    check('NAS list never leaks the router password',
          !JSON.stringify(nas.body || {}).includes('api_password_enc'));

    if (nas.body?.data?.length > 0) {
        const test = await call('POST', `/isp/nas/${nas.body.data[0].id}/test`);
        // The seeded router is intentionally unreachable — the endpoint must
        // still answer 200 with reachable:false, so the UI can show the real
        // error rather than a generic failure.
        check('connection test returns 200 even when the router is down',
              test.status === 200, `status ${test.status}`);
        check('connection test reports reachability',
              typeof test.body?.data?.reachable === 'boolean');
    }

    // --- 404 handling ------------------------------------------------------------
    section('Error handling');
    const missing = await call('GET', '/isp/subscribers/999999');
    check('unknown subscriber returns 404', missing.status === 404, `status ${missing.status}`);

    const missingVoucher = await call('POST', '/isp/vouchers/999999/revoke', {});
    check('unknown voucher returns 404', missingVoucher.status === 404,
          `status ${missingVoucher.status}`);

    // --- Summary ------------------------------------------------------------------
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  ${c.green(`${passed} passed`)}   ${failed > 0 ? c.red(`${failed} failed`) : '0 failed'}`);
    console.log('═'.repeat(50));

    if (failed > 0) {
        console.log(c.red('\nFailures:'));
        for (const f of failures) console.log(`  · ${f}`);
        console.log('');
        process.exit(1);
    }

    console.log(c.green('\nAll ISP API checks passed.\n'));
    process.exit(0);
}

main().catch((error) => {
    console.error(c.red(`\nVerification crashed: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
});
