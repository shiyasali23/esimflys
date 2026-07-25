# eSIMFlys — Backend Design & Build Spec (Django monolith)

> Single source of truth for the backend. A Django 5.2 modular monolith + Django REST Framework + PostgreSQL that owns all authoritative catalogue, customer, checkout, payment, commission, eSIM provisioning, top-up, refund, and notification state.
> The frontend spec is [`esim_frontend_design.md`](./esim_frontend_design.md); the frontend consumes this backend at `:8000` (currently mocked).
> Version 1.0 · 2026-07-22 · Reconciled from two backend design drafts into one canonical spec. Divergence-resolution notes in §0.
> **The backend does not yet exist in the repository** — only a mocked boundary for a future service on port `8000`.

---

## 0. Document status & how to use this document

This file is the reconciliation of two backend design drafts into one authoritative spec. It is the backend's source of truth; code must trace to it, and if code and spec disagree, the spec wins.

Reconciliation decisions (where the two drafts diverged):

- **Schema base is the more explicit draft.** Foreign-key on-delete actions (`RESTRICT` / `CASCADE` / `SET NULL`), explicit index blocks, and enum value lists are kept. The second draft's additional constraints, business rules, and notes are folded in on top. No rule from either draft was dropped.
- **`catalog_plans.supplier_verified_at` is `TIMESTAMPTZ`** (not the `DATE` form used by the other draft), for consistency with every other audit timestamp in the schema. A workbook verification date without a time component is stored at UTC midnight.
- **Relationship summary includes `promo_codes → orders`** (the `orders.promo_code_id` FK), which one draft listed and the other left implicit.
- **Unions are preserved.** Constraints, business rules, security items, test lists, and future-improvement lists are the union of both drafts; nothing is silently narrowed.
- **Everything both drafts flagged as unconfirmed/provisional stays flagged** (§21). Nothing unverified is promoted to "decided."

Non-negotiable honesty & safety lines that govern this backend:

- All monetary values are calculated **server-side**; client-submitted prices and totals are ignored.
- Payment success is accepted **only** from verified Stripe webhooks, never from the browser.
- **All 385 catalogue plans launch paused**; no plan is sold until explicitly verified and activated.
- USD is the launch settlement currency; money is stored in integer minor units.
- Transactional, financial, and fulfilment records are **never hard-deleted**.
- eSIM activation credentials are encrypted; secrets never appear in logs, URLs, analytics, Stripe metadata, notifications, or stored provider payloads.

---

## 1. Backend Overview

eSIMFlys uses a modular Django monolith that owns all authoritative catalogue, customer, checkout, payment, commission, fulfilment, top-up, refund, and notification operations.

The backend must:

- Import and validate the eSIM catalogue.
- Expose active countries and plans.
- Support guest and authenticated purchases.
- Calculate all monetary values server-side.
- Create immutable order-item snapshots.
- Accept payment state only from verified Stripe webhooks.
- Provision exactly one eSIM profile per eSIM order item.
- Process top-ups against an existing eSIM profile.
- Record supplier requests, retries, and responses idempotently, without duplicate purchases.
- Encrypt eSIM activation credentials.
- Attribute coupon sales to travel agencies.
- Calculate, reverse, approve, and pay commissions.
- Process refunds and commission reversals without deleting history.
- Preserve complete financial and operational audit history.

The backend is not implemented yet. The existing repository only has a mocked boundary for a future service on port `8000`.

---

## 2. Backend Goals and Scope

### Goals

- Securely sell and provision eSIM products through a secure commercial API.
- Prevent duplicate payments, refunds, eSIMs, top-ups, commissions, and notifications.
- Preserve complete financial and fulfilment auditability.
- Support guest checkout and customer accounts.
- Support travel-agency coupon attribution and commission payouts.
- Remain understandable and maintainable by a solo developer.
- Provide a foundation that can grow without microservices, Kubernetes, Kafka, or premature infrastructure.

### Included

- Customer identity, accounts, and sessions.
- Guest checkout.
- Organizations and organization memberships.
- Countries and the current eSIM plan catalogue.
- Carts and promotional codes.
- Checkout and immutable orders.
- Stripe payments and refunds.
- eSIM provisioning, usage information, and top-ups.
- Travel-agency commissions and payouts.
- Supplier and webhook audit records and processing.
- Customer notifications.
- Restricted operational management through Django Admin.

### Excluded

- Marketing-content management.
- Reviews and testimonials.
- Regional and global plans until a verified supplier catalogue requires them.
- Multiple-supplier / multi-provider routing and failover.
- Automated tax logic until the legal tax policy is confirmed.
- Advanced accounting or tax reporting.
- A dedicated agency portal.
- Native mobile authentication.
- Microservices, Kubernetes, Kafka, GraphQL, Celery, and Redis at launch.

---

## 3. Technology Stack

### Confirmed

- Python
- Django 5.2 LTS
- Django REST Framework
- PostgreSQL
- PostgreSQL `citext` extension
- PostgreSQL `pgcrypto` extension (for UUID support where required)
- Django ORM and migrations
- Django database sessions
- Django Admin
- Gunicorn
- Stripe Python SDK
- `httpx` (supplier and external HTTP requests)
- Application-layer authenticated encryption for eSIM secrets

### Provisional / not yet confirmed

These require confirmation before implementation:

- Django hosting: Railway.
- PostgreSQL hosting provider: Neon or Railway.
- A PostgreSQL-backed Django worker for fulfilment and notification jobs.
- Final Stripe integration: PaymentIntents with Payment Elements, versus hosted Checkout.
- Authentication scope: email/password, Google OAuth, and guest checkout (Google OAuth at launch unconfirmed).
- Email-delivery provider.
- Tax calculation and collection policy.
- Exact eSIM supplier API contract.
- Automatic commission-release period.
- Whether top-ups launch with the initial release.

---

## 4. Backend Architecture

One Django project containing five business apps and one shared support package.

```text
HTTP request
    ↓
DRF view
    ↓
Serializer validation and permission checks
    ↓
Business service
    ↓
Django models and transaction
    ↓
Stripe or supplier gateway when required
    ↓
Response serializer
```

Architecture rules:

- Views remain thin.
- Serializers validate external input.
- Services own business state changes.
- Models own persistence and local/database invariants.
- Complicated repeated reads may use selectors.
- Critical workflows do not use Django signals.
- Stripe and supplier code are isolated behind integration gateway modules.
- The Django ORM is used directly; no repository abstraction wraps ordinary ORM operations.
- Critical/financial state changes use `transaction.atomic()` and row locking.
- Concurrency-sensitive records use `select_for_update()`.
- External network calls do not run while holding long database locks.

