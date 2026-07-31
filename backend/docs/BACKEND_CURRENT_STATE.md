# eSIMFlys Backend — Current State

**Audience:** the engineer (or AI agent) building the frontend.
**Purpose:** everything the backend does today, what works, what does not, and how to
integrate — without reading backend code.

**Verified against the running codebase on 2026-07-29.** Every route, model, command,
dependency and setting below was introspected from the live project, not written from
memory. Anything unproven is marked `UNVERIFIED`; anything absent is marked `NOT BUILT`.

**Status:** 310 automated tests · no migration drift · 24 business tables · 81 project
routes (40 admin, 10 agency, 29 storefront, 2 health — all counts introspected, not
estimated).

> ⚠️ One suite run showed a single intermittent failure that did not reproduce across six
> subsequent runs, including targeted repeats of the likeliest candidates. It is recorded as
> an open item in §13 rather than glossed over. It is **not** a known product defect — but
> treat "310 passing" as "passing on every run but one".

**Companion docs (real captured payloads):**
- [`API.md`](./API.md) — storefront API
- [`ADMIN_API.md`](./ADMIN_API.md) — platform + agency admin APIs
- [`../../FRONTEND_BUILD_GUIDE.md`](../../FRONTEND_BUILD_GUIDE.md) — build order and page mapping

---

## 1. Backend overview

A **modular Django 5.2 monolith** with Django REST Framework and PostgreSQL, serving three
surfaces:

| Surface | Namespace | Users |
|---|---|---|
| Storefront | `/api/v1/…` | public / travellers |
| Platform admin | `/api/v1/admin/…` | platform owner + staff |
| Travel agency | `/api/v1/agency/{organization_id}/…` | agency staff |

**The business model (confirmed):** the platform issues a **referral tracking code** to a
travel agency. The agency gives it to customers. The customer buys **on the public website
and pays full price — the code carries no discount**. It exists purely to attribute the
sale so the agency earns **20% commission**, redeemed monthly. The agency panel is
**reporting-only**.

**Everything runs today on stand-ins** for Stripe, the eSIM supplier and email. The API
contract does not change when real credentials arrive.

---

## 2. Folder and file structure

```
backend/
├── manage.py · pyproject.toml · Dockerfile · .env.example
├── README.md
├── docs/                    API.md · ADMIN_API.md · BACKEND_CURRENT_STATE.md
│                            · ADMIN_PANELS_BACKEND_IMPLEMENTATION_PLAN.md
├── data/eSIM_DB_Catalogue_Launch.xlsx        ← catalogue source of truth
├── config/
│   ├── settings.py          env-driven; production guard on missing secrets
│   ├── urls.py              route root + JSON handler500
│   └── wsgi.py · asgi.py
├── templates/emails/        order-confirmation · esim-ready · refund · topup
└── apps/
    ├── common/              base models · error envelope · pagination · encryption
    │                        · health · reset services + reset_full/reset_readonly
    ├── administration/      audit · roles · tenancy · permissions
    │   ├── admin_api/       /api/v1/admin/**   (serializers · views · urls)
    │   ├── agency_api/      /api/v1/agency/**  (serializers · views · urls)
    │   ├── services/        organizations · members · reports · operations · catalogue
    │   └── tests/           7 test modules
    ├── accounts/            User · Organization · OrganizationMember · PartnerCommission
    │                        · CommissionPayout · auth views · allauth adapter
    ├── catalog/             Country · Supplier · CatalogPlan · TopupProduct
    │                        · import_catalog · activate_demo_catalog · public read API
    ├── orders/              Cart · CartItem · PromoCode · Order · PromoRedemption
    │                        · OrderItem · Notification · checkout · notifications
    ├── payments/            Payment · WebhookEvent · Refund · RefundItem · stripe gateway
    └── esims/               EsimProfile · SupplierEvent · TopupFulfillment
                             · supplier gateway · process_jobs worker
```

---

## 3. System architecture

```
HTTP request
  ↓  DRF view (thin)
  ↓  Serializer  — validates external input, allowlist fields only
  ↓  Permission  — role + tenant checks
  ↓  Service     — owns all state changes, audits, transactions
  ↓  Model       — persistence + DB-level invariants (check constraints)
  ↓  Gateway     — Stripe / eSIM supplier, swappable (real ⇄ fake)
```

**Rules the code follows:**
- Views contain no business logic; **services own state changes** and run in transactions.
- All money is `BIGINT` **minor units** (cents). No floats, ever.
- Order items are **immutable snapshots** — a retired plan never changes order history.
- **Payment truth comes only from a verified Stripe webhook**, never the browser.
- Background work is **durable rows** claimed with `SELECT FOR UPDATE SKIP LOCKED`.
- Every financial/security action writes an **immutable audit row in the same transaction**.

**Gateway switching** (`config/settings.py`):
| Setting | Default | Effect |
|---|---|---|
| `PAYMENTS_GATEWAY` | `fake` (→ `stripe` when `STRIPE_SECRET_KEY` set) | Stripe real/stub |
| `SUPPLIER_GATEWAY` | `fake` (→ `esim_access` when API key set) | eSIM supplier real/stub |

⚠️ **Currently both are `fake`.** `SUPPLIER_GATEWAY=fake` is pinned in `.env` on purpose —
see §12.

---

## 4. Complete backend workflow

### 4.1 Customer purchase (works end to end today)
```
1. Browse         GET  /catalog/countries/  →  /catalog/countries/{slug}/plans/
2. Add to cart    POST /cart/items/            ← response header X-Cart-Token (guests)
3. Promo preview  POST /cart/promo-code/       (preview only, not persisted)
4. Checkout       POST /checkout/              → Order(pending_payment)
                  · cart locked (SELECT FOR UPDATE)
                  · every plan re-validated as active
                  · prices re-read from DB — client prices ignored
                  · promo reserved in a redemption ledger
                  · quantity expanded into one OrderItem per eSIM
5. Pay            POST /payments/payment-intent/ → client_secret
                  (total == 0 → {"zero_total": true}, skip payment entirely)
6. Confirm        Stripe → POST /webhooks/stripe/  (signature verified, idempotent)
                  · order → paid
                  · promo redemption consumed
                  · commission created (if agency code used)
                  · provisioning job enqueued
                  · order-confirmation email queued
7. Provision      worker: process_jobs
                  · supplier order → poll → credentials encrypted at rest
                  · order → fulfilled, eSIM → ready
                  · esim-ready email queued (contains NO credentials)
8. Deliver        GET /esims/{id}/  or  POST /orders/lookup/  → render QR
```

