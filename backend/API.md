# eSIMFlys Backend — Frontend Integration Guide

Everything a frontend developer needs to build against this API. All examples below are
**real captured responses**, not hand-written samples.

- **Base URL (local):** `http://127.0.0.1:8000`
- **API root:** `/api/v1/`
- **Auth:** Django session cookie + CSRF (no JWT, no bearer tokens)
- **Content type:** `application/json`

---

## 1. Run the backend locally

```bash
cd esim/backend
source .venv/bin/activate

python manage.py migrate
python manage.py activate_demo_catalog     # IMPORTANT: see §2 — without this the catalogue is empty
python manage.py runserver 8000            # web process
python manage.py process_jobs              # worker process (separate terminal)
```

The **worker must be running** or eSIMs never get provisioned and emails never send.

Convenience commands:

| Command | What it does |
|---|---|
| `python manage.py reset_full --noinput` | Wipe DB → migrate → reseed → run tests → start server |
| `python manage.py reset_readonly` | Re-import the catalogue only (keeps users/orders) → start server |
| `python manage.py activate_demo_catalog [--deactivate]` | Make plans purchasable (demo only) |
| `python manage.py import_catalog` | Import the supplier Excel workbook |

Django admin: `http://127.0.0.1:8000/admin/`

---

## 2. ⚠️ Read this first — three things that will confuse you

**a) The catalogue is empty by default.** All 385 plans import as `status="paused"`, and the
API only exposes **active** plans. Until you run `activate_demo_catalog`, you get 68 countries
but every `price_from` is `null` and every plan list is `[]`. **This is correct behaviour, not
a bug.**

**b) All money is an integer in minor units (cents).** `retail_amount_minor: 1699` = **$16.99**.
Never render it directly. The only exceptions are the two derived display prices
(`price_from`, `price_per_day`), which are pre-formatted decimal strings.

**c) Some list endpoints are paginated and some are not.**

| Returns a plain array `[…]` | Returns `{count,next,previous,results}` |
|---|---|
| `/catalog/countries/` | `/orders/` |
| `/catalog/countries/{slug}/plans/` | `/esims/` |
| | `/organizations/` (+ commissions, payouts) |

---

## 3. Authentication

Session-cookie based. The browser holds `sessionid`; you must send a **CSRF token** on every
unsafe request (`POST`/`PATCH`/`DELETE`) once a session exists.

```js
// 1. Prime the CSRF cookie once on app boot
await fetch('/api/v1/auth/csrf/', { credentials: 'include' });

function csrfToken() {
  return document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1];
}

// 2. Always send credentials + the CSRF header
await fetch('/api/v1/auth/login/', {
  method: 'POST',
  credentials: 'include',                       // required — sends/stores cookies
  headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
  body: JSON.stringify({ email, password }),
});
```

`credentials: 'include'` is mandatory on **every** call. CORS is locked to an allowlist
(`CORS_ALLOWED_ORIGINS`, default `http://localhost:3000`) with credentials enabled.

### Continue with Google (OAuth)
This is a **full-page redirect**, not a `fetch`. Point the button at the backend:

```jsx
<a href="http://localhost:8000/accounts/google/login/">Continue with Google</a>
```

Flow: link → backend 302s to Google → user consents → Google calls the backend callback →
Django creates/links the account and issues the session → browser is redirected to
`FRONTEND_BASE_URL/account` (env `FRONTEND_BASE_URL`, default `http://localhost:3000`). After
landing, call `GET /api/v1/account/me/` to load the user.

- Accounts are **linked by verified email** — a user who signed up with email/password and then
  uses Google gets the *same* account, not a duplicate.
- ⚠️ Use **`localhost:8000`** (not `127.0.0.1`) — Google treats them as different origins and the
  registered redirect URI is `localhost`.
- The same-origin cookie caveat below applies: for the session set on `:8000` to be usable from
  the SPA on `:3000`, proxy the backend under the frontend origin (recommended) — this is required
  for email/password auth too, not just Google.

---

## 4. Guest carts — the `X-Cart-Token` flow

Guests (not logged in) get a cart identified by an opaque token. **The server only returns it
once**, as a response *header*, when the cart is first created. Persist it and send it back on
every later cart/checkout call.

```js
const res = await fetch('/api/v1/cart/items/', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
  body: JSON.stringify({ product_code: 'AL-10GB-30D-V1', quantity: 2 }),
});
const cartToken = res.headers.get('X-Cart-Token');   // save to localStorage
```

Then send `X-Cart-Token: <token>` on `GET /cart/`, cart item updates, promo preview and
`POST /checkout/`. **Logged-in users don't need it** — their cart is tied to the account.

---

## 5. Error format