---

## 5. Project and Folder Structure

```text
backend/
├── manage.py
├── pyproject.toml
├── Dockerfile
├── .env.example
│
├── config/
│   ├── __init__.py
│   ├── urls.py
│   ├── settings.py
│   ├── asgi.py
│   └── wsgi.py
│
├── apps/
│   ├── __init__.py
│   │
│   ├── common/
│   │   ├── __init__.py
│   │   ├── models.py
│   │   ├── encryption.py
│   │   ├── exceptions.py
│   │   └── pagination.py
│   │
│   ├── accounts/
│   │   ├── migrations/
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── services.py
│   │   ├── serializers.py
│   │   ├── permissions.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── tests.py
│   │
│   ├── catalog/
│   │   ├── migrations/
│   │   ├── management/commands/import_catalog.py
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── services.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── tests.py
│   │
│   ├── orders/
│   │   ├── migrations/
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── services.py
│   │   ├── serializers.py
│   │   ├── permissions.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── tests.py
│   │
│   ├── payments/
│   │   ├── migrations/
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py
│   │   ├── stripe.py
│   │   ├── services.py
│   │   ├── webhooks.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── tests.py
│   │
│   └── esims/
│       ├── migrations/
│       ├── management/commands/process_jobs.py
│       ├── admin.py
│       ├── apps.py
│       ├── models.py
│       ├── supplier.py
│       ├── services.py
│       ├── serializers.py
│       ├── permissions.py
│       ├── views.py
│       ├── urls.py
│       └── tests.py
│
└── templates/
    └── emails/
        ├── order-confirmation.html
        ├── esim-ready.html
        ├── topup-confirmation.html
        └── refund-confirmation.html
```

Files are split further only when an existing file's size creates a real maintenance problem.

---

## 6. Database Schema

### Conventions

- Primary keys: UUID.
- Money: `BIGINT` minor units.
- Launch settlement / transaction currency: USD.
- Plan data: decimal megabytes, where 1 GB = 1000 MB.
- eSIM usage: bytes.
- Time: `TIMESTAMPTZ` in UTC.
- Date-only values (commission payout periods): `DATE`.
- Emails: `CITEXT`.
- Network collections: one `JSONB` array of strings.
- Provider metadata: redacted `JSONB`.
- eSIM credentials: encrypted `BYTEA`.
- Transactional records are never hard-deleted.
- One `order_items` row represents one eSIM or one top-up.
- `updated_at` is maintained by Django and a database trigger for direct SQL updates.

### Business tables

```text
01. countries
02. suppliers
03. catalog_plans
04. users
05. organizations
06. organization_members
07. topup_products
08. carts
09. cart_items
10. promo_codes
11. orders
12. promo_redemptions
13. order_items
14. payments
15. refunds
16. refund_items
17. commission_payouts
18. partner_commissions
19. esim_profiles
20. topup_fulfillments
21. supplier_events
22. webhook_events
23. notifications
```

Django additionally creates framework-managed migration, session, permission, group, content-type, and admin-log tables.

---

## 7. Tables, Columns, Keys, and Relationships

### `countries`

```text
id uuid PK
iso2 char(2) UQ NOT NULL
name varchar(120) NOT NULL
slug varchar(140) UQ NOT NULL
region varchar(80) NOT NULL
flag_emoji varchar(16) NULL
timezone varchar(80) NULL
is_popular boolean NOT NULL DEFAULT false
homepage_badge varchar(20) NULL
is_active boolean NOT NULL DEFAULT true
sort_order integer NOT NULL DEFAULT 0
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

- `iso2` is uppercase and exactly two letters.
- `homepage_badge` is null, `popular`, or `best_value`.
- `sort_order >= 0`.
- All public country queries require `is_active=true`.
- Homepage ordering uses `sort_order`.
- Timezone remains null unless verified.

Indexes:

```text
(is_active, is_popular, sort_order)
(region, is_active, name)
```

### `suppliers`

```text
id uuid PK
code varchar(40) UQ NOT NULL
name varchar(120) NOT NULL
status varchar(20) NOT NULL
api_base_url varchar(500) NULL
support_email citext NULL
metadata jsonb NOT NULL DEFAULT {}
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Statuses:

```text
active
paused
disabled
```

Supplier credentials are environment secrets and never database columns.

### `catalog_plans`

```text
id uuid PK
supplier_id uuid FK suppliers.id RESTRICT NOT NULL
country_id uuid FK countries.id RESTRICT NOT NULL
product_code varchar(120) UQ NOT NULL
supplier_package_code varchar(120) NOT NULL
plan_type varchar(20) NOT NULL
day_count integer NULL
display_name varchar(240) NOT NULL
data_limit_mb bigint NULL
daily_high_speed_mb bigint NULL
validity_days integer NOT NULL
traffic_policy text NULL
activation_policy text NULL
hotspot_supported boolean NULL
network_names jsonb NOT NULL DEFAULT []
topup_supported boolean NOT NULL DEFAULT false
retail_amount_minor bigint NOT NULL
wholesale_amount_minor bigint NULL
currency char(3) NOT NULL DEFAULT 'USD'
status varchar(20) NOT NULL DEFAULT 'paused'
badge varchar(20) NULL
tier varchar(20) NULL
is_default_selected boolean NOT NULL DEFAULT false
sort_order integer NOT NULL DEFAULT 0
supplier_verified_at timestamptz NULL
supplier_metadata jsonb NOT NULL DEFAULT {}
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

- `plan_type IN ('fixed','daily')`.
- Fixed plans require `data_limit_mb > 0`, and null `daily_high_speed_mb` and `day_count`.
- Daily plans require `daily_high_speed_mb > 0`, null `data_limit_mb`, and `day_count = validity_days`.
- `validity_days > 0`.
- `retail_amount_minor > 0`.
- `wholesale_amount_minor` is null or non-negative.
- `network_names` is a JSON array.
- `badge` is null, `popular`, or `value`.
- Status is `draft`, `paused`, `active`, or `retired`.
- Only active plans are publicly returned or purchasable.
- One non-retired default plan is allowed per country.
- Supplier package codes are not globally unique.
- Disappearing supplier products are retired, never deleted.

Indexes:

```text
(country_id, status, sort_order)
(supplier_id, supplier_package_code)
(status)
UNIQUE (country_id) WHERE is_default_selected=true AND status<>'retired'
```

### `users`

```text
id uuid PK
email citext UQ NOT NULL
password varchar(128) NOT NULL
first_name varchar(150) NOT NULL DEFAULT ''
last_name varchar(150) NOT NULL DEFAULT ''
preferred_currency char(3) NOT NULL DEFAULT 'USD'
email_verified_at timestamptz NULL
is_active boolean NOT NULL DEFAULT true
is_staff boolean NOT NULL DEFAULT false
is_superuser boolean NOT NULL DEFAULT false
last_login timestamptz NULL
date_joined timestamptz NOT NULL
deleted_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