### 4.2 Agency lifecycle (works today)
```
Platform: POST /admin/organizations/                → agency (status "pending")
          POST /admin/organizations/{id}/approve/   → "active" (can now trade)
          POST /admin/organizations/{id}/members/   → creates their LOGIN + password
          POST /admin/organizations/{id}/tracking-codes/  → e.g. SUNRISE20, 20%
Agency:   logs in with the issued email + password → agency panel (reporting only)
Customer: buys on the public site using the code → pays full price
Platform: commission appears as "pending"
          POST /admin/commissions/{id}/approve/     → "approved"
          manage.py run_monthly_payouts             → draft payout for the month
          POST /admin/payouts/{id}/pay/             → "paid"
```

### 4.3 Refund (works today)
```
POST /admin/orders/{id}/refunds/  {allocations:[{order_item_id, amount_minor}]}
  → validates refundable balance (per payment AND per item)
  → Stripe refund (fake today)
  → order → refunded / partially_refunded
  → agency commission reversed proportionally
  → refund-confirmation email queued
```

### 4.4 Background worker
```
manage.py process_jobs [--once]
  drains supplier_events  (provision, topup)   ← SKIP LOCKED, backoff, max 8 attempts
  drains notifications    (email sending)
  exhausted → status "manual_review" (visible in the admin panel)
```
⚠️ **Without this process running, eSIMs are never provisioned and no email is sent.**

---

## 5. Authentication flow

**Session cookies + CSRF. No JWT.** By design — the backend never stores auth tokens in
browser-accessible storage.

### 5.1 The one architectural requirement
`SESSION_COOKIE_SAMESITE=Lax`, so a `fetch()` from `localhost:3000` → `localhost:8000` is
cross-origin and **the browser will not send the session cookie**. Login appears to succeed
and every later call is anonymous.

**Fix — proxy the backend under the frontend origin** (`next.config.mjs`):
```js
async rewrites() {
  return [
    { source: "/api/v1/:path*",   destination: "http://127.0.0.1:8000/api/v1/:path*" },
    { source: "/accounts/:path*", destination: "http://127.0.0.1:8000/accounts/:path*" },
  ];
}
```
Then call relative paths. Do **not** work around this with tokens.

### 5.2 Client contract
```js
await fetch("/api/v1/auth/csrf/", { credentials: "include" });   // once on boot
const csrf = () => document.cookie.split("; ")
  .find(c => c.startsWith("csrftoken="))?.split("=")[1];

fetch(url, {
  credentials: "include",                                        // EVERY request
  headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() }, // unsafe methods
});
```

### 5.3 Google sign-in (customers only)
Full-page redirect, not a fetch:
```html
<a href="/accounts/google/login/">Continue with Google</a>
```
Google → backend callback → session issued → redirect to `FRONTEND_BASE_URL/account`.
Then call `GET /api/v1/account/me/`.

- Links to an existing account **only on a Google-verified email** (no duplicate accounts,
  no takeover by claiming an address).
- **Blocked for agency accounts** → redirects to
  `FRONTEND_BASE_URL/auth/signin?error=social_login_not_allowed_for_agency`.
  Show a message telling them to use their issued password.
- Use `localhost`, **not** `127.0.0.1` — Google treats them as different origins.

### 5.4 Three account types
| Type | How created | Login | Password reset |
|---|---|---|---|
| **Customer** | self-registers, or Google | password or Google | self-service email |
| **Agency staff** | **created by platform admin** | password only | **platform only** |
| **Platform staff** | Django admin / seed command | password | Django admin |

Agency accounts cannot self-register, cannot use Google, and **cannot reset their own
password** — `/auth/password-reset/` silently sends nothing for them (still returns `200`,
so it does not reveal which emails are agency accounts).

⚠️ **`is_staff` alone grants NO platform API access.** Platform capability comes from a
Django **group** (`platform_admin`, `support_admin`, `finance_admin`, `readonly_admin`) or
`is_superuser`. A hand-made staff user logs in and then gets `403` everywhere.

### 5.5 Getting test accounts
```bash
python manage.py seed_demo_accounts
```
Creates 5 platform accounts + 4 agency accounts (all roles), an active agency, and tracking
code `SUNRISE20`. Prints the agency's `organization_id`. Password: `DevPass!2345`. Idempotent.

| Account | Role |
|---|---|
| `root@esimflys.test` | superuser |
| `platform@esimflys.test` | platform_admin |
| `support@esimflys.test` | support_admin (no refunds, no pricing) |
| `finance@esimflys.test` | finance_admin (refunds, **no** credential reveal) |
| `readonly@esimflys.test` | readonly_admin |
| `agency-owner@ / agency-admin@ / agency-buyer@ / agency-viewer@esimflys.test` | agency roles |

---

## 6. Roles and permissions

### 6.1 Platform roles
| Capability | superuser | platform_admin | support | finance | readonly |
|---|:-:|:-:|:-:|:-:|:-:|
| view dashboard/orders/customers/eSIMs/ops/audit/reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| manage agencies · members · tracking codes | ✅ | ✅ | ❌ | ❌ | ❌ |
| manage catalogue (activate plans, import) | ✅ | ✅ | ❌ | ❌ | ❌ |
| **change prices** (and see `margin`/`wholesale`) | ✅ | ✅ | ❌ | ❌ | ❌ |
| **execute refunds** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **reveal eSIM credentials** | ✅ | ✅ | ✅ | ❌ | ❌ |
| approve commissions / pay payouts | ✅ | ✅ | ❌ | ✅ | ❌ |

### 6.2 Agency roles
| Capability | owner | admin | buyer | viewer |
|---|:-:|:-:|:-:|:-:|
| dashboard · sales · commissions · payouts · reports · tracking codes | ✅ | ✅ | ✅ | ✅ |
| manage profile | ✅ | ✅ | ❌ | ❌ |
| manage staff | ✅ | ✅ | ❌ | ❌ |
| view activity log | ✅ | ✅ | ❌ | ❌ |
| **edit commission rate · execute refunds · create orders** | ❌ | ❌ | ❌ | ❌ |