Every error uses one envelope:

```json
{ "error": { "code": "promo_invalid", "message": "This promo code is not valid.", "fields": {} } }
```

Render `message`; branch on `code`. `fields` is populated for validation errors
(`{"customer_email": ["This field is required…"]}`).

| Code | HTTP | Meaning |
|---|---|---|
| `validation_error` | 400 | Bad input — inspect `fields` |
| `invalid_credentials` | 401 | Wrong email/password |
| `authentication_required` | 401/403 | Not logged in |
| `permission_denied` | 403 | Not yours |
| `not_found` | 404 | Missing or not visible to you |
| `plan_unavailable` | 409 | Plan paused/retired — refresh the catalogue |
| `cart_expired` | 409 | Start a new cart |
| `conflict` | 409 | Wrong state (e.g. empty cart, already checked out) |
| `payment_already_completed` | 409 | Order already paid |
| `payment_mismatch` | 409 | Payment didn't reconcile |
| `promo_invalid` / `promo_expired` | 422 | Bad promo code |
| `promo_usage_exceeded` | 409 | Promo limit reached |
| `topup_not_supported` | 422 | Top-up incompatible with this eSIM |
| `refund_limit_exceeded` | 409 | Refund exceeds refundable balance |
| `rate_limited` | 429 | Throttled — see §9 |
| `internal_error` | 500 | Includes a `correlation_id` for support |

---

## 6. Endpoint reference

### 6.1 Health
| Method | Path | Auth |
|---|---|---|
| GET | `/health/live/` | public |
| GET | `/health/ready/` | public (503 if DB down) |

### 6.2 Catalogue — public, no auth

**`GET /api/v1/catalog/countries/`** → plain array of all active countries.
```json
{
  "iso2": "SA", "name": "Saudi Arabia", "slug": "saudi-arabia",
  "region": "Middle East & N.Africa", "flag_emoji": "🇸🇦", "timezone": null,
  "is_popular": true, "homepage_badge": "popular",
  "price_from": null, "plan_count": 0
}
```
`homepage_badge` ∈ `null | "popular" | "best_value"`. `price_from` is `null` when the country
has no active plans, otherwise `{"amount":"0.30","currency":"USD"}` (cheapest per-day price).
Sorted by a curated `sort_order`.

**`GET /api/v1/catalog/countries/{slug}/`** → one country, same shape.

**`GET /api/v1/catalog/countries/{slug}/plans/`** → plain array of that country's **active** plans.
```json
{
  "product_code": "AL-10GB-30D-V1", "plan_type": "fixed",
  "display_name": "Albania 10 GB — 30 Days",
  "data_limit_mb": 10000, "daily_high_speed_mb": null, "day_count": null,
  "validity_days": 30,
  "traffic_policy": "Maximum data 10GB at full speed; valid 30 days from activation; top-up: yes",
  "hotspot_supported": null, "network_names": ["One Albania 5G"], "topup_supported": true,
  "retail_amount_minor": 1699, "currency": "USD",
  "price_per_day": { "amount": "0.57", "currency": "USD" },
  "badge": "popular", "is_default_selected": true, "sort_order": 1
}
```
- `plan_type: "fixed"` → use `data_limit_mb` (total allowance). `daily_high_speed_mb` is `null`.
- `plan_type: "daily"` → use `daily_high_speed_mb` (per-day allowance) and `day_count`.
- `is_default_selected` marks the plan to pre-select in the UI (exactly one per country).
- `hotspot_supported` is `null` when unknown — render "unknown", not "no".

**`GET /api/v1/catalog/plans/{product_code}/`** → one active plan + nested country:
```json
"country": { "iso2": "AL", "name": "Albania", "slug": "albania", "flag_emoji": "🇦🇱" }
```
404 if the plan is paused/retired.

### 6.3 Cart — public (guest via `X-Cart-Token`, or logged-in)

| Method | Path | Body |
|---|---|---|
| GET | `/api/v1/cart/` | — |
| POST | `/api/v1/cart/items/` | `{product_code, quantity=1}` → **201**, sets `X-Cart-Token` |
| PATCH | `/api/v1/cart/items/{item_id}/` | `{quantity}` |
| DELETE | `/api/v1/cart/items/{item_id}/` | — |
| POST | `/api/v1/cart/promo-code/` | `{code, customer_email?}` → discount **preview** |
| DELETE | `/api/v1/cart/promo-code/` | → 204 |