The custom email-based user model must exist before the first migration. Django manages password hashing. OAuth-only accounts use an unusable Django password rather than a null password.

### `organizations`

```text
id uuid PK
name varchar(200) NOT NULL
organization_type varchar(30) NOT NULL
billing_email citext NOT NULL
status varchar(20) NOT NULL DEFAULT 'pending'
default_commission_type varchar(20) NULL
default_commission_value bigint NULL
commission_currency char(3) NULL
metadata jsonb NOT NULL DEFAULT {}
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Organization types:

```text
travel_agency
business
affiliate
```

Commission types:

```text
percentage_bps
fixed
```

For percentage commission, `10000` basis points equals 100%.

### `organization_members`

```text
id uuid PK
organization_id uuid FK organizations.id CASCADE NOT NULL
user_id uuid FK users.id CASCADE NOT NULL
role varchar(20) NOT NULL
status varchar(20) NOT NULL DEFAULT 'active'
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

```text
UNIQUE (organization_id, user_id)
role IN ('owner','admin','buyer','viewer')
status IN ('invited','active','disabled')
```

### `topup_products`

```text
id uuid PK
supplier_id uuid FK suppliers.id RESTRICT NOT NULL
base_plan_id uuid FK catalog_plans.id SET NULL
product_code varchar(120) UQ NOT NULL
supplier_package_code varchar(120) NOT NULL
name varchar(240) NOT NULL
data_amount_mb bigint NOT NULL
validity_days integer NULL
retail_amount_minor bigint NOT NULL
wholesale_amount_minor bigint NULL
currency char(3) NOT NULL DEFAULT 'USD'
status varchar(20) NOT NULL DEFAULT 'paused'
supplier_metadata jsonb NOT NULL DEFAULT {}
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

- Data amount is positive.
- Validity is null or positive.
- Retail price is positive.
- Status is `draft`, `paused`, `active`, or `retired`.

Top-up products are included only if top-ups are enabled at launch.

### `carts`

```text
id uuid PK
user_id uuid FK users.id SET NULL
organization_id uuid FK organizations.id SET NULL
guest_token_hash bytea UQ NULL
currency char(3) NOT NULL DEFAULT 'USD'
status varchar(20) NOT NULL DEFAULT 'active'
expires_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

- A cart belongs to either an authenticated user or a guest token, never both.
- An organization cart requires an authenticated user.
- Only one active cart exists per authenticated user and currency.
- Guest cart tokens are cryptographically random and stored only as hashes; raw tokens are never stored.

### `cart_items`

```text
id uuid PK
cart_id uuid FK carts.id CASCADE NOT NULL
item_type varchar(20) NOT NULL
catalog_plan_id uuid FK catalog_plans.id RESTRICT NULL
topup_product_id uuid FK topup_products.id RESTRICT NULL
target_esim_profile_id uuid FK esim_profiles.id RESTRICT NULL
quantity integer NOT NULL DEFAULT 1
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

- `item_type` is `esim` or `topup`.
- `quantity` is between 1 and 1000.
- eSIM items require a plan and no target profile.
- Top-up items require a top-up product, a target profile, and quantity one.
- Duplicate eSIM plan rows in one cart are merged through quantity.
- Checkout expands eSIM quantity into separate order items.

The `target_esim_profile_id` foreign key is added after the initial `esim_profiles` migration to resolve the schema dependency.

### `promo_codes`

```text
id uuid PK
code citext UQ NOT NULL
organization_id uuid FK organizations.id RESTRICT NULL
discount_type varchar(20) NOT NULL
discount_value bigint NOT NULL
discount_currency char(3) NULL
maximum_discount_minor bigint NULL
minimum_order_minor bigint NOT NULL DEFAULT 0
commission_type varchar(20) NULL
commission_value bigint NULL
commission_currency char(3) NULL
usage_limit integer NULL
per_customer_limit integer NULL
starts_at timestamptz NULL
ends_at timestamptz NULL
is_active boolean NOT NULL DEFAULT true
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

- Discount type is `fixed` or `percentage_bps`.
- Percentage discounts do not exceed 10000 basis points.
- Fixed discounts require a currency.
- Agency-owned codes require an organization, a commission type, and a commission value.
- Fixed commission requires a currency.
- Start and end dates must be ordered.
- Limits are null or positive.

Customer discount and agency commission are independent calculations.

### `orders`

```text
id uuid PK
order_number varchar(40) UQ NOT NULL
user_id uuid FK users.id SET NULL
buyer_organization_id uuid FK organizations.id SET NULL
referring_organization_id uuid FK organizations.id RESTRICT NULL
promo_code_id uuid FK promo_codes.id RESTRICT NULL
promo_code_snapshot varchar(120) NULL
customer_email citext NOT NULL
currency char(3) NOT NULL
subtotal_minor bigint NOT NULL
discount_minor bigint NOT NULL DEFAULT 0
tax_minor bigint NOT NULL DEFAULT 0
total_minor bigint NOT NULL
status varchar(30) NOT NULL
payment_status varchar(30) NOT NULL
fulfillment_status varchar(30) NOT NULL
placed_at timestamptz NULL
metadata jsonb NOT NULL DEFAULT {}
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

```text
subtotal_minor >= 0
discount_minor >= 0
discount_minor <= subtotal_minor
tax_minor >= 0
total_minor >= 0
total_minor = subtotal_minor - discount_minor + tax_minor
```

Order statuses:

```text
pending_payment
paid
fulfilling
partially_fulfilled
fulfilled
cancelled
partially_refunded
refunded
failed
```

Payment statuses:

```text
pending
processing
paid
failed
cancelled
partially_refunded
refunded
```

Fulfilment statuses:

```text
pending
processing
partially_delivered
delivered
failed
cancelled
```

Buyer organization and referring organization have different meanings and are never conflated. Aggregate status fields may only be changed by order services.

### `promo_redemptions`

```text
id uuid PK
promo_code_id uuid FK promo_codes.id RESTRICT NOT NULL
order_id uuid FK orders.id RESTRICT UQ NOT NULL
user_id uuid FK users.id SET NULL
customer_email_hash bytea NOT NULL
status varchar(20) NOT NULL DEFAULT 'reserved'
reserved_at timestamptz NOT NULL
consumed_at timestamptz NULL
released_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Statuses:

```text
reserved
consumed
released
cancelled
```

This table is the authoritative promotion-usage ledger for total and per-customer coupon limits.

### `order_items`

```text
id uuid PK
order_id uuid FK orders.id RESTRICT NOT NULL
catalog_plan_id uuid FK catalog_plans.id RESTRICT NULL
topup_product_id uuid FK topup_products.id RESTRICT NULL
supplier_id uuid FK suppliers.id RESTRICT NOT NULL
item_type varchar(20) NOT NULL
product_code varchar(120) NOT NULL
supplier_package_code varchar(120) NOT NULL
product_name varchar(240) NOT NULL
country_iso2 char(2) NULL
country_name varchar(120) NULL
plan_type varchar(20) NULL
data_limit_mb bigint NULL
daily_high_speed_mb bigint NULL
validity_days integer NULL
traffic_policy text NULL
network_names jsonb NOT NULL DEFAULT []
unit_amount_minor bigint NOT NULL
wholesale_amount_minor bigint NULL
currency char(3) NOT NULL
status varchar(30) NOT NULL DEFAULT 'pending'
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

There is no quantity column. Each row is the immutable snapshot needed for fulfilment, refunds, customer support, and historical margin calculation after a catalogue plan is retired.

### `payments`

```text
id uuid PK
order_id uuid FK orders.id RESTRICT NOT NULL
provider varchar(30) NOT NULL
provider_payment_id varchar(255) NULL
provider_checkout_session_id varchar(255) NULL
idempotency_key varchar(255) UQ NOT NULL
amount_minor bigint NOT NULL
currency char(3) NOT NULL
status varchar(30) NOT NULL
failure_code varchar(120) NULL
failure_message text NULL
paid_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

```text
UNIQUE (provider, provider_payment_id)
UNIQUE (provider, provider_checkout_session_id)
amount_minor > 0
```

Multiple payment attempts may exist, but only one successful payment may fund an order unless a future split-payment design is introduced.

### `refunds`

```text
id uuid PK
payment_id uuid FK payments.id RESTRICT NOT NULL
provider varchar(30) NOT NULL
provider_refund_id varchar(255) NULL
idempotency_key varchar(255) UQ NOT NULL
amount_minor bigint NOT NULL
currency char(3) NOT NULL
reason text NULL
status varchar(20) NOT NULL
completed_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraint:

```text
UNIQUE (provider, provider_refund_id)
```

### `refund_items`

```text
id uuid PK
refund_id uuid FK refunds.id RESTRICT NOT NULL
order_item_id uuid FK order_items.id RESTRICT NOT NULL
amount_minor bigint NOT NULL
created_at timestamptz NOT NULL
```

Constraints:

- `UNIQUE (refund_id, order_item_id)`.
- A completed refund's allocations equal the refund amount.
- Cumulative refunds do not exceed the payment amount.
- Cumulative item allocations do not exceed the order-item amount.

### `commission_payouts`

```text
id uuid PK
organization_id uuid FK organizations.id RESTRICT NOT NULL
currency char(3) NOT NULL
amount_minor bigint NOT NULL
status varchar(20) NOT NULL
period_start date NOT NULL
period_end date NOT NULL
payment_method varchar(40) NULL
external_reference varchar(240) NULL
paid_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Statuses:

```text
draft
approved
processing
paid
failed
cancelled
```

### `partner_commissions`

```text
id uuid PK
organization_id uuid FK organizations.id RESTRICT NOT NULL
order_id uuid FK orders.id RESTRICT NOT NULL
promo_code_id uuid FK promo_codes.id RESTRICT NULL
payout_id uuid FK commission_payouts.id RESTRICT NULL
commission_type varchar(20) NOT NULL
commission_value_snapshot bigint NOT NULL
commissionable_minor bigint NOT NULL
commission_minor bigint NOT NULL
reversed_minor bigint NOT NULL DEFAULT 0
currency char(3) NOT NULL
status varchar(20) NOT NULL
available_at timestamptz NULL
approved_at timestamptz NULL
paid_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

```text
UNIQUE (organization_id, order_id)
0 <= reversed_minor <= commission_minor
```

Additional rules:

- Commission rules are snapshotted (`commission_type`, `commission_value_snapshot`).
- Paid commissions require a paid payout.
- Refunds update `reversed_minor`; original commission records remain intact.
- Paid reversals reduce the organization's next payable balance.

Statuses:

```text
pending
available
approved
paid
cancelled
reversed
```

### `esim_profiles`

```text
id uuid PK
order_item_id uuid FK order_items.id RESTRICT UQ NOT NULL
supplier_id uuid FK suppliers.id RESTRICT NOT NULL
supplier_reference varchar(255) NULL
status varchar(30) NOT NULL
iccid_encrypted bytea NULL
iccid_hash bytea UQ NULL
iccid_last4 char(4) NULL
smdp_address_encrypted bytea NULL
activation_code_encrypted bytea NULL
qr_payload_encrypted bytea NULL
encryption_key_version integer NULL
total_data_bytes bigint NULL
remaining_data_bytes bigint NULL
installed_at timestamptz NULL
activated_at timestamptz NULL
expires_at timestamptz NULL
last_synced_at timestamptz NULL
supplier_payload_redacted jsonb NOT NULL DEFAULT {}
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraints:

```text
UNIQUE (supplier_id, supplier_reference)   -- when present
0 <= remaining_data_bytes <= total_data_bytes
```

ICCID ciphertext, keyed hash, last four digits, and encryption-key version are stored together. One profile belongs to exactly one eSIM order item.

### `topup_fulfillments`