A member may only grant roles **strictly below their own** (an `admin` cannot create an
`owner`). The **last active owner** cannot be demoted, disabled or removed.

⚠️ Implementation nuance: some agency views are gated at `agency.view_dashboard` and check
the stronger capability **inside** the write branch. So a `viewer` can `GET
/agency/{id}/profile/` and `GET /agency/{id}/members/`, but `PATCH`/`POST` returns `403`.
Build the UI to hide the controls **and** handle the `403`.

---

## 7. API endpoints

Conventions for every endpoint below:
- **Money** = integer minor units. `1699` = $16.99. Exceptions: `price_from`,
  `price_per_day` arrive as `{"amount": "0.57", "currency": "USD"}`.
- **Errors** = `{"error": {"code", "message", "fields"}}` (see §9).
- **Auth** = session cookie; unsafe methods need `X-CSRFToken`.
- Paginated = `{count, next, previous, results}`. Plain = a bare JSON array.

### 7.1 Health — public
| Method | Route | Purpose | Response |
|---|---|---|---|
| GET | `/health/live/` | process alive | `{"status":"live"}` |
| GET | `/health/ready/` | DB reachable | `200` ready / `503` not_ready |

---

### 7.2 Catalogue — public, no auth
#### `GET /api/v1/catalog/countries/`
Purpose: country grid / destination list. **Plain array** (all 68).
Frontend: home page, `/destinations`.
```json
{ "iso2": "SA", "name": "Saudi Arabia", "slug": "saudi-arabia",
  "region": "Middle East & N.Africa", "flag_emoji": "🇸🇦", "timezone": null,
  "is_popular": true, "homepage_badge": "popular",
  "price_from": null, "plan_count": 0 }
```
`homepage_badge` ∈ `null | "popular" | "best_value"`. `price_from` is the cheapest per-day
price across **active** plans, or `null` when none. Sorted by curated `sort_order`.

#### `GET /api/v1/catalog/countries/{slug}/`
One country, same shape. Errors: `404` (unknown or inactive country).
Frontend: `/esim/[slug]` header.

#### `GET /api/v1/catalog/countries/{slug}/plans/`
**Plain array** of that country's **active** plans. `404` if the country is inactive.
Frontend: plan selector on `/esim/[slug]`.
```json
{ "product_code": "AL-10GB-30D-V1", "plan_type": "fixed",
  "display_name": "Albania 10 GB — 30 Days",
  "data_limit_mb": 10000, "daily_high_speed_mb": null, "day_count": null,
  "validity_days": 30,
  "traffic_policy": "Maximum data 10GB at full speed; …",
  "hotspot_supported": null, "network_names": ["One Albania 5G"],
  "topup_supported": true, "retail_amount_minor": 1699, "currency": "USD",
  "price_per_day": { "amount": "0.57", "currency": "USD" },
  "badge": "popular", "is_default_selected": true, "sort_order": 1 }
```
- `plan_type: "fixed"` → show `data_limit_mb` (total). `"daily"` → show
  `daily_high_speed_mb` per day + `day_count`.
- `is_default_selected` → pre-select this plan (exactly one per country).
- `hotspot_supported: null` means **unknown** — render "unknown", not "no". It is `null`
  for every plan today.

#### `GET /api/v1/catalog/plans/{product_code}/`
One active plan + nested `country {iso2,name,slug,flag_emoji}`. `404` if paused/retired.

---

### 7.3 Cart — public (guest via `X-Cart-Token`, or logged in)
| Method | Route | Body | Notes |
|---|---|---|---|
| GET | `/api/v1/cart/` | — | empty cart returns `{"id": null, "items": [], "subtotal_minor": 0}` |
| POST | `/api/v1/cart/items/` | `{product_code, quantity=1}` | **201**; sets `X-Cart-Token` header on first call |
| PATCH | `/api/v1/cart/items/{item_id}/` | `{quantity}` | 1–1000 |
| DELETE | `/api/v1/cart/items/{item_id}/` | — | returns the cart |
| POST | `/api/v1/cart/promo-code/` | `{code, customer_email?}` | **preview only** |
| DELETE | `/api/v1/cart/promo-code/` | — | `204` |

**Guest token:** the first `POST /cart/items/` returns header `X-Cart-Token`. Persist it
(localStorage) and send it on every later cart/checkout call, or the guest's cart is lost.
Logged-in users don't need it.
```json
{ "id": "e45860a5-…", "currency": "USD", "status": "active",
  "items": [ { "id": "1c40b9f1-…", "product_code": "AL-10GB-30D-V1",
               "display_name": "Albania 10 GB — 30 Days", "plan_type": "fixed",
               "quantity": 2, "unit_amount_minor": 1699, "currency": "USD",
               "line_total_minor": 3398 } ],
  "subtotal_minor": 3398, "item_count": 2 }
```
Promo preview response:
```json
{ "code": "WELCOME10", "discount_minor": 339, "subtotal_minor": 3398,
  "total_minor": 3059, "currency": "USD" }
```
Errors: `plan_unavailable` 409 · `invalid_quantity` 400 · `promo_invalid` 422 ·
`promo_expired` 422 · `promo_usage_exceeded` 409 · `not_found` 404 (no active cart).
⚠️ The preview does **not** persist — resend `promo_code` to `/checkout/`.

---

### 7.4 Checkout
#### `POST /api/v1/checkout/`
Auth: public (send `X-Cart-Token` for guests). Throttle `checkout` 30/min.
Body: `{customer_email?, promo_code?}` — email **required for guests**, defaults to the
account email when logged in. → **201**
```json
{ "id": "a0ff1ad9-…", "order_number": "ESF-C39D2A50DC19",
  "customer_email": "dev@example.com", "currency": "USD",
  "subtotal_minor": 3398, "discount_minor": 0, "tax_minor": 0, "total_minor": 3398,
  "status": "pending_payment", "payment_status": "pending",
  "fulfillment_status": "pending",
  "placed_at": "2026-07-22T21:06:07.578639Z", "promo_code_snapshot": null,
  "items": [ { "id": "2419e397-…", "item_type": "esim",
               "product_code": "AL-10GB-30D-V1",
               "product_name": "Albania 10 GB — 30 Days",
               "country_iso2": "AL", "country_name": "Albania",
               "plan_type": "fixed", "data_limit_mb": 10000,
               "daily_high_speed_mb": null, "validity_days": 30,
               "network_names": ["One Albania 5G"],
               "unit_amount_minor": 1699, "currency": "USD", "status": "pending" } ] }
```
**Quantity 2 becomes 2 separate order items** — one per eSIM. Always
`total = subtotal − discount + tax`.
Errors: `validation_error` 400 (missing email) · `conflict` 409 (empty cart / already
checked out) · `cart_expired` 409 · `plan_unavailable` 409 · promo errors.
Frontend: `/checkout`.

