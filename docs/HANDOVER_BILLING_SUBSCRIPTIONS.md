# Billing, Subscriptions & Payments Handover

## 1. Overview

This repository is not Laravel/PHP. It is a **Node.js 22 + Express 4 + MySQL 8** application with an existing POS/ERP codebase that has been extended to include ISP billing and RADIUS integration.

The Billing, Subscriptions & Payments module should be implemented inside this existing app, not as a separate Laravel service, unless the client explicitly demands a rewrite before work begins.

## 2. Current architecture

### 2.1 Main backend structure

- `server/server.js` — app bootstrap, middleware, route mounting, static asset serving, and ISP job startup.
- `server/config/database.js` — primary MySQL pool for application data.
- `server/config/radius-db.js` — separate MySQL pool for FreeRADIUS schema.
- `server/routes` — Express routing layer.
- `server/controllers` — controller actions for REST endpoints.
- `server/services` — domain logic and integration services.
- `server/jobs/isp-jobs.js` — periodic ISP job scheduler.

### 2.2 Key modules relevant to billing/subscriptions

- `server/routes/isp.routes.js` — ISP management API mounted at `/api/isp`.
- `server/services/isp/lifecycle.service.js` — subscriber lifecycle contract used by billing.
- `server/services/isp/provisioning.service.js` — writes subscribers/packages into RADIUS.
- `server/services/isp/accounting.service.js` — ingests FreeRADIUS `radacct` usage data.
- `server/services/isp/routeros.service.js` — RouterOS REST client used for live session actions.
- `server/routes/sale.routes.js` — invoice creation and payment processing endpoints.
- `server/controllers/portal.controller.js` — storefront/portal order and invoice views.

### 2.3 Authentication and authorization

- `server/middleware/auth.middleware.js` — verifies JWT from `token` cookie.
- `server/middleware/rbac.middleware.js` — role-permission checks using `roles` / `role_permissions`.
- `server/middleware/validation.middleware.js` — request validation helpers.
- Customer portal uses `customerToken` cookie and is separate from admin JWT auth.

## 3. ISP billing and subscription model

### 3.1 Current ISP tables

Located in `database/migrations/isp/001_isp_core.sql`.

- `isp_packages` — tariff plans, speed limits, data caps, validity, and radius group names.
- `isp_subscribers` — subscribers with status, RADIUS username, encrypted secret, package, billing cycle and grace window.
- `isp_subscriptions` — billing periods. This is the shared contract between Dev 1 and Dev 2.

### 3.2 Shared integration surface with the billing engine (Section B)

The billing engine must use the following contract:

- `isp_subscriptions` is the billing record table. Dev 2 owns:
  - `status`
  - `invoice_ref`
  - `paid_at`
- Dev 1 owns the rest of `isp_subscriptions`.
- Dev 2 must also consume `GET /api/isp/subscribers/billable` to discover due subscribers.
- Dev 2 should call the lifecycle endpoints to change subscriber state:
  - `POST /api/isp/subscribers/:id/activate`
  - `POST /api/isp/subscribers/:id/suspend`
  - `POST /api/isp/subscribers/:id/restore`
  - `POST /api/isp/subscribers/:id/grace`
  - `POST /api/isp/subscribers/:id/terminate`

### 3.3 Lifecycle service responsibilities

`server/services/isp/lifecycle.service.js` is the main billing-facing implementation.

It provides:

- `activateSubscriber()` — idempotently activates a subscriber and sets `billing_cycle_start` / `billing_cycle_end`.
- `suspendSubscriber()` — blocks future logins and disconnects any live session.
- `restoreSubscriber()` — idempotently restores a subscriber after payment. It guards against duplicate webhook calls.
- `graceSubscriber()` — moves a subscriber into grace.
- `terminateSubscriber()` — terminates and blocks a subscriber permanently.
- `getBillableSubscribers()` — returns subscribers whose `billing_cycle_end` has arrived and need charging.

Important:

- This service is intentionally idempotent. Duplicate payment notifications must not extend the billing cycle more than once.
- Suspension is two-layered: RADIUS policy change and live session disconnect.

