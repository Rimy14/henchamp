# Manual Testing Guide — ISP Module (Section A)

**For:** Kusal (Dev 1)
**Covers:** A1–A6 — subscribers, hotspot vouchers, PPPoE, RADIUS provisioning, device locking, bandwidth & usage tracking
**Last updated:** 2026-08-05

Everything here you run yourself, by hand, and check with your own eyes. Automated tests prove the logic; this proves the system.

> **What this guide cannot prove.** Every check below runs against a real MySQL database and a real HTTP server, but there is **no MikroTik router and no FreeRADIUS daemon** in this environment. That means we verify *the rows we write for FreeRADIUS to read* and *the API that manages them* — not that FreeRADIUS accepts them or that a router honours them. [§10](#10-what-still-needs-the-chr-lab) lists exactly what is left, and [ISP_LEARN.md §13](ISP_LEARN.md#13-your-lab-build-it-yourself-in-an-evening) is the lab that closes the gap.

---

## Table of contents

1. [Start the environment](#1-start-the-environment)
2. [Connect to MySQL by hand](#2-connect-to-mysql-by-hand)
3. [Walk the database](#3-walk-the-database)
4. [Run the automated suites](#4-run-the-automated-suites)
5. [Test A6 — usage tracking and the 4 GiB bug](#5-test-a6--usage-tracking-and-the-4-gib-bug)
6. [Test A5 — voucher single-device locking](#6-test-a5--voucher-single-device-locking)
7. [Test suspend/restore and idempotency](#7-test-suspendrestore-and-idempotency)
8. [Test the API with curl](#8-test-the-api-with-curl)
9. [Test the admin UI in a browser](#9-test-the-admin-ui-in-a-browser)
10. [What still needs the CHR lab](#10-what-still-needs-the-chr-lab)
11. [Troubleshooting](#11-troubleshooting)
12. [Full reset](#12-full-reset)

---

## 1. Start the environment

### 1.1 MySQL

MySQL runs in Docker. It is **already created** — you only need to start it.

```bash
docker start henchamp-mysql

# confirm it is up and accepting connections
docker exec henchamp-mysql mysqladmin ping -uroot -phenchamp_dev_2026
# → mysqld is alive
```

If the container does not exist (fresh machine):

```bash
docker run -d --name henchamp-mysql \
  -e MYSQL_ROOT_PASSWORD=henchamp_dev_2026 \
  -e MYSQL_DATABASE=henchamp_pos_db \
  -p 3306:3306 mysql:8

# wait for it, then import the base schema
until docker exec henchamp-mysql mysqladmin ping -uroot -phenchamp_dev_2026 --silent; do sleep 3; done
docker exec -i henchamp-mysql mysql -uroot -phenchamp_dev_2026 henchamp_pos_db < database/schema.sql
```

> `mysql:8` currently resolves to **8.4**, which removed `--default-authentication-plugin`. Do not pass that flag — the container will refuse to start.

### 1.2 Credentials

Local development only. All of this is in `.env`, which is gitignored.

| What | Value |
|---|---|
| MySQL host / port | `127.0.0.1:3306` |
| MySQL user / password | `root` / `henchamp_dev_2026` |
| App database | `henchamp_pos_db` |
| RADIUS database | `henchamp_radius` |
| App URL | `http://localhost:7001` |
| Admin login | `Admin` / `Admin@123` |

### 1.3 Migrate and seed

```bash
npm install                # first time only
npm run isp:migrate        # creates henchamp_radius + all isp_* tables
npm run isp:seed:reset     # wipes and seeds demo data
```

Expected tail of the migrate output:

```
   henchamp_pos_db: 10/10 ISP tables
   henchamp_radius: 8/8 RADIUS tables
   ISP permissions seeded: 6
✅ All ISP migrations verified.
```

### 1.4 Start the server

```bash
node server/server.js
```

Expected:

```
✅ Database connected successfully
✅ RADIUS database connected successfully
[INFO] ISP job "accounting-ingest" scheduled {"everyMs":60000}
[INFO] ISP job "session-reaper" scheduled {"everyMs":300000}
[INFO] ISP job "voucher-expiry" scheduled {"everyMs":300000}
[INFO] 🚀 Server running on port 7001
```

✅ **Check:** all three ISP jobs scheduled, and *both* database lines say connected.

If the RADIUS line says failed, the ISP endpoints will still load but report errors — run `npm run isp:migrate`.

---

## 2. Connect to MySQL by hand

Three ways. Use whichever suits you.

### 2.1 Inside the container (no client install needed)

```bash
docker exec -it henchamp-mysql mysql -uroot -phenchamp_dev_2026 henchamp_pos_db
```

You get a `mysql>` prompt. `exit` to leave.

### 2.2 One-off query from your shell

```bash
docker exec henchamp-mysql mysql -uroot -phenchamp_dev_2026 henchamp_pos_db \
  -e "SELECT code, name, price FROM isp_packages;"
```

### 2.3 A GUI (DBeaver, MySQL Workbench, TablePlus…)

The port is published to your host, so connect normally:

```
Host: 127.0.0.1     Port: 3306
User: root          Password: henchamp_dev_2026
Databases: henchamp_pos_db, henchamp_radius
```

> There is **no `mysql` client binary installed on this machine** — that is why every example goes through `docker exec`. If you want one: `sudo apt install mysql-client`.

---

## 3. Walk the database

Open a MySQL prompt ([§2.1](#21-inside-the-container-no-client-install-needed)) and work through these. The point is to see with your own eyes that our tables and the RADIUS tables agree.

### 3.1 Our tables exist

```sql
USE henchamp_pos_db;
SHOW TABLES LIKE 'isp_%';
```

✅ **Expect 10 tables:** `isp_audit_log`, `isp_job_state`, `isp_nas`, `isp_packages`, `isp_sessions`, `isp_subscribers`, `isp_subscriptions`, `isp_usage_daily`, `isp_voucher_batches`, `isp_vouchers`.

### 3.2 Packages

```sql
SELECT code, name, service_type, price,
       rate_up_kbps, rate_down_kbps, data_cap_mb, radius_group
FROM isp_packages ORDER BY service_type, price;
```

✅ **Expect** 6 packages — 3 hotspot, 3 PPPoE. Note `HS-WEEK` has `data_cap_mb = 20480` (20 GB), deliberately above the 4 GiB boundary.

### 3.3 The RADIUS policy those packages produced

This is the heart of it — our package definitions become rows FreeRADIUS reads.

```sql
USE henchamp_radius;

SELECT groupname, attribute, op, value
FROM radgroupreply ORDER BY groupname, attribute;
```

✅ **Check these specifically:**

| Look for | Expected | Why it matters |
|---|---|---|
| `pkg_ppp_home_10m` → `Mikrotik-Rate-Limit` | `2M/10M 4M/20M 2M/10M 8/8` | **up first, then down.** A 10 Mbps-down plan reads `2M/10M`, not `10M/2M` |
| `pkg_hs_week` → `Mikrotik-Total-Limit` | `1073741824` | the low 32 bits of 20 GiB |
| `pkg_hs_week` → `Mikrotik-Total-Limit-Gigawords` | `4` | **the high bits.** Without this row the router sees 1 GB instead of 20 GB |
| every group → `Acct-Interim-Interval` | `600` | without it, usage only updates at session end |

Verify the cap reassembles correctly:

```sql
SELECT (4 * 4294967296) + 1073741824 AS bytes,
       (4 * 4294967296 + 1073741824) / 1024 / 1024 / 1024 AS gib;
```

✅ **Expect `21474836480` bytes = `20.0000` GiB.**

```sql
SELECT groupname, attribute, op, value FROM radgroupcheck;
```

✅ **Expect** `Simultaneous-Use := 1` on every group. That is what stops one voucher running two sessions at once.

### 3.4 Subscribers and their RADIUS credentials

```sql
USE henchamp_pos_db;

SELECT subscriber_code, full_name, phone, radius_username, status, billing_cycle_end
FROM isp_subscribers ORDER BY id;
```

✅ **Expect 6 subscribers** across `active`, `grace`, `suspended`, `pending`.

Now check the secret is genuinely encrypted at rest:

```sql
SELECT subscriber_code, HEX(radius_secret_enc) AS encrypted, LENGTH(radius_secret_enc) AS bytes
FROM isp_subscribers LIMIT 2;
```

✅ **Expect** unreadable hex, ~44 bytes. You must **not** be able to read a password here. (It is AES-256-GCM: 12-byte IV + 16-byte tag + ciphertext.)

Cross-check against RADIUS:

```sql
SELECT username, attribute, op, value FROM henchamp_radius.radcheck ORDER BY username, attribute;
```

✅ **Expect:**
- every subscriber has `Cleartext-Password := <something>` — this **is** plaintext, and that is unavoidable: CHAP requires the server to hold the original password ([ISP_LEARN.md §5](ISP_LEARN.md#5-how-freeradius-stores-everything-in-sql))
- `254712345004` (Mary Achieng, suspended) additionally has **`Auth-Type := Reject`**

That last row is the whole point. Confirm it:

```sql
SELECT s.full_name, s.status,
       EXISTS(SELECT 1 FROM henchamp_radius.radcheck r
              WHERE r.username = s.radius_username
                AND r.attribute = 'Auth-Type' AND r.value = 'Reject') AS blocked_in_radius
FROM isp_subscribers s ORDER BY s.id;
```

✅ **Expect `blocked_in_radius = 1` for exactly the suspended subscriber, `0` for everyone else.** If a suspended subscriber shows `0`, the database and RADIUS have drifted.

### 3.5 Package membership

```sql
SELECT username, groupname, priority FROM henchamp_radius.radusergroup ORDER BY username;
```

✅ **Expect exactly one row per subscriber and per voucher.** Two rows for one user would mean two tariffs merged and the effective speed depending on insertion order.

### 3.6 Vouchers

```sql
USE henchamp_pos_db;

SELECT code, status, bound_mac, binding_resets, expires_at, data_used_bytes
FROM isp_vouchers ORDER BY id LIMIT 10;
```

✅ **Expect 10 codes**, all `unused` with `bound_mac = NULL` on a fresh seed.

✅ **Check the codes contain no `0`, `O`, `1`, `I` or `L`** — they are printed and typed by hand, and those are the characters people misread:

```sql
SELECT code FROM isp_vouchers WHERE code REGEXP '[01OIL]';
```

✅ **Expect an empty result.**

### 3.7 The router registry

```sql
SELECT name, shortname, nas_ip, api_host, coa_port, status FROM isp_nas;

SELECT nasname, shortname, type, secret FROM henchamp_radius.nas;
```

✅ **Expect one router in both tables**, matching on shortname `chr-lab`.
✅ **Expect `coa_port = 1700`** — MikroTik's default, *not* the RFC 5176 value of 3799.

A router missing from `henchamp_radius.nas` is silently ignored by FreeRADIUS — no log line at all. This cross-check is worth doing whenever authentication mysteriously does nothing.

---

## 4. Run the automated suites

```bash
npm run isp:test
```

✅ **Expect `Tests: 99 passed, 99 total`** across 5 suites.

What they cover:

| Suite | Tests | Pins |
|---|---|---|
| `isp-radius-attributes` | 34 | the 4 GiB fold, rate-limit direction, MAC normalisation, cap gigawords |
| `isp-crypto` | 21 | AES-GCM round-trip, tamper detection, unbiased code generation |
| `isp-voucher-binding` | 14 | A5 — first-use lock, second-device refusal, race safety, reset |
| `isp-lifecycle` | 19 | idempotency, two-layer suspension, the status contract |
| `isp-accounting` | 11 | the interim-update regression, watermark handling, reaper |

### The pre-existing failure

```bash
npx jest tests/fifo-costing.test.js --forceExit
```

This **fails, and it is not mine.** It is a POS/sales test (Dev 3's area) returning 403 instead of 201. I verified it fails identically with my `.env` removed, and I have not modified `sale.routes.js`, `rbac.middleware.js`, or any non-ISP controller. Flagging it, not fixing it — out of scope.

---

## 5. Test A6 — usage tracking and the 4 GiB bug

This is the most important single test in this document.

```bash
npm run isp:simulate -- --scenario gigawords
```

The script writes rows into `radacct` exactly as FreeRADIUS would, then runs our ingest.

✅ **Expect the tail to read:**

```
▶ Verifying recorded usage
   Recorded upload    6.00 GB
   Recorded download  25.00 GB
   Recorded total     31.00 GB

   A naive 32-bit read would have reported upload as 1.71 GB
✅ Upload recorded exactly (6,000,000,000 bytes) — gigawords handled
```

**Why this matters.** `Acct-Input-Octets` is a 32-bit counter that wraps at ~4.29 GB. A subscriber who moved 6 GB is reported by the NAS as ~1.7 GB, with the missing part carried separately in `Acct-Input-Gigawords`. Get it wrong and every heavy user is under-billed forever, and **it never shows up in testing** because nobody moves 4 GB during a demo.

Now confirm it in SQL yourself:

```sql
USE henchamp_pos_db;

SELECT s.subscriber_code, s.full_name,
       u.usage_date,
       u.upload_bytes,
       ROUND(u.upload_bytes / 1e9, 2)   AS upload_gb,
       ROUND(u.download_bytes / 1e9, 2) AS download_gb
FROM isp_usage_daily u
JOIN isp_subscribers s ON s.id = u.subscriber_id
ORDER BY u.usage_date DESC;
```

✅ **Expect `upload_bytes = 6000000000` exactly.** Not `1705032704`.

### Check the delta accumulation

Usage accrues by *change*, not by total — a session open for a week must not have its whole byte count credited to the day it started.

```sql
SELECT acct_unique_id, username, started_at, stopped_at,
       input_octets, output_octets, session_seconds, terminate_cause
FROM isp_sessions ORDER BY id DESC LIMIT 5;
```

✅ **Expect** the session's final `input_octets = 6000000000` and `stopped_at` populated.

### The bug I found here during the build

The simulator caught a real design flaw: **FreeRADIUS UPDATEs the existing `radacct` row for every interim update** rather than inserting a new one. My original ingest used a `radacctid > watermark` cursor, so it saw each session once, at start, and every subsequent byte was invisible — usage froze at zero.

The fix reads two sources: new rows by watermark, *plus* a re-read of every session still open. `tests/isp-accounting.test.js` pins it so it cannot come back.

You can see the corrected behaviour in the run above — `updated=1` on each ingest after the first.

---

## 6. Test A5 — voucher single-device locking

The client's most explicit requirement.

```bash
npm run isp:simulate -- --scenario voucher
```

✅ **Expect this sequence:**

```
✅ Voucher locked to phone A on first use
   radcheck: Calling-Station-Id == A4:83:E7:AA:AA:AA
✅ Operator is '==' (a comparison that can fail) — correct
✅ Phone B refused — this is the requirement the client asked for
✅ Original device still admitted regardless of MAC formatting
✅ Binding cleared — the voucher re-locks to the next device that uses it
```

**Watch the operator.** It must be `==`, not `:=`. With `:=` FreeRADIUS would *assign* the MAC into the request instead of *comparing* against it — every device would be accepted and the feature would be a silent no-op. That one character is the whole control.

Verify by hand:

```sql
SELECT username, attribute, op, value
FROM henchamp_radius.radcheck
WHERE attribute = 'Calling-Station-Id';
```

✅ **Expect `op` = `==`.**

```sql
SELECT code, status, bound_mac, bound_at, binding_resets
FROM henchamp_pos_db.isp_vouchers WHERE bound_mac IS NOT NULL;
```

### Test the rule through the API

```bash
# log in and keep the cookie
curl -s -c /tmp/hc.txt -X POST http://localhost:7001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"Admin","password":"Admin@123"}' | head -c 200

# pick a locked voucher
CODE=$(docker exec henchamp-mysql mysql -uroot -phenchamp_dev_2026 henchamp_pos_db -N \
  -e "SELECT code FROM isp_vouchers WHERE bound_mac IS NOT NULL LIMIT 1;")
MAC=$(docker exec henchamp-mysql mysql -uroot -phenchamp_dev_2026 henchamp_pos_db -N \
  -e "SELECT bound_mac FROM isp_vouchers WHERE bound_mac IS NOT NULL LIMIT 1;")

# the bound device — should be allowed
curl -s -b /tmp/hc.txt "http://localhost:7001/api/isp/vouchers/check/$CODE?mac=$MAC"

# a different device — should be refused
curl -s -b /tmp/hc.txt "http://localhost:7001/api/isp/vouchers/check/$CODE?mac=99:99:99:99:99:99"
```

✅ **Expect** `"allowed":true,"reason":"bound_device"` then `"allowed":false,"reason":"different_device"`.

### The limits — say these out loud to the client

Two things must be in writing before this ships:

1. **MAC addresses are spoofable.** Any laptop can change its MAC in one command. This stops casual code-sharing between friends — which is the real revenue loss — but it is not a cryptographic guarantee, and no vendor's implementation is.

2. **Modern phones randomise their MAC** (iOS "Private Wi-Fi Address", Android "Randomized MAC"). Usually stable per SSID, so day-to-day it works — but a customer who toggles the setting gets locked out of a voucher they paid for. That is why **Reset Lock** exists and why counter staff need to know about it.

The reset is counted (`binding_resets`) and audited. A voucher reset repeatedly is being shared, not malfunctioning — and the counter should be able to see that.

---

## 7. Test suspend/restore and idempotency

The property Dev 2's billing engine depends on: **M-Pesa Daraja retries webhooks**, so every lifecycle call will arrive two or three times for one real payment.

```bash
# log in
curl -s -c /tmp/hc.txt -X POST http://localhost:7001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"Admin","password":"Admin@123"}' > /dev/null

# suspend twice
curl -s -b /tmp/hc.txt -X POST http://localhost:7001/api/isp/subscribers/1/suspend \
  -H 'Content-Type: application/json' -d '{"reason":"test"}' | python3 -m json.tool | grep -E 'changed|message'

curl -s -b /tmp/hc.txt -X POST http://localhost:7001/api/isp/subscribers/1/suspend \
  -H 'Content-Type: application/json' -d '{"reason":"test"}' | python3 -m json.tool | grep -E 'changed|message'
```

✅ **Expect** `"changed": true` then `"changed": false` with `"Already in requested state (no-op)"` — and **HTTP 200 both times.** A duplicate must not look like a failure, or Daraja retries forever.

Confirm the block reached RADIUS:

```sql
SELECT username, attribute, value FROM henchamp_radius.radcheck
WHERE username = (SELECT radius_username FROM henchamp_pos_db.isp_subscribers WHERE id = 1)
  AND attribute = 'Auth-Type';
```

✅ **Expect `Auth-Type = Reject`.**

Now restore three times:

```bash
for i in 1 2 3; do
  curl -s -b /tmp/hc.txt -X POST http://localhost:7001/api/isp/subscribers/1/restore \
    -H 'Content-Type: application/json' -d '{"reason":"M-Pesa callback"}' \
    | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(f\"call $i: changed={d['changed']} cycleExtended={d['cycleExtended']}\")"
done
```

✅ **Expect:**

```
call 1: changed=True  cycleExtended=True
call 2: changed=False cycleExtended=False
call 3: changed=False cycleExtended=False
```

**If call 2 or 3 showed `cycleExtended=True`, every duplicate webhook would hand the customer another free month.**

✅ **Confirm the `Auth-Type = Reject` row is gone** after restore (re-run the SQL above — expect empty).

### The audit trail

```sql
SELECT a.created_at, a.action, u.username AS actor, a.detail
FROM henchamp_pos_db.isp_audit_log a
LEFT JOIN henchamp_pos_db.users u ON u.id = a.actor_user_id
WHERE a.entity_type = 'subscriber'
ORDER BY a.id DESC LIMIT 10;
```

✅ **Expect** `suspend` and `restore` entries with actor, reason and previous status. This is the record when a customer disputes a suspension.

### Two-layer suspension

Suspension must do **two** things: block the next login (RADIUS policy) *and* kick the session happening now (router API). A database column alone stops nobody — a PPPoE session can stay up for weeks and never re-authenticates.

In this environment the router is unreachable by design, so you will see:

```json
"disconnected": 0,
"errors": [{"nas": "chr-lab", "error": "Cannot reach RouterOS at 192.168.88.1:443 — ..."}]
```

✅ **That is correct behaviour.** The suspension still succeeds — the policy change already landed, so they cannot re-authenticate. Failing the whole call would leave the database saying "active" while RADIUS says "blocked", which is strictly worse. Proving the kick itself works needs the CHR lab ([§10](#10-what-still-needs-the-chr-lab)).

### The stale session trap

```bash
npm run isp:simulate -- --scenario stale
```

✅ **Expect `reaped = 1`** and open sessions dropping to 0.

If a router reboots without sending Accounting-Stop, the `radacct` row stays open forever. Combined with `Simultaneous-Use := 1`, that locks the subscriber out of **their own account** — held by a session that no longer exists. The reaper is what prevents that support call.

---

## 8. Test the API with curl

### The whole suite in one command

```bash
npm run isp:verify
```

✅ **Expect `67 passed   0 failed`.**

This exercises every endpoint over real HTTP with real auth against the real database — routes, permissions, controllers, services and SQL together. Notable checks: no endpoint ever leaks `radius_secret_enc`, `secret_enc` or `api_password_enc`; unauthenticated requests get 401; unknown IDs get 404; the NAS test returns 200 with `reachable:false` rather than a 5xx when the router is down.

### Individual endpoints

```bash
curl -s -c /tmp/hc.txt -X POST http://localhost:7001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"Admin","password":"Admin@123"}' > /dev/null

API() { curl -s -b /tmp/hc.txt "http://localhost:7001/api/isp$1" | python3 -m json.tool; }

API /dashboard
API /packages
API /subscribers
API /vouchers
API /vouchers/batches
API /sessions/open
API /sessions/live
API /usage/top-talkers?days=30
API /nas
API /subscribers/1
API /subscribers/1/sync          # compare our state with RADIUS
API /subscribers/billable        # Dev 2's read path
```

### Generate vouchers over the API

```bash
PKG=$(docker exec henchamp-mysql mysql -uroot -phenchamp_dev_2026 henchamp_pos_db -N \
  -e "SELECT id FROM isp_packages WHERE code='HS-DAY';")

curl -s -b /tmp/hc.txt -X POST http://localhost:7001/api/isp/vouchers/generate \
  -H 'Content-Type: application/json' \
  -d "{\"package_id\":$PKG,\"quantity\":5,\"code_length\":8}" | python3 -m json.tool
```

✅ **Expect 201** with 5 plaintext codes and `"provisioned": 5`.
✅ **The codes appear once.** They are stored encrypted; no endpoint returns them again.

Confirm they reached RADIUS:

```sql
SELECT username, attribute FROM henchamp_radius.radcheck
WHERE username IN (SELECT code FROM henchamp_pos_db.isp_vouchers ORDER BY id DESC LIMIT 5);
```

### Check permissions actually bite

```bash
# no cookie → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7001/api/isp/dashboard
```

✅ **Expect `401`.**

---

## 9. Test the admin UI in a browser

1. Open **http://localhost:7001**
2. Log in as `Admin` / `Admin@123`
3. Find the **ISP** section in the left sidebar

### ISP Dashboard (`#/isp`)

✅ Five tiles populate: active subscribers, sessions online, data today, vouchers, routers.
✅ **Background Jobs** table shows `isp_accounting_ingest` with a recent run time.
✅ **Heaviest Users** lists the subscriber from the gigawords test at ~31 GB.
✅ Click **Run Accounting Ingest** → toast with the result.

> The jobs table is prominent on purpose. If accounting ingest stops, every usage figure quietly freezes at its last value with no error anywhere — the first sign would otherwise be a billing dispute.

### Subscribers (`#/isp/subscribers`)

✅ Six subscribers with correct status badges.
✅ **Speed column reads download-first** (`10M ↓ / 2M ↑`) because that is how plans are sold — even though the RADIUS attribute is written upload-first.
✅ Click a name → detail drawer with usage, sessions and audit trail.
✅ Action buttons match status: `pending` offers Activate; `active` offers Suspend; `suspended` offers Restore.
✅ Click the **stethoscope** → "In sync with RADIUS".
✅ Create a subscriber → the generated PPPoE password appears in an alert. **It is shown once.**

### Vouchers (`#/isp/vouchers`)

✅ Blue banner explains single-device locking and when to use Reset Lock.
✅ Locked vouchers show their MAC; unlocked show "not locked".
✅ **Reset Lock** prompts for a reason, then clears the binding.
✅ A voucher with more than 2 resets shows an amber badge — likely being shared.
✅ **Generate Batch** → codes appear in a print-ready grid with Copy All.

### Live Sessions (`#/isp/sessions`)

✅ Two tables: *Live on Routers* and *Open per Accounting*.
✅ The live table shows an amber "Incomplete" warning naming `chr-lab` as unreachable.

> **This is the correct behaviour and worth understanding.** An empty live list must never read as "nobody is online" when the truth is "we could not ask". The two tables are shown separately on purpose — a row in accounting with no matching router session is exactly what the reaper cleans up.

---

## 10. What still needs the CHR lab

Everything above runs without networking hardware. These four things **cannot** be verified here, and they are the gap between "the code is right" and "the system works":

| # | Needs proving | Why it cannot be done here |
|---|---|---|
| 1 | **FreeRADIUS accepts our rows** — a user existing only in `radcheck` can actually authenticate | No FreeRADIUS daemon installed |
| 2 | **`Mikrotik-Rate-Limit` direction** — that `2M/10M` really is 2 up / 10 down | Needs a router and a speed test |
| 3 | **Session kick works** — `POST /rest/ppp/active/remove` really drops a user | Needs a live RouterOS device |
| 4 | **MAC binding is enforced by FreeRADIUS**, not just by our mirror of the rule | Needs FreeRADIUS evaluating `Calling-Station-Id` |

**#2 is the one that will bite.** If the direction is inverted, every customer on a "10 Mbps down" plan gets 10 up / 2 down, and the support calls start on day one. Set it, run a real speed test, look at the numbers, write down what you observed. Five minutes there saves a week.

The lab that closes all four is [ISP_LEARN.md §13](ISP_LEARN.md#13-your-lab-build-it-yourself-in-an-evening) — MikroTik CHR is free forever at 1 Mbps per interface, which is plenty to prove correctness. Work the checklist there; when every box is ticked, this module is genuinely production-ready.

---

## 11. Troubleshooting

**`ECONNREFUSED 127.0.0.1:3306`**
MySQL is not running. `docker start henchamp-mysql`, then wait for `mysqladmin ping`.

**`RADIUS database connection failed`**
`npm run isp:migrate`. Verify with `npm run isp:verify-db`.

**`ISP_ENCRYPTION_KEY is not set`**
`.env` is missing or was not loaded. It is gitignored, so it does not travel with the repo. Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
⚠️ Changing this key makes every existing encrypted secret undecryptable — re-seed if you change it.

**Login fails with 401**
`npm run isp:seed` resets the Admin password to `Admin@123`.

**Usage figures stay at zero**
The ingest job runs every 60s. Force it: `curl -b /tmp/hc.txt -X POST http://localhost:7001/api/isp/jobs/accounting-ingest`. Then check `SELECT * FROM isp_job_state;` for `last_error`.

**`Cannot reach RouterOS at 192.168.88.1`**
Expected — the seeded router is intentionally unreachable so the error paths are exercised. Register a real CHR under **ISP → Routers** when you have one.

**Port 7001 already in use**
```bash
lsof -ti:7001 | xargs -r kill
```

**Jest hangs on the full `npm test`**
A pre-existing suite holds an open handle. Use `npm run isp:test` (ISP suites, `--forceExit`) or add `--forceExit`.

---

## 12. Full reset

Back to a clean, seeded state:

```bash
npm run isp:seed:reset     # wipes all isp_* and RADIUS tables, re-seeds
```

Nuclear — rebuild the database from nothing:

```bash
docker rm -f henchamp-mysql
docker run -d --name henchamp-mysql \
  -e MYSQL_ROOT_PASSWORD=henchamp_dev_2026 \
  -e MYSQL_DATABASE=henchamp_pos_db -p 3306:3306 mysql:8

until docker exec henchamp-mysql mysqladmin ping -uroot -phenchamp_dev_2026 --silent; do sleep 3; done

docker exec -i henchamp-mysql mysql -uroot -phenchamp_dev_2026 henchamp_pos_db < database/schema.sql
npm run isp:migrate
npm run isp:seed
```

---

## Command reference

```bash
npm run isp:migrate       # create RADIUS db + isp_* tables (idempotent)
npm run isp:verify-db     # report schema state, change nothing
npm run isp:seed          # seed demo data
npm run isp:seed:reset    # wipe and re-seed
npm run isp:test          # 99 unit tests
npm run isp:verify        # 67 API checks (server must be running)
npm run isp:simulate -- --help
npm run isp:simulate -- --scenario all       # gigawords + voucher + stale
```

## Green-light checklist

Everything that must pass before this section is called done:

- [ ] `npm run isp:migrate` → 10/10 ISP tables, 8/8 RADIUS tables
- [ ] `npm run isp:test` → 99 passed
- [ ] `npm run isp:verify` → 67 passed, 0 failed
- [ ] `--scenario gigawords` → upload recorded as exactly 6,000,000,000 bytes
- [ ] `--scenario voucher` → phone B refused, `op` is `==`, reset works
- [ ] `--scenario stale` → 1 session reaped
- [ ] Triple `restore` → `cycleExtended` true once, false twice
- [ ] Suspended subscriber has `Auth-Type := Reject` in `radcheck`
- [ ] No API response contains `radius_secret_enc`, `secret_enc` or `api_password_enc`
- [ ] All four ISP pages render and act correctly in the browser
- [ ] **[needs CHR lab]** a user existing only in `radcheck` authenticates
- [ ] **[needs CHR lab]** `2M/10M` measured as 2 up / 10 down on a real speed test
- [ ] **[needs CHR lab]** a live session is actually dropped by the kick
- [ ] **[needs CHR lab]** FreeRADIUS itself refuses a second device
