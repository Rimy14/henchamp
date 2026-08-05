# HenChamp — Project Memory

**Read this file first in any new session. It replaces re-reading the codebase.**
Keep it under ~250 lines. Facts and decisions only — no narrative, no code dumps.

Last updated: 2026-08-05 · Maintainer: Kusal (Dev 1)

---

## 1. What this repo is

Kenyan client "HenChamp" (contact: "Sirge"). Two workstreams in one codebase:

- **ISP platform** — hotspot (voucher Wi-Fi) + PPPoE (home), ~100–150 subscribers, recurring billing, auto-suspend, M-Pesa/Paystack.
- **Store/POS** — semi e-commerce + POS across 9 product categories, quotation→invoice→delivery-note, inventory.

Target domain: `solutions.henchamp.com`. Demo: `https://test.tsolutio.cloud/store.html#/` · admin `app.html`.
Requirements source: `HenChamp_Project_Requirements.pdf` (from WhatsApp gathering, Aug 3–4 2026).

**Team:** Kusal = Dev 1, Section A (ISP core). Deepana = Dev 2, Section B (billing/payments). Rimaz = Dev 3, Sections C & D (portal, CRM, store/POS).

---

## 2. Stack — the actual one

**Node.js 22 + Express 4 + MySQL 8 + vanilla-JS frontend.** ES Modules (`"type": "module"`).

> ⚠️ **The requirements PDF says Laravel. It is wrong.** The repo is Node/Express — originally `digital-printing-pos-erp`, rebranded. No PHP, no Composer, no Laravel anywhere; PHP isn't even installed. All ISP work is planned as a Node module. **Unresolved with the PM** — see [ISP_PLAN.md §0.1](ISP_PLAN.md#01-the-requirements-doc-says-laravel-the-repo-is-nodejs).

