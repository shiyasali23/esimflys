# eSIMFlys Backend

Django 5.2 + DRF + PostgreSQL monolith. Authoritative source of truth:
[`../esim_backend_design.md`](../esim_backend_design.md).

> **Building the admin panels? → [`ADMIN_API.md`](./docs/ADMIN_API.md)** — platform + agency
> admin APIs, role matrix, tenancy rules.
>
> **Frontend developers start here → [`API.md`](./docs/API.md)** — full endpoint reference with real
> request/response examples, the auth + guest-cart flows, error codes, and field conventions.

## Local development

Prerequisites: Python 3.13, a running PostgreSQL 16.

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .

createdb esimflys_dev            # once
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8000
```

Health checks:

```bash
curl http://127.0.0.1:8000/health/live/
curl http://127.0.0.1:8000/health/ready/
```

## Configuration

Settings are environment-driven (`config/settings.py` via `django-environ`). Copy
`.env.example` to `.env` for local development. Production startup fails if any required
secret is missing (see `.env.example` for the full list). Secrets are never committed.

## Build phases

- **B0 — Foundation (done):** project config, `common` package (UUID/timestamp base models,
  error envelope, pagination, versioned eSIM-secret encryption + ICCID blind index), custom
  email `User` model, health endpoints, boots against Postgres.
- **B1 — Catalogue (done):** `Country` / `Supplier` / `CatalogPlan` models with full check
  constraints (plan-type shape, one default per country, valid statuses/badges) + the
  `import_catalog` command. Imports 68 countries / 385 plans from `../data/catalog.json`,
  all `paused` (never auto-activates), idempotent, retires missing plans. Run:
  `python manage.py import_catalog [--dry-run]`.
- **B2 — Catalogue API (done):** `/api/v1/catalog/` countries (list/detail), country plans,
  single plan. Public (`AllowAny`), active-only, allowlist serializers (no wholesale/supplier
  fields), derived country price = `min(retail/validity)` over active plans as a decimal
  string. Tests in `apps/catalog/tests.py`.
- **B3 — Cart → checkout → order (done):** `orders` app (Cart, CartItem, PromoCode,
  PromoRedemption, Order, OrderItem) + `accounts` orgs. Transactional `services.checkout()`
  locks the cart, revalidates/reprices plans server-side, expands quantity into immutable
  order-item snapshots, reserves promos via a redemption ledger, `tax=0` seam. API:
  `/api/v1/cart/`, `/api/v1/checkout/`, `/api/v1/orders/`; guest carts via `X-Cart-Token`.
  Tests in `apps/orders/tests.py`. (Payment is B4; top-up/eSIM cart items are B5.)
- **B4 — Payments / Stripe (done):** `payments` app (Payment, WebhookEvent idempotency
  ledger). Stripe isolated behind `payments/stripe.py` — real `StripeGateway` + deterministic
  `FakeGateway` (real HMAC signature verify, no network), chosen by `PAYMENTS_GATEWAY`.
  PaymentIntent created from the **stored** order amount; `/webhooks/stripe/` is the sole
  payment authority (signature-verified, idempotent by event id, amount/currency reconciled);
  zero-total orders skip Stripe. On paid → promo consumed + order flipped to `paid`. Tests in
  `apps/payments/tests.py`. **Needs real keys + Stripe-flow confirmation before live (§21).**
- **B5 — eSIM provisioning (done):** `esims` app (EsimProfile with encrypted ICCID/SM-DP+/
  activation/QR + HMAC blind index; SupplierEvent durable job queue). Supplier isolated in
  `esims/supplier.py` (real eSIM Access + `FakeSupplier`). `process_jobs` worker claims jobs
  with `SELECT FOR UPDATE SKIP LOCKED`, exponential backoff → manual review. Paid order →
  enqueues one profile per eSIM item → worker provisions → encrypts → order `fulfilled`. API:
  `/api/v1/esims/` (owner-scoped), `/esims/{id}/` (decrypted creds, ownership-checked),
  `/esims/{id}/refresh-usage/`. Tests in `apps/esims/tests.py`. Run the worker:
  `python manage.py process_jobs [--once]`. (Top-ups deferred — unconfirmed launch, §21.)
- **B6 — Commissions / refunds / orgs (done):** `partner_commissions` + `commission_payouts`
  (accounts), `refunds` + `refund_items` (payments). Commission created on paid agency-promo
  orders (snapshot rate, integer math); refunds validate the refundable balance, hit Stripe
  (fake/real), and reverse commission proportionally (`reversed_minor`, history preserved).
  Session auth (`/auth/{csrf,register,login,logout}/`, `/account/me/`) + organizations read
  API (`/organizations/…/commissions/`, `/payouts/`). Tests in `apps/accounts/tests.py` +
  `apps/payments/tests.py`. (Commission approval & payout creation are Django Admin ops.)
- **B7 — Hardening (done):** DRF scoped rate-limiting on auth/checkout/payment/promo/
  usage-refresh; correlation-id JSON `internal_error` handler for uncaught exceptions (§13);
  a Postgres `updated_at` trigger so direct SQL updates bump the column (§6); Georgia region
  correction (GE → Asia) applied + logged in the importer (§21). Tests in `apps/common/tests.py`.

**All engineering phases (B0–B7) are complete, plus demo-completion (D1–D3):**
- **D1 — Notifications:** durable, idempotent order-confirmation / eSIM-ready / refund / top-up
  emails via the **console** backend (worker-sent). The eSIM-ready email excludes QR/activation
  secrets (§17).
- **D2 — Top-ups:** buy a top-up for a provisioned eSIM (`POST /api/v1/esims/{id}/topups/`) →
  fake supplier → the eSIM's data balance grows; `topup_products` / `topup_fulfillments` tables.
- **D3 — Password reset** (`/auth/password-reset/` + confirm, console email), **guest order/eSIM
  lookup** (`POST /api/v1/orders/lookup/` by order-number + email), and **`activate_demo_catalog`**
  (DEMO-only plan activation + a demo top-up product).

### Run the full demo locally
```bash
python manage.py migrate
python manage.py activate_demo_catalog     # DEMO ONLY: activate popular-country plans (+ demo top-up)
python manage.py runserver 8000            # web process
python manage.py process_jobs              # worker process (separate shell) — provisioning + notifications
```
Everything runs on **fake Stripe + fake eSIM-Access + console email** — 311 tests green.

**What remains is not code** — the §21 business decisions: real Stripe keys + PaymentIntents-vs-
Checkout, the real eSIM Access API contract, tax policy, hosting, and a real email provider. The
gateways auto-switch fake→real when the credentials are present. See `../esim_backend_design.md` §21.

Launch blockers tracked in `../esim_backend_design.md` §21 (tax policy,
supplier contract, Stripe flow, hosting, email provider).