```json
{
  "id": "e45860a5-…", "currency": "USD", "status": "active",
  "items": [{
    "id": "1c40b9f1-…", "product_code": "AL-10GB-30D-V1",
    "display_name": "Albania 10 GB — 30 Days", "plan_type": "fixed",
    "quantity": 2, "unit_amount_minor": 1699, "currency": "USD", "line_total_minor": 3398
  }],
  "subtotal_minor": 3398, "item_count": 2
}
```
An empty cart returns `{"id": null, …, "items": [], "subtotal_minor": 0}`.

> The promo endpoint is a **preview only** — it does not persist. You must pass `promo_code`
> again to `/checkout/`. Cart totals are indicative; the server recalculates at checkout.

### 6.4 Checkout

**`POST /api/v1/checkout/`** — body `{customer_email?, promo_code?}` (email required for guests,
defaults to the account email when logged in). Send `X-Cart-Token` for guests. → **201**:

```json
{
  "id": "a0ff1ad9-…", "order_number": "ESF-C39D2A50DC19",
  "customer_email": "dev@example.com", "currency": "USD",
  "subtotal_minor": 3398, "discount_minor": 0, "tax_minor": 0, "total_minor": 3398,
  "status": "pending_payment", "payment_status": "pending", "fulfillment_status": "pending",
  "placed_at": "2026-07-22T21:06:07.578639Z", "promo_code_snapshot": null,
  "items": [{
    "id": "2419e397-…", "item_type": "esim", "product_code": "AL-10GB-30D-V1",
    "product_name": "Albania 10 GB — 30 Days", "country_iso2": "AL", "country_name": "Albania",
    "plan_type": "fixed", "data_limit_mb": 10000, "daily_high_speed_mb": null,
    "validity_days": 30, "network_names": ["One Albania 5G"],
    "unit_amount_minor": 1699, "currency": "USD", "status": "pending"
  }]
}
```

**Quantity 2 becomes 2 separate order items** — one per eSIM. Always `total = subtotal − discount + tax`.

Order state machines:
- `status`: `pending_payment → paid → fulfilling → partially_fulfilled → fulfilled` (+ `cancelled`, `partially_refunded`, `refunded`, `failed`)
- `payment_status`: `pending → processing → paid` (+ `failed`, `cancelled`, `partially_refunded`, `refunded`)
- `fulfillment_status`: `pending → processing → partially_delivered → delivered` (+ `failed`, `cancelled`)

### 6.5 Payments

**`POST /api/v1/payments/payment-intent/`** — body `{order_id}` → **200**:
```json
{
  "client_secret": "pi_fake_565041b00febea970efceba2_secret",
  "payment_id": "43a51296-…", "amount_minor": 3398, "currency": "USD"
}
```
Idempotent per order. Returns 409 `payment_already_completed` if already paid. If the order
total is `0` (100% promo) you instead get `{"zero_total": true, "client_secret": null,
"payment_status": "paid"}` — **skip Stripe entirely** in that case.

> 🚧 **The gateway is currently a fake.** `client_secret` is a stub, not a real Stripe secret —
> do **not** pass it to Stripe.js yet. Payment is confirmed server-side via the webhook. When
> real keys land, the value becomes a genuine PaymentIntent secret and the frontend flow
> (Stripe Elements → `confirmPayment`) works unchanged.

**`POST /api/v1/webhooks/stripe/`** — server-to-server only. **Never call this from the frontend.**

**Payment truth is the webhook, not the browser.** After confirming payment, poll
`GET /orders/{id}/` until `payment_status === "paid"`, then until
`fulfillment_status === "delivered"` for the eSIM.

### 6.6 Orders

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/v1/orders/` | required | **paginated**, own orders only |
| GET | `/api/v1/orders/{id}/` | required | own orders only |
| POST | `/api/v1/orders/lookup/` | public | guest retrieval |

**Guest lookup** — `{order_number, email}`; the email must match the order. Returns the order
**and its eSIMs including activation credentials**:
```json
{
  "order": { … order object … },
  "esims": [{
    "status": "ready", "product_name": "Albania 10 GB — 30 Days", "iccid_last4": "1502",
    "credentials": {
      "iccid": "8944138302270011502",
      "smdp_address": "smdp.fake-esim.example.com",
      "activation_code": "13317BD174",
      "qr_payload": "LPA:1$smdp.fake-esim.example.com$13317BD174"
    }
  }]
}
```
Render `qr_payload` as a QR code. Wrong email → 404.

### 6.7 eSIMs — all require auth, owner-scoped

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/esims/` | **paginated**; **no credentials** in list |
| GET | `/api/v1/esims/{id}/` | adds `credentials` (QR etc.) |
| POST | `/api/v1/esims/{id}/refresh-usage/` | re-syncs usage from supplier |
| GET | `/api/v1/esims/{id}/topups/` | `{available:[…], history:[…]}` |
| POST | `/api/v1/esims/{id}/topups/` | `{topup_product_code}` → **201** order |