```text
id uuid PK
order_item_id uuid FK order_items.id RESTRICT UQ NOT NULL
esim_profile_id uuid FK esim_profiles.id RESTRICT NOT NULL
topup_product_id uuid FK topup_products.id RESTRICT NOT NULL
supplier_reference varchar(255) NULL
status varchar(30) NOT NULL
completed_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Statuses:

```text
pending
processing
completed
failed
cancelled
refunded
```

### `supplier_events`

```text
id uuid PK
supplier_id uuid FK suppliers.id RESTRICT NOT NULL
order_item_id uuid FK order_items.id RESTRICT NULL
esim_profile_id uuid FK esim_profiles.id RESTRICT NULL
event_type varchar(60) NOT NULL
idempotency_key varchar(255) UQ NOT NULL
correlation_id uuid NOT NULL
supplier_reference varchar(255) NULL
status varchar(30) NOT NULL
attempt_count integer NOT NULL DEFAULT 0
next_attempt_at timestamptz NULL
locked_at timestamptz NULL
request_data_redacted jsonb NULL
response_data_redacted jsonb NULL
error_code varchar(120) NULL
error_message text NULL
completed_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Statuses:

```text
pending
processing
retrying
succeeded
failed
cancelled
manual_review
```

This table is both the supplier audit trail and, provisionally, the durable PostgreSQL-backed work queue.

### `webhook_events`

```text
id uuid PK
provider varchar(30) NOT NULL
external_event_id varchar(255) NOT NULL
event_type varchar(120) NOT NULL
payload_redacted jsonb NOT NULL
signature_valid boolean NOT NULL
status varchar(20) NOT NULL
attempt_count integer NOT NULL DEFAULT 0
next_attempt_at timestamptz NULL
last_error text NULL
received_at timestamptz NOT NULL
processed_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Constraint:

```text
UNIQUE (provider, external_event_id)
```

Invalidly signed webhook bodies are rejected before business processing and are not trusted as provider events.

### `notifications`

```text
id uuid PK
user_id uuid FK users.id SET NULL
order_id uuid FK orders.id RESTRICT NULL
esim_profile_id uuid FK esim_profiles.id RESTRICT NULL
channel varchar(20) NOT NULL
recipient varchar(320) NOT NULL
template_code varchar(80) NOT NULL
idempotency_key varchar(255) UQ NOT NULL
provider_message_id varchar(255) NULL
status varchar(20) NOT NULL
attempt_count integer NOT NULL DEFAULT 0
next_attempt_at timestamptz NULL
failure_message text NULL
sent_at timestamptz NULL
delivered_at timestamptz NULL
created_at timestamptz NOT NULL
updated_at timestamptz NOT NULL
```

Statuses:

```text
queued
processing
sent
delivered
retrying
failed
cancelled
```

### Relationship summary

```text
countries 1 ── N catalog_plans
suppliers 1 ── N catalog_plans
suppliers 1 ── N topup_products
users 1 ── N carts
users N ── N organizations through organization_members
carts 1 ── N cart_items
organizations 1 ── N promo_codes
promo_codes 1 ── N promo_redemptions
promo_codes 1 ── N orders
orders 1 ── N order_items
orders 1 ── N payments
payments 1 ── N refunds
refunds 1 ── N refund_items
organizations 1 ── N partner_commissions
commission_payouts 1 ── N partner_commissions
order_items 1 ── 0..1 esim_profiles
order_items 1 ── 0..1 topup_fulfillments
esim_profiles 1 ── N topup_fulfillments
suppliers 1 ── N supplier_events
orders 1 ── N notifications
```

---

## 8. Business Logic and Rules

### Catalogue import

- Import is performed through a controlled Django management command.
- Countries are upserted by ISO-2; plans are upserted by product code.
- Missing products become retired; products are never automatically activated.
- Supplier package code is never treated as globally unique.
- Workbook prices are converted using `Decimal`, never binary floating point; USD values are converted to cents exactly.
- Fixed-plan `data_gb` becomes `data_limit_mb = data_gb × 1000`.
- Daily-plan `data_gb` becomes `daily_high_speed_mb = data_gb × 1000`.
- Network strings are split on commas, trimmed, stored as arrays, and rendered by consumers with `", "`.
- Unknown hotspot values become null.
- Turkey uses country code `TR`; existing product codes beginning with `TUR-` remain unchanged.
- All current timezone values remain null.
- All 385 current plans remain paused; no plan becomes active automatically.
- Only active countries and active plans are publicly available.
- Georgia is currently misclassified (as Africa) in the source workbook and must be corrected before production import.

### Country price calculation

The derived country price is:

```text
minimum(
    active plan retail_amount_minor / active plan validity_days
)
```

Rules:

- Use active plans only; never fall back to paused plans in production.
- Include fixed and daily plans.
- Do not round before selecting the minimum (calculate before display rounding).
- Return null when no active plan exists.
- The derived non-payable amount may be serialized as a decimal string.
- Payable amounts remain integer minor units.

### Cart

- Products are validated when added.
- A top-up target must belong to the purchasing customer or organization.
- Cart price values are never authoritative.
- Expired carts cannot be converted.
- Guest tokens are cryptographically random; guest-token hashes are compared using constant-time logic where applicable.

### Checkout

Checkout runs in a transaction:

1. Lock the cart.
2. Confirm the cart is active and unexpired.
3. Reload every product.
4. Confirm each product is active.
5. Recalculate prices from the database.
6. Validate organization membership.
7. Validate and reserve the promo code (transactionally).
8. Calculate subtotal, discount, tax, and total.
9. Create the order.
10. Expand eSIM quantities into individual order items.
11. Create immutable snapshots.
12. Mark the cart converted (only after successful order creation).

Client-submitted totals and catalogue prices are ignored. Zero-total orders do not create Stripe PaymentIntents and use a separately audited completion path.

### Promotions

- Promo codes are case-insensitive.
- Fixed discounts require a matching order currency.
- Percentage discounts use basis points and cannot exceed 10000 basis points.
- Discount cannot exceed subtotal.
- Total and per-customer limits use `promo_redemptions` rows.
- The promo-code row is locked during reservation.
- Failed or expired checkout releases the reservation.
- Verified successful payment consumes the reservation.
- The referring organization must match the promo code's organization.

### Payments

- The backend creates the Stripe payment object.
- Stored order amount and currency are authoritative.
- Browser-reported success is never accepted.
- Verified Stripe webhook state is authoritative.
- Webhooks are idempotent by provider and event ID.
- Amount, currency, and internal order reference are reconciled.
- A duplicate event returns success without repeating side effects.
- Payment confirmation creates durable fulfilment work.
- A paid order cannot receive another successful payment.
- Fully discounted zero-total orders do not create Stripe payments.

### eSIM provisioning / fulfilment

- Each eSIM order item produces at most one profile.
- Supplier operations use stable idempotency keys:

```text
provision:{order_item_id}
topup:{topup_fulfillment_id}
```

- Retries reuse the original key.
- Package code alone never identifies an internal product; supplier requests include internal order item, supplier, product, package code, and idempotency key.
- A timeout is treated as an unknown supplier outcome and retried with the same key.
- Supplier state is reconciled before another purchase is attempted.
- Supplier results are stored before notifications are queued.
- Unredacted supplier payloads are never persisted.
- Permanent or ambiguous failures move to manual review.

### Refunds

- Refunds are initiated server-side.
- Refund allocations identify affected order items.
- Successful cumulative refunds cannot exceed the successful payment amount.
- Successful item allocations cannot exceed the item amount.
- Refund completion updates payment, order, item, and commission summaries.
- Refund history is never deleted.

### Agency commissions

- The promo code identifies the referring organization.
- The order snapshots the code and organization.
- Commission is created only after verified successful payment.
- Commission type and value are snapshotted.
- Commissionable amount excludes tax and refunded product amounts.
- Percentage commissions use integer arithmetic:

```text
commission_minor = floor(commissionable_minor × basis_points / 10000)
```

- Commission begins as pending and does not automatically become payable until the release policy is confirmed.
- Provisional release policy: manual administrative approval after refund review.
- Commission rule changes do not alter historical commission snapshots.
- Refunds update `reversed_minor`; original commission and payout records are retained.
- A paid reversal reduces the organization's future payable balance rather than deleting or rewriting the old payout.

### Top-ups

- A top-up requires an existing owned eSIM profile.
- The profile and product must use a compatible supplier.
- The product must be active.
- Top-up quantity is one.
- Supplier completion updates the profile's usage state.
- Top-up launch timing remains unconfirmed.

---

## 9. API Endpoints

All endpoints are versioned under `/api/v1/`.

### Authentication

```text
GET    /api/v1/auth/csrf/
POST   /api/v1/auth/register/
POST   /api/v1/auth/login/
POST   /api/v1/auth/logout/
POST   /api/v1/auth/password-reset/
POST   /api/v1/auth/password-reset/confirm/
GET    /api/v1/account/me/
PATCH  /api/v1/account/me/
```

Google OAuth endpoints are deferred until the launch authentication scope is confirmed.

### Catalogue

```text
GET /api/v1/catalog/countries/
GET /api/v1/catalog/countries/{slug}/
GET /api/v1/catalog/countries/{slug}/plans/
GET /api/v1/catalog/plans/{product_code}/
```

Public catalogue responses exclude inactive products, wholesale prices, supplier metadata, and competitor information.

### Cart

```text
GET    /api/v1/cart/
POST   /api/v1/cart/items/
PATCH  /api/v1/cart/items/{id}/
DELETE /api/v1/cart/items/{id}/
POST   /api/v1/cart/promo-code/
DELETE /api/v1/cart/promo-code/
```

### Checkout and Orders

```text
POST /api/v1/checkout/
GET  /api/v1/orders/
GET  /api/v1/orders/{id}/
```

### Payments

```text
POST /api/v1/payments/payment-intent/
POST /api/v1/webhooks/stripe/
```

The payment-intent endpoint is provisional until the Stripe integration choice is confirmed.

### eSIMs and Top-ups

```text
GET  /api/v1/esims/
GET  /api/v1/esims/{id}/
POST /api/v1/esims/{id}/refresh-usage/
GET  /api/v1/esims/{id}/topups/
POST /api/v1/esims/{id}/topups/
```

### Organizations and Commissions

```text
GET /api/v1/organizations/
GET /api/v1/organizations/{id}/
GET /api/v1/organizations/{id}/commissions/
GET /api/v1/organizations/{id}/payouts/
```

Commission approval and payout creation are staff-only Django Admin operations at launch.

### Operational / Health

```text
GET /health/live/
GET /health/ready/
```

---

## 10. Request and Response Formats

### Success

```json
{
  "id": "d0b57541-1dcb-4324-b987-1e9dd606cd29",
  "status": "pending_payment",
  "currency": "USD",
  "total_minor": 1299
}
```

### Paginated collection

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": []
}
```