Key deps already present (reuse, don't re-add): `mysql2`, `jsonwebtoken`, `bcrypt`, `helmet`, `express-rate-limit`, `express-validator`, `pdfkit`, `qrcode`, `nodemailer`, `decimal.js`, `exceljs`, `jest` + `supertest`.

Local env: Node v22.22.0, npm 11.12.1, Docker 29.1.3. **No PHP, no Composer, no local `mysql` client binary.**

---

## 3. Repo layout

```
server/
  server.js            entrypoint; mounts every /api/* route; runs 2 migrations at boot
  config/database.js   mysql2 pool + query() + transaction() helpers
  config/jwt.js
  middleware/          auth (JWT from HTTP-only cookie), rbac, validation, error
  controllers/*.controller.js
  routes/*.routes.js
  utils/               logger, cache, task-queue, helpers, fuzzy-match, barcode.validator
public/
  app.html             admin SPA        store.html / portal/  customer storefront
  js/app-shell.js      routes via router.addRoute()
  js/frame.js          sidebar nav markup (hardcoded <a href="#/...">)
  js/, css/, pages/
database/schema.sql    full dump, 44 tables
scripts/               ~35 one-off migration/seed/import scripts (plain node, run by hand)
tests/                 3 jest tests
docs/                  ISP_PLAN.md, ISP_LEARN.md, ISP_MEMORY.md, GIT_WORKFLOW.md, PRINTER_SETUP.md
```

**~12k LOC of server JS.** No `services/` dir yet — controllers do everything (ISP module deliberately adds one; see [ISP_PLAN.md §3](ISP_PLAN.md#3-code-layout)).

## 4. Conventions to match

- Routes: `router.use(verifyToken)` at top, then `checkPermission('resource:action')` per route. Template: `server/routes/quotation.routes.js`.
- Controllers: `export async function name(req, res)`, try/catch, `logger.error(...)`, respond `{ success, data, message }`, paginate with `{ page, limit, totalItems, totalPages }`. Template: `server/controllers/quotation.controller.js`.
- DB: `import { query, transaction } from '../config/database.js'`. Parameterised `?` always.
- Tables: `snake_case`, `id INT AUTO_INCREMENT` PK, `created_at`/`updated_at` timestamps, `status` ENUMs, InnoDB, `utf8mb4_unicode_ci`.
- Migrations are hand-written SQL + a runner script in `scripts/`. **No ORM, no migration framework.**
- Frontend: add a route in `app-shell.js` (`router.addRoute('/path', {title, view, script, allowedRoles})`) **and** a nav `<a>` in `frame.js`.

## 5. Existing DB facts worth knowing

44 tables. Relevant ones: `users`, `roles`, `role_permissions`, `customers`, `items`, `categories`, `inventory`, `inventory_batches`, `sales`, `sale_items`, `sale_payments`, `quotations`, `purchase_orders`, `grn`, `system_settings`.

- `users.role` is a **hard ENUM** (`Admin`,`Coordinator`,`Cashier`) but there's also a dynamic `roles` + `role_permissions` system. Both exist; RBAC middleware reads the dynamic one.
- Permissions are `resource:action` strings with `*` wildcards, cached 60s in `rbac.middleware.js`.
- `sale_payments.payment_method` ENUM already includes `'Mobile Money'` — usable for M-Pesa without a schema change.
- `customers.company` ENUM is `PRINTHUB`/`NATURAL`/`OUTSIDE` — **leftover from the previous project**, meaningless for HenChamp.
- Auth = JWT in an **HTTP-only cookie** (not a Bearer header).

---

## 6. Live issues found in the code

| # | Issue | Where | Impact |
|---|---|---|---|
| 1 | DB timezone pinned `+05:30` (Sri Lanka); client is Kenya **UTC+3** | `server/config/database.js:18` | every billing boundary / voucher expiry off by 2.5h. **Fix before Phase 2.** |
| 2 | PDF says Laravel, repo is Node | — | needs a PM decision, blocking |
| 3 | Rate limiter max defaults to 10000 "for debugging" | `server/server.js:79` | too permissive for prod |
| 4 | `helmet` has CSP disabled | `server/server.js:63` | prod hardening |
| 5 | Stale branding: package name `digital-printing-pos-erp`, `.env.example` DB `printing_pos_db`, port drift 5000/7000/7001 | multiple | tidy before client handover |

---

## 7. ISP architecture decisions (locked unless noted)

Full reasoning in [ISP_PLAN.md §1](ISP_PLAN.md#1-architecture-decisions).

1. **FreeRADIUS 3.x + `rlm_sql`** is the auth/accounting authority. Our Node app writes policy rows and reads accounting. It never authenticates anyone. *(Rejected: MikroTik User Manager — not customisable; no-RADIUS direct-to-router — no accounting stream.)*
2. **Two databases, one MySQL server.** `henchamp_pos_db` (app + `isp_*` tables) and `henchamp_radius` (stock FreeRADIUS schema, unmodified). Second pool at `server/config/radius-db.js`.
3. **RouterOS v7 REST API via native `fetch` — no npm package.** `node-routeros` was **archived March 2024**; `routeros-client` and `mikronode` are also dead. REST: Basic auth, `https://<router>/rest`, GET=print PUT=add PATCH=set DELETE=remove POST=any command. **All values come back as strings.** Needs RouterOS ≥ 7.1beta4 and `www-ssl` enabled.
4. **Suspension is two layers**: (a) RADIUS policy change blocks *future* logins; (b) live session must be *actively kicked* via REST. v1 uses REST; RFC 5176 CoA/Disconnect is v2.
5. **Hardware:** no software-only substitute exists — the client must buy a MikroTik. But dev is unblocked by **CHR** (free licence, 1 Mbps/interface, or 60-day P1 trial). Prod recommendation: hEX RB750Gr3 (starter) / RB5009 (full 150 subs) — **not yet quoted to client**.
6. **`server/services/isp/`** added deliberately (repo has no services layer) so router/RADIUS I/O is mockable in Jest.
7. Voucher secrets and RADIUS passwords stored **AES-256-GCM encrypted** in our tables; `radcheck` still needs `Cleartext-Password` (CHAP requires it — see [ISP_LEARN.md §5](ISP_LEARN.md#5-how-freeradius-stores-everything-in-sql)). Secrets are **auto-generated**, never user-chosen.

## 8. Domain constants — don't re-look-these-up

| Fact | Value |
|---|---|
| RADIUS auth / accounting ports | **1812 / 1813** udp |
| CoA / Disconnect port | **3799** per RFC, but **MikroTik defaults to 1700** ⚠️ |
| MikroTik RADIUS vendor ID | **14988** |
| Speed limit attribute | `Mikrotik-Rate-Limit` (8), string `rx/tx` = **up/down**, `k`/`M` suffix |
| Data cap attribute | `Mikrotik-Total-Limit` (17) — **uint32, wraps at 4 GiB** |
| Gigawords companions | `Mikrotik-Total-Limit-Gigawords` (18), `Acct-Input-Gigawords` (52), `Acct-Output-Gigawords` (53). `real = gigawords × 2^32 + octets` |
| Client MAC attribute | `Calling-Station-Id` (31) |
| Usage direction | `acctinputoctets` = subscriber **upload**; `acctoutputoctets` = **download** |
| Open session test | `radacct.acctstoptime IS NULL` |
| Session join key | `acctuniqueid` (**not** `acctsessionid`) |
| FreeRADIUS tables | `radcheck`, `radreply`, `radgroupcheck`, `radgroupreply`, `radusergroup`, `radacct`, `nas` |
| `op` semantics | `:=` set/replace · `==` must-equal (checks only) · `+=` append |
| MAC-binding rule | `radcheck (code, 'Calling-Station-Id', '==', mac)` — **`==` not `:=`** |
| Kenya timezone | EAT, **UTC+3** |
| Currency | KES |
| CHR licences | Free = 1 Mbps/iface · P1 $45 = 1 Gbps · P10 $95 · P-Unlimited $250 · 60-day trial |

---

## 9. Contract with Dev 2 (Deepana) — ⛔ NOT YET AGREED

Proposed in [ISP_PLAN.md §4](ISP_PLAN.md#4-the-contract-with-dev-2--agree-this-in-phase-0). **Must be signed off in Phase 0 before either side builds.** Update this section the moment it is.

Dev 2 imports `server/services/isp/lifecycle.service.js`:
`activateSubscriber` · `suspendSubscriber` · `restoreSubscriber` · `setGrace` · `getBillableSubscribers`

Shared status enum (nobody invents values): `pending | active | grace | suspended | terminated`.
Dev 2 owns only `isp_subscriptions.status`, `.invoice_ref`, `.paid_at`. Dev 1 owns the rest.
**All lifecycle functions must be idempotent** — M-Pesa retries webhooks.

---

## 10. Status

| Section | Owner | State |
|---|---|---|
| A1–A6 ISP core | Kusal | ✅ **Built locally, tested, not committed.** See §13 |
| A7 ISP admin dashboard | Dev 2 (per PDF) | ✅ Built by Dev 1 (data is ours); **ownership still unclear** |
| B1–B6 billing & payments | Deepana | Not started |
| C1 customer portal | Rimaz | Partial / UI only |
| C2, C3 ordering + CRM | Rimaz | Not started |
| C4 merged admin portal | Rimaz | ✅ Done |
| D1, D2 storefront + branding | Rimaz | ✅ Done |
| D3 POS module, D5 inventory | Rimaz | Partial / UI only |
| D4 quotation→invoice→delivery | Rimaz | Not started |
| D6 deployment | Rimaz | Not started |
| E1–E3 ticketing, e-book, staffing | TBD | Out of scope, not priced |

**Estimate for Section A alone: 17–24 developer-days.** The PDF records the ISP work as quoted at **~$70**. Flagged to PM; unresolved.

---

## 11. Open questions — client / PM

Blocking or near-blocking, mine first:

1. Is the client buying a MikroTik router, and who specs/quotes it? Nothing ships without one. *(A4)*
2. Where does FreeRADIUS live — same VPS? If the router is on a dynamic IP, we need a VPN or static IP.
3. Hotspot: one location or several? Multi-site changes NAS management from a row to a feature.
4. Voucher denominations — time-based, data-based, or both? Decides the primary package column.
5. Does the client accept the MAC-binding caveats (spoofable; phone MAC randomisation can lock out paying users)? **Get it in writing** — it's his most explicit requirement.
6. Laravel vs Node — PM decision. *(§2)*
7. Daraja setup fee, who pays, sandbox vs production credentials. *(Dev 2, B3)*
8. Are we configuring the client's Paybill/Till and Paystack accounts, or only integrating against his?
9. Final pricing split: ISP (~$70) vs store/POS ($170).

---

## 12. Working agreements with Kusal

- Kusal gives the git commands; Claude does not commit or push unprompted. See [GIT_WORKFLOW.md](GIT_WORKFLOW.md).
- On compaction: **read this file, not the whole project.**
- Keep this file current — anything discovered that would cost >5 min to re-derive goes here.

---

## 13. Built state (2026-08-05) — nothing committed

Section A is implemented and verified locally. **Working tree is dirty by design** — Kusal will direct the commits.

### Local environment

MySQL 8.4 in Docker, container `henchamp-mysql`, root/`henchamp_dev_2026`, port 3306.
Databases `henchamp_pos_db` + `henchamp_radius`. App on :7001. Admin login `Admin` / `Admin@123`.
`.env` exists (gitignored) and holds `ISP_ENCRYPTION_KEY` — **changing that key makes every stored secret undecryptable.**
No `mysql` client binary on the host; use `docker exec`. No PHP, no FreeRADIUS daemon, no router.

### What was built

- `server/services/isp/` — crypto, radius-attributes, radius, routeros, provisioning, voucher, nas, lifecycle, accounting, audit
- `server/controllers/isp-{package,subscriber,voucher,session,nas}.controller.js`, `server/routes/isp.routes.js` (mounted `/api/isp`)
- `server/config/radius-db.js` (second pool), `server/jobs/isp-jobs.js` (accounting/reaper/expiry intervals)
- `database/migrations/isp/001–005`, `database/freeradius/schema.sql` (vendored, unmodified)
- `scripts/isp/` — `run_isp_migrations.js`, `seed_isp_demo.js`, `simulate_radius_session.js`, `verify_isp_api.js`
- 4 admin pages (`public/pages/isp-*.html` + `public/js/pages/isp-*.js`), nav in `frame.js`, routes in `app-shell.js`
- `tests/isp-*.test.js` — 99 tests

### Verification status

`npm run isp:test` → **99 passed** · `npm run isp:verify` → **67 API checks passed** · all 3 simulator scenarios pass.
Full procedure: [MANUAL_TESTING.md](MANUAL_TESTING.md).

### Bug found and fixed during the build — do not regress

**FreeRADIUS UPDATEs the existing `radacct` row for interim updates; it does not insert a new one.** The original ingest used a `radacctid > watermark` cursor, so each session was read once at Start and all later traffic was invisible — usage silently froze at zero. Fixed by reading two sources: new rows by watermark **plus** a re-read of every still-open session (`radius.getAccountingByUniqueIds`). Pinned by `tests/isp-accounting.test.js`. The watermark must advance only on genuinely new rows.

### Known, deliberate, not-bugs

- Seeded NAS `192.168.88.1` is unreachable on purpose — exercises router-error paths. Suspend still succeeds with `errors[]` populated; that is correct (policy already landed).
- `tests/fifo-costing.test.js` **fails and is pre-existing** — POS/sales (Dev 3), 403 vs 201. Verified it fails identically with `.env` removed; no non-ISP file was touched.
- Full `npm test` hangs on a pre-existing open handle; use `npm run isp:test` (`--forceExit`).

### Still unproven — needs the CHR lab

1. FreeRADIUS actually accepts our `radcheck`/`radgroupreply` rows
2. **`Mikrotik-Rate-Limit` direction** — that `2M/10M` really is 2 up / 10 down (highest-risk)
3. A live session is genuinely dropped by `POST /rest/ppp/active/remove`
4. FreeRADIUS itself enforces the `Calling-Station-Id ==` device lock

Lab checklist: [ISP_LEARN.md §13](ISP_LEARN.md#13-your-lab-build-it-yourself-in-an-evening).