**Order state machines**
- `status`: `pending_payment → paid → fulfilling → partially_fulfilled → fulfilled`
  (+ `cancelled`, `partially_refunded`, `refunded`, `failed`)
- `payment_status`: `pending → processing → paid` (+ `failed`, `cancelled`,
  `partially_refunded`, `refunded`)
- `fulfillment_status`: `pending → processing → partially_delivered → delivered`
  (+ `failed`, `cancelled`)

---

### 7.5 Payments
#### `POST /api/v1/payments/payment-intent/`
Auth: public; owner-checked when the order belongs to a user. Throttle `payment` 30/min.
Body `{order_id}` → **200**
```json
{ "client_secret": "pi_fake_565041b00febea970efceba2_secret",
  "payment_id": "43a51296-…", "amount_minor": 3398, "currency": "USD" }
```
Zero-total orders (100% promo) instead return
`{"zero_total": true, "client_secret": null, "payment_status": "paid"}` — **skip payment
entirely**.
Errors: `payment_already_completed` 409 · `conflict` 409 (not awaiting payment) ·
`not_found` 404.

> 🚧 **`client_secret` is a stub today** (`pi_fake_…`). **Do not pass it to Stripe.js yet.**
> Build the flow; it becomes a real PaymentIntent secret when keys land, with no contract
> change.

#### `POST /api/v1/webhooks/stripe/`
Server-to-server only. **Never call from the frontend.** Signature-verified, idempotent by
event id, reconciles amount + currency + order reference. Invalid signature → `400`,
mismatch → `409`, and the order is **never** marked paid.

**Payment truth is the webhook.** After confirming, poll `GET /orders/{id}/` until
`payment_status === "paid"`, then until `fulfillment_status === "delivered"`.

---

### 7.6 Orders
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/orders/` | required | **paginated**, own orders only |
| GET | `/api/v1/orders/{id}/` | required | own orders only; `404` otherwise |
| POST | `/api/v1/orders/lookup/` | public | guest retrieval; throttle `lookup` **10/min** |

#### `POST /api/v1/orders/lookup/`
Body `{order_number, email}` — the email must match the order. Returns the order **and its
eSIM credentials**. Every call (success and failure) is audited.
```json
{ "order": { … order object … },
  "esims": [ { "status": "ready", "product_name": "Albania 10 GB — 30 Days",
               "iccid_last4": "1502",
               "credentials": { "iccid": "8944138302270011502",
                                "smdp_address": "smdp.fake-esim.example.com",
                                "activation_code": "13317BD174",
                                "qr_payload": "LPA:1$smdp.fake-esim.example.com$13317BD174",
                                "qr_code_url": "https://…/qr/….png",
                                "short_url": "https://…/i/…" } } ] }
```
Render `qr_payload` as a QR code (or show `qr_code_url` / `short_url` when present).
Errors: `not_found` 404 (wrong email or unknown order) · `rate_limited` 429.
Frontend: "find my order" page.

---

### 7.7 eSIMs — auth required, owner-scoped
| Method | Route | Purpose | Notes |
|---|---|---|---|
| GET | `/api/v1/esims/` | my eSIMs | **paginated**; **no credentials** |
| GET | `/api/v1/esims/{id}/` | detail | **adds `credentials`** |
| POST | `/api/v1/esims/{id}/refresh-usage/` | re-sync usage | throttle `usage` 20/min |
| GET | `/api/v1/esims/{id}/topups/` | offers + history | `{available:[…], history:[…]}` |
| POST | `/api/v1/esims/{id}/topups/` | buy a top-up | `{topup_product_code}` → **201 order** |

List fields: `id, status, product_name, country_iso2, country_name, plan_type,
validity_days, iccid_last4, total_data_bytes, remaining_data_bytes, installed_at,
activated_at, expires_at, last_synced_at`.

`status`: `pending → provisioning → ready` (then `installed`/`active`/`expired`, or
`failed`/`manual_review`). Show a spinner until `ready`.

⚠️ **Usage is in bytes**; plan allowances are in **MB** (1 GB = 1000 MB). Don't mix them.
⚠️ Supplier usage figures **lag 1–3 hours** — label with `last_synced_at`, never "live".
Buying a top-up returns a normal **order** → pay it via `/payments/payment-intent/`.
Errors: `403`/`404` for non-owners · `topup_not_supported` 422 · `esim_not_ready`.
Frontend: `/account/esims`.

---

### 7.8 Auth & account
| Method | Route | Body | Notes |
|---|---|---|---|
| GET | `/api/v1/auth/csrf/` | — | `{"csrfToken": "…"}` — call once on boot |
| POST | `/api/v1/auth/register/` | `{email, password, first_name?, last_name?}` | **201**, logs in. Throttle `auth` 10/min |
| POST | `/api/v1/auth/login/` | `{email, password}` | `200` |
| POST | `/api/v1/auth/logout/` | — | `204` (auth required) |
| GET/PATCH | `/api/v1/account/me/` | PATCH `{first_name, last_name, preferred_currency}` | auth required |
| POST | `/api/v1/auth/password-reset/` | `{email}` | **always 200** (no enumeration) |
| POST | `/api/v1/auth/password-reset/confirm/` | `{uid, token, new_password}` | `400` on bad token |

```json
{ "id": "ec7a7e86-…", "email": "doc@example.com", "first_name": "", "last_name": "",
  "preferred_currency": "USD", "email_verified_at": null }
```
Password rules are Django's validators — surface `fields.password`. Reset emails print to
the **server console** today. Errors: `invalid_credentials` 401 · `validation_error` 400 ·
`rate_limited` 429.
Frontend: `/auth/signin`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`,
`/account`.

---