### Derived country price

```json
{
  "amount": "0.27",
  "currency": "USD"
}
```

### Error

```json
{
  "error": {
    "code": "plan_unavailable",
    "message": "This plan is currently unavailable.",
    "fields": {}
  }
}
```

Rules:

- Payable money values are integer minor units.
- Derived non-payable daily rates are decimal strings.
- Dates and timestamps are ISO 8601 (UTC).
- UUIDs are strings.
- Error codes are stable machine-readable identifiers.
- Stack traces, SQL details, provider errors, and secrets are never returned.
- eSIM credentials are returned only from the authenticated profile-detail endpoint after object-level ownership verification.

---

## 11. Authentication and Authorization

### Session model

- Use Django database sessions; do not build a custom token-session system.
- Do not store authentication tokens in browser-accessible storage.
- Session cookies are Secure and HttpOnly.
- Require CSRF protection for unsafe methods.
- Rotate the session on login.
- Invalidate the session on logout and after password reset.

### Guest checkout

- Guest checkout is supported.
- Guest cart identity uses a cryptographically random secret token; only its hash is stored.
- Guest orders retain the customer email and are governed by order access controls.
- Linking a guest order to an account requires verified ownership of the matching email.

### Authorization

- Customers access only their own orders and eSIM profiles.
- Organization members access only their organization's data.
- Owners manage organization-level access; owners and admins manage membership.
- Buyers create organization orders.
- Viewers are read-only.
- Agency users cannot modify commission rules, calculated commissions, or payout states.
- Staff operations require explicit Django permissions.
- Every secret-bearing eSIM endpoint performs object-level ownership verification.

---

## 12. Validation Rules

- Every external request uses serializer validation before service execution.
- UUIDs, emails, currencies, dates, quantities, and enums are validated.
- Currency is uppercase ISO 4217; launch settlement currency is USD.
- Money and commissions never use floating-point arithmetic.
- Catalogue products are revalidated at cart addition and during checkout.
- Top-up target ownership and supplier compatibility are validated before checkout.
- Organization membership and role are checked on every organization action.
- Promo limits are checked transactionally.
- Stripe amount, currency, metadata, and order reference are reconciled.
- Supplier responses are schema-validated before persistence.
- Network arrays contain only non-empty strings.
- Metadata fields contain JSON objects.
- Encrypted data includes a recognized key version.
- Taxes must not silently default to an unapproved legal result.