List item fields: `id, status, product_name, country_iso2, country_name, plan_type,
validity_days, iccid_last4, total_data_bytes, remaining_data_bytes, installed_at,
activated_at, expires_at, last_synced_at`.

`status`: `pending → provisioning → ready` (then `installed`/`active`/`expired`, or
`failed`/`manual_review`). Show a spinner until `ready`. **Usage is in bytes**; data allowances
elsewhere are in **MB** (1 GB = 1000 MB).

Buying a top-up returns a normal **order** — pay it via `/payments/payment-intent/` exactly
like a first purchase; the balance increases once the worker completes it.

### 6.8 Account & auth

| Method | Path | Body |
|---|---|---|
| GET | `/api/v1/auth/csrf/` | → `{csrfToken}` |
| POST | `/api/v1/auth/register/` | `{email, password, first_name?, last_name?}` → 201, logs in |
| POST | `/api/v1/auth/login/` | `{email, password}` |
| POST | `/api/v1/auth/logout/` | → 204 |
| GET/PATCH | `/api/v1/account/me/` | PATCH: `{first_name, last_name, preferred_currency}` |
| POST | `/api/v1/auth/password-reset/` | `{email}` → always 200 (no account enumeration) |
| POST | `/api/v1/auth/password-reset/confirm/` | `{uid, token, new_password}` |

```json
{ "id": "ec7a7e86-…", "email": "doc@example.com", "first_name": "", "last_name": "",
  "preferred_currency": "USD", "email_verified_at": null }
```
Password rules are Django's validators (min length, not all-numeric, not common) — surface
`fields.password`. Reset emails print to the **server console** in dev.

### 6.9 Organizations (travel-agency portal) — auth + membership

| Method | Path |
|---|---|
| GET | `/api/v1/organizations/` (paginated, your orgs) |
| GET | `/api/v1/organizations/{id}/` |
| GET | `/api/v1/organizations/{id}/commissions/` |
| GET | `/api/v1/organizations/{id}/payouts/` |

Read-only. Commission money fields (`commission_minor`, `reversed_minor`) are minor units.
Non-members get 404.

---

## 7. The complete purchase flow

```
1. GET  /catalog/countries/                     browse
2. GET  /catalog/countries/{slug}/plans/        pick a plan
3. POST /cart/items/                            → save X-Cart-Token (guest)
4. POST /cart/promo-code/        (optional)     preview discount
5. POST /checkout/               {customer_email, promo_code?}   → order (pending_payment)
6. POST /payments/payment-intent/{order_id}     → client_secret   (skip if zero_total)
7.      confirm payment  →  webhook marks it paid  (server-side)
8. poll GET /orders/{id}/  until payment_status="paid", then fulfillment_status="delivered"
9. GET  /esims/{id}/   (or POST /orders/lookup/ for guests)  → render qr_payload
```

---

## 8. Field conventions

| Type | Format |
|---|---|
| IDs | UUID strings |
| Money (payable) | integer minor units — `1699` = $16.99 |
| Money (display) | `{"amount": "0.57", "currency": "USD"}` |
| Data allowance | **MB** (`data_limit_mb`), 1 GB = 1000 MB |
| Usage | **bytes** (`remaining_data_bytes`) |
| Timestamps | ISO-8601 UTC (`2026-07-22T21:06:07.578639Z`) |
| Dates | `YYYY-MM-DD` |
| Currency | `"USD"` everywhere at launch |

---

## 9. Rate limits

`429` + `rate_limited` when exceeded. Back off and show a friendly message.

| Scope | Limit | Endpoints |
|---|---|---|
| auth | 10/min | login, register, password-reset |
| checkout | 30/min | checkout |
| payment | 30/min | payment-intent |
| promo | 30/min | cart promo preview |
| usage | 20/min | eSIM refresh-usage |

---

## 10. What's real vs stubbed today

| Area | Status |
|---|---|
| Catalogue, cart, checkout, orders | ✅ real |
| Auth, account, organizations | ✅ real |
| Payments | ⚠️ **fake gateway** — real signature/idempotency logic, stub `client_secret` |
| eSIM provisioning | ⚠️ **fake supplier** — real encryption/worker, generated ICCID/QR |
| Email | ⚠️ **console backend** — printed to server output, not delivered |
| Plans purchasable | ⚠️ off by default — run `activate_demo_catalog` |

The frontend contract does **not** change when real credentials land — same endpoints, same
shapes. Only the values behind `client_secret` and the eSIM credentials become real.

**Not built yet:** Google OAuth, refund initiation from the frontend (admin-only today),
tax (`tax_minor` is always `0` pending the tax policy decision).