### 7.9 Organizations (customer-facing, for the tenant switcher)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/organizations/` | orgs the logged-in user belongs to (**paginated**) |
| GET | `/api/v1/organizations/{id}/` | one org |
| GET | `/api/v1/organizations/{id}/commissions/` | its commissions |
| GET | `/api/v1/organizations/{id}/payouts/` | its payouts |

Use the list to discover the agency's `organization_id` for the agency panel. Non-members
get an empty list / `404`.

---

### 7.10 Platform admin API — `/api/v1/admin/` (40 routes)
All require a platform role **and** the listed capability. Throttle `admin` 60/min.
**Full payloads: [`ADMIN_API.md`](./ADMIN_API.md) §3.**

| Method | Route | Purpose | Capability |
|---|---|---|---|
| GET | `dashboard/` | GMV, orders, eSIMs, commission liability, ops health | `view_dashboard` |
| GET | `reports/revenue/` | daily revenue series | `view_reports` |
| GET,POST | `organizations/` | list / create agency (starts `pending`) | `manage_agency` |
| GET,PATCH | `organizations/{id}/` | detail / edit (**status read-only**) | `manage_agency` |
| POST | `organizations/{id}/{approve\|suspend\|activate\|reject\|close}/` | lifecycle; **suspend requires `reason`** | `manage_agency` |
| GET,POST | `organizations/{id}/members/` | list / **create their login + password** | `manage_agency` |
| PATCH,DELETE | `organizations/{id}/members/{mid}/` | change role/status, remove | `manage_agency` |
| POST | `organizations/{id}/members/{mid}/set-password/` | admin password reset (kills sessions) | `manage_agency` |
| GET,POST | `organizations/{id}/tracking-codes/` | list / issue referral code (20% default) | `manage_agency` |
| GET | `orders/` `orders/{id}/` | order search / detail (items, payments, eSIMs) | `view_order` |
| POST | `orders/{id}/refunds/` | **execute refund** (per-item allocations) | `execute_refund` |
| GET | `customers/` `customers/{id}/` | customer search / detail (**audited**) | `view_customer` |
| GET | `payments/` · `refunds/` | payment / refund lists | `view_order` / `execute_refund` |
| GET | `esims/` `esims/{id}/` | eSIM list / detail (**no credentials**) | `view_esim` |
| POST | `esims/{id}/reveal/` | **decrypted credentials**; audited; 10/hour | `reveal_credentials` |
| POST | `esims/{id}/refresh-usage/` | re-sync usage | `view_esim` |
| GET | `supplier-events/` · `notifications/` | job queues | `view_ops` |
| POST | `supplier-events/{id}/retry/` · `notifications/{id}/retry/` | requeue | `view_ops` |
| GET | `commissions/` | filter `?status=&organization=&date_from=&date_to=&unpaid=true` | `manage_commission_rate` |
| POST | `commissions/{id}/approve/` · `commissions/bulk-approve/` | approve | `manage_commission_rate` |
| GET,POST | `payouts/` | list / create for `{organization, period_start, period_end}` | `manage_commission_rate` |
| POST | `payouts/{id}/pay/` | mark paid `{reference?, method?}` | `manage_commission_rate` |
| GET | `countries/` (plain array) · GET,PATCH `countries/{id}/` | catalogue countries | `manage_catalog` |
| POST | `countries/{id}/activate-plans/` | **turn on all sellable plans** (go-live) | `manage_catalog` |
| GET | `plans/` · GET,PATCH `plans/{id}/` | catalogue plans | `manage_catalog` |
| POST | `plans/{id}/{activate\|pause\|draft}/` · `plans/bulk-status/` | **status by action** | `manage_catalog` |
| POST | `catalog/import/` | re-import workbook (never activates) | `manage_catalog` |
| GET | `topup-products/` · PATCH `topup-products/{id}/` | top-up products | `manage_catalog` |
| GET | `audit-events/` | immutable trail (`?action=&actor_type=&organization=`) | `view_audit` |

**Behaviours that shape the UI**
- **Status changes are actions, not field edits.** `PATCH {"status": "active"}` is silently
  ignored on organizations and plans — use the action routes.
- **`margin_minor` and `wholesale_amount_minor` are omitted entirely** for roles without
  `manage_pricing`. Never assume the keys exist.
- **Bulk endpoints never abort** — `{updated: [...], failed: [{id, error}], status}`.
  Surface partial success.
- **Retry only from `failed`/`manual_review`/`retrying`** — retrying a `succeeded` supplier
  job returns `409` (it could buy a second eSIM).
- **Audit log is read-only** — `POST`/`PATCH`/`DELETE` → `405`.
- **Retired plans cannot be changed** → `409 plan_not_activatable`.
- Creating an agency login: `{email, role, password, first_name?, last_name?}`; response adds
  `"login_created": true|false`. Omitting the password for a new email → `400` with
  `fields.password`.

---

### 7.11 Agency API — `/api/v1/agency/{organization_id}/` (10 routes)
Reporting only. Throttle `agency` 120/min. **Full payloads: [`ADMIN_API.md`](./ADMIN_API.md) §4.**

| Method | Route | Purpose | Roles |
|---|---|---|---|
| GET | `dashboard/` | attributed sales + commission totals | all |
| GET,PATCH | `profile/` | view / edit name, emails, country | GET all · PATCH owner/admin |
| GET,POST | `members/` | list / add staff | GET all · POST owner/admin |
| PATCH,DELETE | `members/{mid}/` | change role/status, remove | owner/admin |
| GET | `sales/` | **attributed sales (paginated)** | all |
| GET | `commissions/` | commission ledger `?status=` | all |
| GET | `payouts/` | settlement history | all |
| GET | `tracking-codes/` | their codes (**read-only**) | all |
| GET | `reports/revenue/` | daily series | all |
| GET | `activity/` | their audit events | owner/admin |

```json
// GET dashboard/
{ "currency": "USD",
  "attributed_sales": { "order_count": 1, "total_minor": 3398 },
  "commissions": { "earned_minor": 679, "reversed_minor": 0,
                   "outstanding_minor": 679, "paid_minor": 0 },
  "payouts": { "paid_out_minor": 0, "payout_count": 0 } }

// GET sales/  → results[0]   ← NOTE what is absent
{ "id": "7a38968d-…", "order_number": "ESF-CEFBC29ACDF2", "currency": "USD",
  "total_minor": 3398, "status": "fulfilled", "payment_status": "paid",
  "placed_at": "…", "promo_code_snapshot": "SUNRISE20",
  "commission_minor": 679, "commission_status": "pending" }
```