---

## 13. Error Handling

### Stable error codes

```text
authentication_required
permission_denied
invalid_credentials
email_not_verified
country_unavailable
plan_unavailable
price_changed
cart_expired
invalid_quantity
promo_invalid
promo_expired
promo_usage_exceeded
payment_required
payment_mismatch
payment_already_completed
refund_limit_exceeded
esim_not_ready
topup_not_supported
supplier_temporarily_unavailable
supplier_manual_review
validation_error
conflict
rate_limited
internal_error
```

### HTTP status mapping

```text
400 invalid request or business input
401 missing or invalid authentication
403 authenticated but unauthorized
404 inaccessible or nonexistent resource
409 state or idempotency conflict
422 valid request that cannot satisfy a business rule
429 rate limit exceeded
500 unexpected internal failure
502 invalid upstream response
503 temporary upstream unavailability
```

Unexpected errors receive a correlation ID and are logged. Public responses never contain internal exception details.

---

## 14. Security Requirements

- `DEBUG=false` in production.
- Explicit `ALLOWED_HOSTS`.
- Explicit `CSRF_TRUSTED_ORIGINS`.
- Exact CORS allowlist; no credentialed wildcard CORS.
- HTTPS redirection.
- Secure and HttpOnly session cookie; Secure CSRF cookie.
- `SameSite=Lax` unless a verified requirement changes it.
- HSTS after HTTPS deployment is verified.
- Mandatory database SSL; database credentials are backend-only.
- Mandatory supplier TLS verification.
- Stripe webhook signatures verified using the raw request body.
- Supplier and payment/Stripe credentials stored only as environment secrets.
- Public APIs never expose wholesale prices.
- eSIM secrets use authenticated application-layer encryption.
- ICCID lookup uses a keyed HMAC blind index.
- Encryption records include a key version.
- Logs contain no passwords, cookies, authorization headers, activation codes, ICCIDs, QR payloads, SM-DP+ credentials, or raw provider bodies.
- Secrets never appear in logs, URLs, analytics, Stripe metadata, notification records, or stored provider payloads.
- Provider payloads are redacted before persistence.
- Admin secret values are masked and permission-restricted.
- Rate limiting applies to authentication, password reset, promo validation, checkout, payment creation, and usage refresh.
- Backups are encrypted, with at least one copy stored outside the primary database provider.
- Restore procedures are tested.
- Dependencies and Django security releases are reviewed regularly.

---

## 15. Data Flow

### Catalogue import

```text
Workbook
→ validate both sheets and country-plan joins
→ normalize ISO-2, data, and network arrays
→ convert prices with Decimal to minor units
→ upsert countries by ISO-2
→ upsert plans by product code
→ retire missing products
→ generate import report
→ never activate plans automatically
```

### Purchase

```text
Cart
→ lock and validate
→ reload active products
→ calculate authoritative prices
→ reserve promotion
→ calculate totals
→ create order
→ expand quantities
→ create immutable order-item snapshots
→ create PaymentIntent
→ return client secret
```

### Payment and provisioning

```text
Stripe webhook
→ verify signature
→ insert idempotent webhook event
→ lock payment and order
→ reconcile amount and currency
→ mark payment and order paid
→ consume promo redemption
→ create pending commission
→ create supplier events
→ worker claims events
→ supplier provisioning with stable idempotency key
→ encrypt and store eSIM profile
→ mark order item fulfilled
→ queue eSIM-ready notification
```

### Refund

```text
Authorized refund request
→ validate refundable balance
→ create pending refund and item allocations
→ Stripe refund with idempotency key
→ process verified result
→ update payment, order, and item financial states
→ reverse affected commission amount
→ queue customer notification
```

### Top-up

```text
Owned eSIM
→ validate profile and compatible active top-up
→ create top-up order
→ verify payment
→ create topup_fulfillment
→ supplier call with stable idempotency key
→ update profile usage
→ queue confirmation
```

---

## 16. Performance and Scalability

- The current 68-country, 385-plan catalogue requires no distributed or special scaling architecture.
- Index catalogue queries by country, status, and sort order.
- Index retry queues by `(status, next_attempt_at)`.
- Use `select_related` and `prefetch_related` for bounded relationship loading.
- Paginate orders, refunds, commissions, supplier events, webhooks, and notifications.
- Use PostgreSQL connection pooling when the provider supports it.
- Keep database connections bounded (important for serverless PostgreSQL).
- Claim jobs with `SELECT FOR UPDATE SKIP LOCKED`.
- Cache only safe catalogue reads after correctness is established.
- Never cache checkout, payment, refund, promotion, or fulfilment writes.
- Do not store images or large binary files in PostgreSQL.
- Apply retention/pruning policies only to eligible redacted operational payloads and completed operational logs.
- Never prune required financial or fulfilment history.

---

## 17. Background Jobs and Integrations

### PostgreSQL-backed worker

The provisional launch design uses a Django management command running as a separate worker process, backed by PostgreSQL.

- Supplier and notification jobs are durable rows in `supplier_events` and `notifications`.
- Workers claim rows with `SKIP LOCKED`.
- Status moves from pending or retrying to processing.
- Job claiming and attempt increments are atomic.
- Stale processing locks are recoverable.
- Retries use exponential backoff with a maximum attempt count and reuse idempotency keys.
- Exhausted jobs move to manual review or failed.
- Celery and Redis are added only after measured need.

### Stripe

- Django creates payment and refund operations.
- Stripe webhooks are authoritative and all processing is idempotent.
- Stripe metadata contains only non-secret internal references; eSIM credentials never enter Stripe metadata.
- Final PaymentIntent (with Payment Elements) versus hosted Checkout choice remains unconfirmed.

### eSIM supplier

eSIM Access is the currently identified supplier. The integration must be implemented behind a gateway, and response schemas must be validated against official supplier documentation before production activation.

Still unconfirmed:

- Authentication format.
- Provisioning request schema.
- Response schema.
- Timeout policy.
- Rate limits.
- Balance checks.
- Usage endpoint.
- Top-up contract.
- Supplier-side idempotency guarantees.