## 4. Payments implementation status

### 4.1 Existing invoice/payment flow

`server/routes/sale.routes.js` currently supports:

- `GET /api/sales` — invoice listing and filtering.
- `GET /api/sales/:id` — invoice detail, items, and payment records.
- `PUT /api/sales/:id/cancel` — invoice cancellation and stock restoration.
- `PUT /api/sales/:id/payment` — receive payment against pending invoices.
- `POST /api/sales` — create sales/invoices with checkout logic.

Payment semantics:

- `sale_payments` records all payments, including `CREDIT` rows for outstanding balances.
- `sales.payment_status` is one of `paid`, `partial`, `pending`.
- `sales.status` is `completed`, `pending`, or `cancelled`.
- The route supports legacy `payment_method` and new `payments` arrays.
- For `CREDIT` sales, customer validation is required.
- Partial payments are supported and converted to `partial`.
- Overpayments are rejected.

### 4.2 Portal checkout

`server/controllers/portal.controller.js` supports a storefront-style checkout:

- `POST /api/portal/login` — passwordless customer login via email.
- `GET /api/portal/profile` — customer profile and dynamic plan summary.
- `GET /api/portal/invoices` — invoice history for the logged-in customer.
- `POST /api/portal/orders` — submit an order and create a sales invoice.

The portal uses a `customerToken` cookie carrying `customer.id` as a string.

### 4.3 Payment gateway support

There is no backend implementation for actual mobile money or Paystack gateway callbacks in this repo. Search results show references to M-Pesa/Daraja in docs and tests, but there are no webhook or payment provider endpoints implemented.

The repo currently assumes external billing/payment engine integration rather than full payment capture.

### 4.4 Relevant database schema

- `sales` — invoice header and status.
- `sale_payments` — payment ledger for each sale.
- `customers` — customer master data used by portal and credit sales.
- `users`, `roles`, `role_permissions` — admin auth and permission data.

## 5. RADIUS and router integration

### 5.1 FreeRADIUS database

- `server/config/radius-db.js` creates a separate pool to `henchamp_radius`.
- This pool is used by `server/services/isp/radius.service.js` and `provisioning.service.js`.
- The app treats the RADIUS schema as an integration surface and avoids cross-schema transactions.

### 5.2 RouterOS integration

- `server/services/isp/routeros.service.js` is a native RouterOS REST client using Node `https` / `http`.
- It is intentionally dependency-free.
- It requires RouterOS v7 REST API and supports:
  - live session listing
  - session termination
  - system info retrieval
- It also handles self-signed TLS in lab mode with `ISP_ROUTEROS_ALLOW_SELF_SIGNED`.

### 5.3 Provisioning semantics

- `provisioning.provisionPackage()` writes package policy to RADIUS group tables.
- `provisioning.provisionSubscriber()` writes subscriber credentials and group membership.
- `provisioning.changeSubscriberPackage()` moves a subscriber to a new package without changing auth.
- `provisioning.deprovisionSubscriber()` removes the subscriber from RADIUS.
- `provisioning.provisionVoucher()` and `provisionVoucherBatch()` manage hotspot vouchers.

### 5.4 Important detail

- `radius_secret_enc` is encrypted in the app database and decrypted only when provisioning. The cleartext password is not stored in plain text.
- `subscriber.radius_username` is the RADIUS username, usually derived from phone or provided explicitly.

## 6. What the new developer must implement

### 6.1 Billing engine responsibilities

Implement the Billing/Payments module to:

- Generate billing periods and invoices for ISP subscribers.
- Persist billing records into `isp_subscriptions`.
- Set the `status`, `invoice_ref`, and `paid_at` fields in `isp_subscriptions`.
- Use `GET /api/isp/subscribers/billable` to find customers due for charging.
- Call lifecycle endpoints when payments clear, when grace ends, or when suspension is required.
- Handle payment provider webhook retries safely:
  - duplicate webhook should return HTTP 200
  - duplicate restoration should not extend billing cycle twice
- Prefer using the existing invoice tables for shop orders and credit tracking if the payment provider must report actual cash collections.

### 6.2 Integration points