**Non-negotiable UI constraints**
- **There is no customer data.** The sales payload has **no `customer_email` field at all**.
  Do not build a customer column, search, or detail view — nothing is behind it.
- **No eSIM credentials, no eSIM endpoint** in agency scope.
- **Commission rate and status are read-only** — render disabled; writes are ignored.
- **Agencies cannot issue their own codes.**
- **`404` means "not yours or doesn't exist"** — deliberately indistinguishable. Show a
  generic not-found, never "you lack permission to view agency X".
- Show **`net_minor`** (`commission_minor − reversed_minor`) as the headline — refunds claw
  commission back.
- A **suspended agency** loses access: every route returns `404`.

---

## 8. Database models and relationships

24 business tables. UUID primary keys, `created_at`/`updated_at` everywhere (plus a Postgres
`set_updated_at` trigger so direct SQL updates are covered), money as `BIGINT` minor units,
emails as `citext` (case-insensitive).

| App | Models → tables |
|---|---|
| accounts | `User→users` · `Organization→organizations` · `OrganizationMember→organization_members` · `PartnerCommission→partner_commissions` · `CommissionPayout→commission_payouts` |
| catalog | `Country→countries` · `Supplier→suppliers` · `CatalogPlan→catalog_plans` · `TopupProduct→topup_products` |
| orders | `Cart→carts` · `CartItem→cart_items` · `PromoCode→promo_codes` · `Order→orders` · `PromoRedemption→promo_redemptions` · `OrderItem→order_items` · `Notification→notifications` |
| payments | `Payment→payments` · `WebhookEvent→webhook_events` · `Refund→refunds` · `RefundItem→refund_items` |
| esims | `EsimProfile→esim_profiles` · `SupplierEvent→supplier_events` · `TopupFulfillment→topup_fulfillments` |
| administration | `AuditEvent→audit_events` (append-only: no `updated_at`) |

### Key relationships
```
Country 1─N CatalogPlan N─1 Supplier
Cart 1─N CartItem ─→ CatalogPlan
Order 1─N OrderItem  (one row per eSIM — NO quantity column)
OrderItem 1─0..1 EsimProfile        (encrypted credentials)
OrderItem 1─0..1 TopupFulfillment
Order 1─N Payment 1─N Refund 1─N RefundItem ─→ OrderItem
Order ─→ PromoCode ─→ Organization  (referring agency)
Organization 1─N PartnerCommission ─→ CommissionPayout
Organization N─N User  via OrganizationMember (role + status)
```

### Things worth knowing
- **`PromoCode.kind`** is `discount` or `tracking`. A **tracking** code is forced by DB
  constraint to `discount_value = 0` and must belong to an organization — it can never be
  edited into a discount.
- **`OrderItem` is an immutable snapshot** (product name, price, allowances, networks), so
  order history survives plan retirement or price changes.
- **`EsimProfile`** stores `iccid_encrypted`, `activation_code_encrypted`,
  `qr_payload_encrypted`, `qr_code_url_encrypted`, `short_url_encrypted`,
  `smdp_address_encrypted` + an `iccid_hash` HMAC blind index + `iccid_last4` +
  `encryption_key_version`. Credentials are returned only via the owner detail endpoint,
  guest lookup, or the audited admin reveal.
- **`Order.buyer_organization` and `Cart.organization` exist but are never set** — agency
  purchasing is out of scope. Ignore them.
- Commission statuses: `pending → approved → paid` (+ `reversed`, `cancelled`, `available`).
  Payout statuses: `draft → approved → processing → paid` (+ `failed`, `cancelled`).

---

## 9. Error responses

One envelope everywhere:
```json
{ "error": { "code": "plan_unavailable", "message": "This plan is currently unavailable.",
             "fields": {} } }
```
Render `message`; branch on `code`; `fields` holds per-field validation errors. Build one
error mapper in the API client.