### Email

- Provider remains unconfirmed.
- Notifications are durable and idempotent.
- Email failure does not roll back stored fulfilment (a successfully stored eSIM).
- Activation secrets are never placed in URLs or analytics parameters.

---

## 18. Environment and Configuration

Required production settings:

```text
DJANGO_SETTINGS_MODULE
DJANGO_SECRET_KEY
DATABASE_URL
ALLOWED_HOSTS
CSRF_TRUSTED_ORIGINS
CORS_ALLOWED_ORIGINS
SESSION_COOKIE_DOMAIN
FIELD_ENCRYPTION_KEY
FIELD_ENCRYPTION_KEY_VERSION
ICCID_HMAC_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
ESIM_SUPPLIER_BASE_URL
ESIM_SUPPLIER_API_KEY
EMAIL_BACKEND
DEFAULT_FROM_EMAIL
```

Optional until confirmed:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
EMAIL_PROVIDER_API_KEY
```

Rules:

- Production startup fails when a required setting is missing.
- Secrets are never committed; `.env.example` contains names only.
- Development, test, staging, and production databases are separate.
- Production keys are not reused locally.
- Old encryption keys remain available until all associated records are re-encrypted.
- Timeouts, retry limits, and lock durations are explicit configuration values with safe defaults.

---

## 19. Testing Requirements

### Models and constraints

- ISO-2 validation.
- Country badge validation.
- Fixed-plan and daily-plan data-pair checks.
- One default plan per country.
- Repeated supplier package codes allowed.
- Order arithmetic.
- Cart identity exclusivity.
- One profile per eSIM order item.
- Refund allocation uniqueness.
- Commission reversal limits.
- JSON shape validation.

### Services

- Quantity three creates three order items.
- Quantity thirty creates thirty order items and permits thirty profiles.
- Checkout uses the current database price when it changed between cart and checkout.
- Paused plans cannot be purchased.
- Concurrent final promo use succeeds once.
- Failed payment releases the promo reservation.
- Duplicate checkout does not duplicate orders.
- Zero-total checkout does not call Stripe.
- Duplicate Stripe webhook is harmless.
- Payment mismatch never marks an order paid.
- Supplier timeout reuses the same idempotency key.
- Duplicate supplier result creates no duplicate profile.
- Multi-item refund reconciles exactly.
- Partial refund reverses the correct (proportional) commission.
- Paid reversal reduces future payable balance.
- Notification failure does not lose the eSIM.
- Top-up cannot target another customer's profile.

### Security

- CSRF enforcement.
- Secure session-cookie settings.
- CORS allowlist enforcement.
- Customer isolation.
- Organization isolation.
- Agency commission immutability.
- Wholesale-field exclusion from public responses.
- Secret redaction.
- Invalid webhook rejection.
- Admin permission restrictions.

### End-to-end

```text
guest purchase → payment → eSIM → notification
account purchase → payment → account eSIM
agency coupon → payment → commission → payout
payment → partial refund → commission reversal
eSIM → top-up → supplier completion
supplier timeout → retry → success
```

---

## 20. Deployment and Maintenance

- Build one Django application image.
- Run Gunicorn as the web process.
- Run the PostgreSQL-backed worker as a separate process.
- Apply migrations before switching new application traffic.
- Run readiness checks after migrations.
- Keep database migrations backward-compatible during rollout.
- Separate destructive data migrations from application releases.
- Configure provider resource and spending limits.
- Run scheduled database backups.
- Run nightly encrypted off-provider `pg_dump`.
- Retain daily and weekly backups.
- Test restoration before launch and periodically afterward.
- Monitor failed payments, webhook failures, supplier retries, manual-review jobs, notification failures, database capacity, and backup completion.
- Review catalogue verification before activating plans.
- Apply approved retention requirements to customer and financial data.

---

## 21. Known Issues and Future Improvements

### Current blockers / unconfirmed

- All 385 catalogue plans are paused; no plan may be sold before explicit verification and activation.
- Georgia is classified as Africa in the current workbook and requires correction.
- Tax calculation and collection policy is unresolved and is a launch blocker.
- Exact supplier API behavior has not been verified from official documentation.
- Production database provider is unconfirmed.
- Stripe payment flow (PaymentIntents vs hosted Checkout) is unconfirmed.
- Email provider is unconfirmed.
- Google OAuth launch scope is unconfirmed.
- Commission-release timing is unconfirmed (manual approval is the provisional default).
- Top-up launch timing is unconfirmed.

### Future improvements

- Price-history table if scheduled pricing or catalogue-price analytics become necessary.
- Normalized plan-country coverage for verified regional or global plans.
- Dedicated agency portal.
- Automated commission settlement.
- Immutable commission-adjustment ledger if payout volume requires detailed accounting.
- Celery and Redis if PostgreSQL job processing becomes insufficient.
- Multiple suppliers and failover routing.
- Dedicated object storage for generated documents or large exports.
- Paid point-in-time database recovery.
- Dedicated immutable administrative audit table if required by regulation.

---

## 22. Final Backend Decisions

- Build one modular Django monolith.
- Use Django REST Framework and PostgreSQL.
- Use a custom email-based user model from the first migration.
- Use Django database sessions instead of custom authentication tokens.
- Support guest checkout.
- Keep countries and country plans in separate tables.
- Keep current catalogue prices on plan rows; snapshot prices and plan details on order items.
- Do not add price-history tables initially.
- Store one purchased eSIM or top-up per order item.
- Expand cart quantities during checkout.
- Calculate all monetary values server-side.
- Store payable money in integer minor units.
- Use USD as the launch settlement currency.
- Accept payment success only through verified Stripe webhooks.
- Make webhooks and supplier operations idempotent.
- Use durable PostgreSQL-backed supplier and notification jobs.
- Encrypt eSIM credentials and store a keyed ICCID lookup hash.
- Persist only redacted provider payloads.
- Preserve payment, refund, commission, payout, and fulfilment history.
- Link agency promo codes directly to organizations.
- Snapshot commission rules on paid orders.
- Allocate refunds across affected order items.
- Reverse commissions without deleting historical records.
- Use Django Admin for restricted launch operations.
- Do not introduce microservices, GraphQL, Redis, Celery, or Kubernetes without a measured need.
- Treat hosting, Google OAuth, Stripe payment flow, tax policy, email provider, commission release timing, supplier contract, and top-up launch timing as explicitly unconfirmed until approved.