Billing should integrate with these APIs:

- `/api/isp/subscribers/billable` — due subscriber list
- `/api/isp/subscribers/:id/restore` — restore after payment
- `/api/isp/subscribers/:id/suspend` — suspend after grace expires
- `/api/isp/subscribers/:id/grace` — set grace period
- `/api/isp/subscribers/:id/activate` — first-time activation after first payment clears
- `/api/isp/subscribers/:id/terminate` — final termination

### 6.3 If building payment capture inside this repo

If this repo should also own payment gateway capture, then the missing pieces are:

- Payment gateway callback endpoints for M-Pesa Daraja and/or Paystack.
- A webhook verification layer.
- Mapping provider results into `isp_subscriptions` and `sale_payments`.
- A reconciliation / retry-safe handler to call `restoreSubscriber()` only once per payment.

### 6.4 If payment capture stays external

Then this repo should provide a stable billing surface and let the external service:

- write `isp_subscriptions` rows
- update `isp_subscriptions.status`, `invoice_ref`, `paid_at`
- call lifecycle endpoints via webhook or cron

## 7. Important caveats and risks

### 7.1 Stack mismatch

This is a Node.js/Express repo. Do not assume Laravel, Composer, or PHP tooling.

### 7.2 Timezone handling

- The app uses `DB_TIMEZONE` for database pool timezone.
- For Kenya, it must be `+03:00`.
- Use `server/config/database.js` and `server/config/radius-db.js` to ensure all DB timestamp handling matches.

### 7.3 RADIUS / router hardware requirement

- A real deployment requires a MikroTik router or CHR instance.
- The ISP logic can be developed and tested with MikroTik CHR.
- The router must have `www-ssl` enabled for REST API access.

### 7.4 `isp_subscriptions` is critical

- Changes to `isp_subscriptions` or `server/services/isp/lifecycle.service.js` must be coordinated with the billing owner (Dev 2).
- The shared surface is explicitly documented in `docs/ISP_PLAN.md` and `docs/GIT_WORKFLOW.md`.

### 7.5 Customer portal auth is weak

- `portal.controller.js` authenticates customers using only email and a cookie.
- This is acceptable for a simple portal demo, but it is not secure for production.

### 7.6 Payment provider support is not yet implemented

- There are docs and tests that mention M-Pesa, but no actual gateway integration code is present in the repo.
- This repo is currently a management/billing surface, not a full payment gateway handler.

## 8. Key files and entry points

- `docs/ISP_PLAN.md`
- `docs/ISP_MEMORY.md`
- `docs/MANUAL_TESTING.md`
- `server/server.js`
- `server/config/database.js`
- `server/config/radius-db.js`
- `server/routes/isp.routes.js`
- `server/controllers/isp-subscriber.controller.js`
- `server/services/isp/lifecycle.service.js`
- `server/services/isp/provisioning.service.js`
- `server/services/isp/accounting.service.js`
- `server/services/isp/routeros.service.js`
- `server/routes/sale.routes.js`
- `server/controllers/portal.controller.js`
- `database/migrations/isp/001_isp_core.sql`

## 9. Recommended next steps

1. Confirm whether Billing / Payments belongs in this repo or in an external service.
2. If external, define the exact webhook/API contract around `isp_subscriptions` and lifecycle endpoints.
3. If internal, implement payment provider callbacks and connect them to `isp_subscriptions` and lifecycle actions.
4. Validate deployment with a MikroTik CHR instance and a test FreeRADIUS database.
5. Add end-to-end tests for billing state transitions and idempotent payment webhook handling.

## 10. Summary

This repo already contains a functioning ISP management surface, RADIUS provisioning, and invoice/payment record support. The missing part is actual payment-provider integration and a billing engine that turns due subscribers into paid subscriptions, updates `isp_subscriptions`, and triggers the existing lifecycle API.

The core contract for the new developer is:

- keep `isp_subscriptions` stable
- use `getBillableSubscribers()` to find due accounts
- call lifecycle endpoints for state transitions
- honor idempotency for payment webhooks
- preserve the existing Node.js / Express / MySQL architecture