| Code | HTTP | Meaning / UI action |
|---|---|---|
| `validation_error` | 400 | show `fields` inline on the form |
| `invalid_credentials` | 401 | wrong email/password |
| `authentication_required` | 401/403 | redirect to login |
| `permission_denied` | 403 | role lacks the capability |
| `not_found` | 404 | missing, **or another tenant's** |
| `plan_unavailable` | 409 | catalogue changed — refresh |
| `cart_expired` | 409 | start a new cart |
| `conflict` | 409 | wrong state (empty cart, already checked out, retry of a succeeded job) |
| `payment_already_completed` | 409 | go to confirmation |
| `payment_mismatch` | 409 | payment didn't reconcile |
| `invalid_status_transition` | 409 | illegal org/plan lifecycle move (message lists what's allowed) |
| `last_owner_protected` | 409 | would leave the agency ownerless |
| `commission_not_approvable` | 409 | already settled, or fully reversed |
| `nothing_to_pay_out` | 409 | no approved commissions in that period |
| `payout_already_paid` | 409 | double-payment blocked |
| `plan_not_activatable` | 409 | retired plan, or illegal status move |
| `refund_limit_exceeded` | 409 | over the refundable balance |
| `promo_invalid` / `promo_expired` | 422 | bad code |
| `promo_usage_exceeded` | 409 | limit reached |
| `topup_not_supported` | 422 | incompatible with this eSIM |
| `rate_limited` | 429 | back off; show a friendly message |
| `internal_error` | 500 | includes a `correlation_id` for support |

**Rate limits:** auth 10/min · checkout 30/min · payment 30/min · promo 30/min ·
**order lookup 10/min** · admin 60/min · agency 120/min · **credential reveal 10/hour** ·
export 5/hour.

---

## 10. Edge cases the frontend must handle

1. **Empty catalogue is the production default.** All 385 plans ship `paused`, so you get 68
   countries with `price_from: null` and empty plan lists. **Design a real empty state.**
   For development run `python manage.py activate_demo_catalog`.
2. **Inconsistent list shapes** — plain arrays for `/catalog/countries/`,
   `/catalog/countries/{slug}/plans/`, `/admin/countries/`, `/admin/payouts/`,
   agency `tracking-codes/` and `members/`; paginated envelopes elsewhere. Check per endpoint.
3. **Guest token is returned once**, as a response header. Lose it, lose the cart.
4. **Zero-total orders** skip payment entirely (`zero_total: true`).
5. **Provisioning is asynchronous.** After payment the eSIM is not instant — poll
   `fulfillment_status` / eSIM `status` until `ready`. If the worker isn't running it never
   becomes ready.
6. **Usage lags 1–3 hours** — always show `last_synced_at`.
7. **`hotspot_supported` is `null` everywhere** → "unknown", not "no".
8. **Data units differ**: allowances MB, usage bytes.
9. **Absent keys, not null** — `margin`/`wholesale` are *omitted* for unauthorised roles.
10. **404 for cross-tenant** — never say "you lack permission to view agency X".
11. **Agency Google login is refused** → handle `?error=social_login_not_allowed_for_agency`.
12. **Agencies can't reset their own password** — the reset form still returns success, so
    the agency login page should tell them to contact the platform instead.
13. **`suspend` requires a `reason`** — a missing one is a `400`, not a silent no-op.
14. **A suspended agency 404s everywhere** — handle a member losing access mid-session.
15. **Throttles are per-process in dev** (LocMemCache), so limits may appear looser locally.

---

## 11. Features already working (verified by tests + live runs)

| Area | Status |
|---|---|
| Catalogue import from Excel (68 countries / 385 plans) | ✅ idempotent, retires missing, never auto-activates |
| Public catalogue API + derived per-day pricing | ✅ |
| Cart (guest + authenticated), promo preview | ✅ |
| Checkout: server-side repricing, quantity expansion, immutable snapshots, promo reservation | ✅ |
| Payments: intent creation, signature-verified idempotent webhook, zero-total path | ✅ **on fake gateway** |
| eSIM provisioning: durable jobs, `SKIP LOCKED`, retry/backoff, manual review | ✅ **on fake supplier** |
| Credential encryption at rest + ICCID blind index | ✅ |
| Top-ups (buy for an owned eSIM, balance increases) | ✅ **on fake supplier** |
| Notifications (order, eSIM-ready, refund, top-up) | ✅ **console email**; eSIM-ready excludes secrets |
| Refunds + proportional commission reversal | ✅ |
| Agency tracking codes (0% discount / 20% commission, DB-enforced) | ✅ |
| Commission approve → monthly payout → mark paid | ✅ |
| Auth: register, login, logout, me, password reset | ✅ |
| Google OAuth (customers), blocked for agencies | ✅ config verified live; consent click is manual |
| Platform admin API (40 routes) | ✅ |
| Agency reporting panel (10 routes) | ✅ |
| Audit trail (append-only, redacted) | ✅ |
| Tenant isolation + role enforcement | ✅ tested on every agency route |
| Rate limiting, correlation-id 500s, `updated_at` trigger | ✅ |
| `reset_full` / `reset_readonly` / `seed_demo_accounts` | ✅ |
| **eSIM Access real gateway code** | ✅ written; auth + `/balance/query` verified live |

---

## 12. Features incomplete or NOT working

| Item | State | Impact on frontend |
|---|---|---|
| **Stripe live payments** | ⚠️ fake gateway. `client_secret` is `pi_fake_…` | Build the flow; don't call Stripe.js with it yet |
| **eSIM Access live provisioning** | ⚠️ code written, `SUPPLIER_GATEWAY=fake` pinned in `.env`; wallet balance **$0.00** | eSIMs are generated stubs |
| **eSIM Access webhooks** | ❌ NOT BUILT (`ORDER_STATUS`, `SMDP_EVENT`, `DATA_USAGE`, `VALIDITY_USAGE`) | No push updates: usage only refreshes when someone clicks; no install/activation events; no expiry warnings |
| **Email delivery** | ⚠️ console backend only; no provider library installed | Emails print to server output. Password-reset uid/token must be copied from the console |
| **Plans purchasable** | ⚠️ all 385 `paused` | Empty catalogue until activated |
| **Tax** | ⚠️ `tax_minor` always `0` | Don't build tax UI yet |
| **Agency invitations (email link)** | ❌ NOT BUILT | Admin sets the password directly and passes it out of band |
| **Support tickets / disputes** | ❌ NOT BUILT | No endpoints — leave the screen out |
| **CSV exports** | ❌ NOT BUILT | Throttle scope exists, endpoints don't |
| **Platform settings screen** | ❌ NOT BUILT | — |
| **Platform role assignment API** | ❌ NOT BUILT | Roles are assigned via Django admin groups |
| **Order cancel / eSIM re-provision** | ❌ NOT BUILT | Buttons have no endpoint |
| **MFA / 2FA** | ❌ NOT BUILT | — |
| **Google OAuth end-to-end** | ⚠️ `UNVERIFIED` — config + redirect verified live, but the consent click was never completed | Test it in a browser; report any Google error |
| **`/esim/order` + duplicate-recovery field shapes** | ⚠️ `UNVERIFIED` — marked in code; only one real order can confirm them (no supplier sandbox) | No frontend impact |
| **Agency purchasing** | ❌ out of scope by design | `buyer_organization` unused; agency panel has no order creation |

---

## 13. Known bugs and limitations

**Open**
1. **`users.deleted_at` exists but nothing filters on it** — soft delete is inert; a
   "deleted" user can still authenticate. Don't build a delete-user UI expecting it to work.
2. **Throttle cache is `LocMemCache` by default** — per-process, so limits multiply by
   worker count. Production startup **refuses** to boot on locmem (`CACHE_URL` required).
3. **Agency password recovery is platform-only** — every forgotten password is a support
   request for the owner.
4. **Georgia (`GE`) is mis-regioned as Africa in the source workbook.** The importer
   corrects it to Asia and logs a warning, but the workbook itself still needs fixing.
5. **`data/catalog.json` (repo root) is stale** — it lacks the curated `homepage_badge` and
   `sort_order` the API returns. **Treat the API as the source of truth and retire the JSON.**
6. **One intermittent test failure, unreproduced.** A single full-suite run reported
   `FAILED (failures=1)`; six later runs were green, including five targeted repeats each of
   the two likeliest candidates (the dashboard query-count comparison and the throttle test,
   which share process-level cache state). The failing test name was not captured before the
   suite re-ran clean. **No frontend impact** and no evidence of a product bug, but it should
   be pinned down — the most probable causes are cross-test cache state or a date-boundary
   assumption in the payout-period tests.

**Fixed already — please don't re-report**
- Guest order lookup was unthrottled and returned decrypted credentials → now `lookup`
  10/min + fully audited.
- A suspended agency still earned commission → now blocked and audited.
- `create_payout` swept commissions from *all* periods → now period-filtered (a January
  payout no longer takes February's earnings).
- Payout responses reported `commission_count: 0` for non-empty payouts.
- `POST /admin/plans/{id}/activate/` always returned `409` (verb vs status mismatch).
- `POST /admin/organizations/` didn't return the new `id`.
- Registration returned `500` after allauth added a second auth backend.
- Dashboard aggregate alias shadowing (worked only by accident of argument order).
- Admin URL `<str:action>` swallowed the `members/` and `tracking-codes/` routes.

---

## 14. Environment variables

All in `backend/.env` (gitignored). `.env.example` is **names only** — never put values there.

**Required**
```
DJANGO_SECRET_KEY · DATABASE_URL · FIELD_ENCRYPTION_KEY
FIELD_ENCRYPTION_KEY_VERSION · ICCID_HMAC_KEY
```
**Required in production** (startup fails without them)
```
STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET
ESIM_SUPPLIER_BASE_URL · ESIM_SUPPLIER_API_KEY
CACHE_URL  (must NOT be locmem)
```
**Frontend-relevant**
```
FRONTEND_BASE_URL      default http://localhost:3000   (Google post-login redirect)
CORS_ALLOWED_ORIGINS   default http://localhost:3000
CSRF_TRUSTED_ORIGINS
SESSION_COOKIE_SAMESITE · SESSION_COOKIE_DOMAIN
```
**Other**
```
DJANGO_DEBUG · ALLOWED_HOSTS · DB_CONN_MAX_AGE · LOG_LEVEL · SECURE_HSTS_SECONDS
PAYMENTS_GATEWAY · SUPPLIER_GATEWAY · ESIM_SUPPLIER_SECRET_KEY · ESIM_SUPPLIER_TIMEOUT
EMAIL_BACKEND · DEFAULT_FROM_EMAIL · EMAIL_PROVIDER_API_KEY  (unused today)
GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET
THROTTLE_AUTH · THROTTLE_CHECKOUT · THROTTLE_PAYMENT · THROTTLE_PROMO
THROTTLE_USAGE · THROTTLE_LOOKUP · THROTTLE_ADMIN · THROTTLE_AGENCY
THROTTLE_REVEAL · THROTTLE_EXPORT
```
⚠️ **The frontend also needs** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) in
`frontend/.env.local` — that key is never used by the backend.

**Dependencies:** Django 5.2 · djangorestframework 3.15 · django-environ · django-cors-headers ·
psycopg[binary] 3 · cryptography · gunicorn · stripe · httpx · openpyxl · django-allauth 65 ·
PyJWT. Python **3.13**, PostgreSQL **16** (needs `citext`).

**Management commands**
| Command | Purpose |
|---|---|
| `migrate` | schema |
| `import_catalog [--dry-run]` | import the Excel workbook |
| `activate_demo_catalog [--countries A,B \| --all \| --deactivate]` | **make plans purchasable for dev** |
| `seed_demo_accounts` | **create all test accounts** |
| `runserver 8000` | web process |
| `process_jobs [--once]` | **worker — provisioning + email** |
| `run_monthly_payouts [--month YYYY-MM] [--dry-run]` | month-end agency payouts |
| `check_supplier_balance [--fail-on-low]` | wallet alert |
| `reset_full` / `reset_readonly` | full DB reset / catalogue-only reset |

---

## 15. Local setup

```bash
# backend — terminal 1
cd esim/backend && source .venv/bin/activate
python manage.py migrate
python manage.py activate_demo_catalog     # REQUIRED or the catalogue is empty
python manage.py seed_demo_accounts        # test accounts for both panels
python manage.py runserver 8000

# backend — terminal 2 (MUST run)
python manage.py process_jobs

# frontend
cd esim/frontend && npm run dev            # :3000, with the §5.1 rewrites
```
Django admin: `http://localhost:8000/admin/` (superuser only).
Health check: `curl localhost:8000/health/ready/`.

---

## 16. Frontend integration requirements (checklist)

- [ ] Same-origin proxy configured (§5.1) — **do this first**
- [ ] One API client: base URL, `credentials: "include"`, CSRF header, error mapper
- [ ] Money formatted from minor units — never render raw integers
- [ ] `X-Cart-Token` persisted and resent for guests
- [ ] Pagination handled per-endpoint (array vs envelope)
- [ ] Post-payment polling on `payment_status` then `fulfillment_status`
- [ ] Empty-catalogue state designed
- [ ] Role-gated UI hides controls **and** handles `403`/`404`
- [ ] Agency screens contain **no customer identity and no eSIM credentials**
- [ ] Credential reveal is an explicit button, never auto-loaded
- [ ] `qr_payload` rendered as a QR code

---

## 17. Recommended frontend implementation order

| # | Milestone | Why here |
|---|---|---|
| 1 | **Proxy + API client + auth** — prove login → `/account/me/` → logout with cookies | everything depends on it |
| 2 | **Storefront catalogue** — `/destinations`, `/esim/[slug]` off the live API (+ empty state) | biggest visible win; public, no auth |
| 3 | **Cart → checkout → order** incl. the guest token | the revenue path |
| 4 | **Payment + polling + QR display** + guest order lookup | completes the funnel |
| 5 | **Account area** — my eSIMs, usage, profile, password reset, Google sign-in | |
| 6 | **Agency panel** — smallest surface, read-mostly, high value | tenancy is already enforced |
| 7 | **Platform admin panel** — dashboard + orders first, then catalogue, commissions, eSIMs, ops | largest |

Leave out entirely for now: support tickets, exports, settings, role assignment, order
cancel, eSIM re-provision, MFA — **no endpoints exist**.

---

## 18. Open questions for the product owner

1. Should the agency see a **masked** customer identity (`j***@gmail.com`) to match a sale
   to the person they gave the code to? Currently **no identity at all**.
2. **Tax policy** — `tax_minor` is always `0`.
3. Email provider — needed before password reset, order emails or agency invites work
   outside the console.
4. When do plans get **activated**? Nothing is sellable until then.
5. eSIM Access wallet is **$0.00** — needs a top-up before any real provisioning.
