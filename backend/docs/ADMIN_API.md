# eSIMFlys Admin APIs — Frontend Integration Guide

Two separate administration surfaces on one backend. Every example below is a **real
captured response**, not a hand-written sample.

| Panel | Namespace | Who |
|---|---|---|
| **Platform admin** | `/api/v1/admin/…` | platform owner + internal staff |
| **Travel agency** | `/api/v1/agency/{organization_id}/…` | agency owners/staff |

- **Base URL (local):** `http://127.0.0.1:8000`
- **Auth:** the same Django session + CSRF flow as the storefront — see
  [`API.md`](./API.md) §3. There is no separate admin login.
- The storefront API is documented separately in [`API.md`](./API.md).

---

## 1. The business model in one paragraph

The platform issues a **referral tracking code** to a travel agency. The agency gives it to
customers. **The customer buys on the public website and pays full price — the code carries
no discount.** It exists purely to attribute the sale, so the agency earns commission
(default **20%**, `2000` basis points). The agency panel is therefore **reporting-only**:
agencies do not place orders, do not manage customers, and never see eSIM credentials.

---

## 2. ⚠️ Rules that will shape your UI

**a) Agencies never see the customer.** A referral order belongs to the *platform's*
customer, who merely used the agency's code. The agency sales payload has **no
`customer_email` field at all** — not masked, absent. Don't build a "customer" column in the
agency panel; there is no data behind it.

**b) 404, never 403, for cross-tenant access.** Requesting another agency's data returns
`404`, because a `403` would confirm the resource exists. Treat 404 on an agency route as
"not yours or not found" — the two are intentionally indistinguishable.

**c) Money is integer minor units.** `3398` = **$33.98**. Same convention as the storefront.

**d) Roles are enforced server-side.** Hiding a button is not security — the API returns
`403` regardless. See the matrix in §5.

**e) Status changes are actions, not field edits.** `PATCH {"status": "active"}` on an
organization is silently ignored. Use the lifecycle endpoints (§6.2).

---

## 3. Platform admin API — `/api/v1/admin/`

### 3.1 Dashboard
`GET /admin/dashboard/`
```json
{
  "currency": "USD",
  "revenue": { "gross_minor": 3398, "refunded_minor": 0, "net_minor": 3398 },
  "orders": {
    "total": 1, "paid": 1,
    "by_status": { "fulfilled": 1 },
    "by_payment_status": { "paid": 1 }
  },
  "esims": { "total": 2, "live": 2, "failed": 0 },
  "commissions": { "outstanding_minor": 679, "paid_minor": 0, "reversed_minor": 0 },
  "operations": {
    "supplier_jobs_pending": 0, "supplier_jobs_manual_review": 0,
    "notifications_failed": 0, "webhooks_rejected": 0
  },
  "margin": { "retail_minor": 3398, "wholesale_minor": 1438, "margin_minor": 1960 }
}
```
> The **`margin` block only appears for a role holding `platform.manage_pricing`**
> (superuser / platform_admin). Finance, support and read-only admins get the identical
> response *without* that key — code defensively for its absence.

Optional: `?date_from=&date_to=`. Also `GET /admin/reports/revenue/` → `{"series": [{date, revenue_minor, orders}]}`.

### 3.2 Organizations (agencies)
`GET /admin/organizations/` — paginated. Filters: `?status=&organization_type=&search=`
```json
{
  "id": "5942e8ab-0738-490e-a37c-b266305b32bd",
  "name": "Sunrise Travel",
  "organization_type": "travel_agency",
  "billing_email": "ops@sunrise.com",
  "support_email": "help@sunrise.com",
  "country": "AE",
  "status": "active",
  "default_commission_type": null,
  "default_commission_value": null,
  "commission_currency": null,
  "approved_at": null,
  "suspended_at": null,
  "suspension_reason": null,
  "member_count": 1,
  "created_at": "2026-07-28T17:56:40.110907Z",
  "updated_at": "2026-07-28T17:56:40.110912Z"
}
```
- `POST /admin/organizations/` → **201**, returns `id` + `status: "pending"`.
- `GET|PATCH /admin/organizations/{id}/` — `status`, `approved_at`, `suspended_at`,
  `suspension_reason` are read-only here.

### 3.3 Lifecycle actions
```
POST /admin/organizations/{id}/approve/     {}
POST /admin/organizations/{id}/suspend/     {"reason": "fraud review"}   ← reason REQUIRED
POST /admin/organizations/{id}/activate/    {}
POST /admin/organizations/{id}/reject/      {"reason": "..."}  (optional)
POST /admin/organizations/{id}/close/       {"reason": "..."}  (optional, terminal)
```
Legal transitions — anything else returns **409 `invalid_status_transition`**:

| From | To |
|---|---|
| `pending` | `active`, `rejected`, `closed` |
| `active` | `suspended`, `closed` |
| `suspended` | `active`, `closed` |
| `rejected` | `pending`, `closed` |
| `closed` | *(terminal)* |

**Suspension has teeth:** a non-`active` agency cannot log into the agency panel *and earns
no commission on new sales* (the withholding is audited).

### 3.4 Members
```
GET    /admin/organizations/{id}/members/                 → list
POST   /admin/organizations/{id}/members/                 {"email","role"}  → 201
PATCH  /admin/organizations/{id}/members/{member_id}/     {"role"} and/or {"status"}
DELETE /admin/organizations/{id}/members/{member_id}/     → 204
```
Roles: `owner | admin | buyer | viewer`. Statuses: `invited | active | disabled`.
The user must already have an account (`404` otherwise). **An organization must always keep
at least one active owner** — otherwise `409 last_owner_protected`.

### 3.5 Tracking codes
`GET /admin/organizations/{id}/tracking-codes/`
```json
{
  "id": "31f4deaf-68a4-4496-bc49-74652eca76f3",
  "code": "SUNRISE20",
  "kind": "tracking",
  "organization": "5942e8ab-0738-490e-a37c-b266305b32bd",
  "organization_name": "Sunrise Travel",
  "commission_type": "percentage_bps",
  "commission_value": 2000,
  "usage_limit": null, "starts_at": null, "ends_at": null,
  "is_active": true, "redemption_count": 0,
  "created_at": "2026-07-28T17:56:40.249055Z"
}
```
`POST` the same URL with `{"code": "SUNRISE20", "commission_bps": 2000, "usage_limit": null, "ends_at": null}`.
`commission_bps` defaults to `2000` (20%) and must be 1–10000.

> **No discount fields exist on this endpoint** — not in the request, not in the response. A
> tracking code is forced to zero discount by a database constraint, so sending
> `discount_value` is silently ignored rather than honoured.

### 3.6 Orders, customers, payments
```
GET /admin/orders/       ?status=&payment_status=&fulfillment_status=&search=&date_from=&date_to=&referring_organization=
GET /admin/orders/{id}/  → adds items[], payments[], esims[]
GET /admin/customers/    ?search=
GET /admin/customers/{id}/ → {customer, orders[]}   ← this call is audited (PII access)
GET /admin/payments/     ?status=
```
```json
{
  "id": "7a38968d-392c-4335-8995-168d2916e831",
  "order_number": "ESF-CEFBC29ACDF2",
  "customer_email": "traveler@example.com",
  "currency": "USD",
  "subtotal_minor": 3398, "discount_minor": 0, "tax_minor": 0, "total_minor": 3398,
  "status": "fulfilled", "payment_status": "paid", "fulfillment_status": "delivered",
  "placed_at": "2026-07-28T17:56:40.282208Z",
  "promo_code_snapshot": "SUNRISE20",
  "referring_organization": "5942e8ab-0738-490e-a37c-b266305b32bd",
  "referring_organization_name": "Sunrise Travel",
  "item_count": 2
}
```
`wholesale_amount_minor` is **absent from every per-row payload** by design; margin is only
available as the dashboard aggregate.

### 3.7 Refunds — finance only
```
POST /admin/orders/{id}/refunds/   {"allocations":[{"order_item_id":"…","amount_minor":2000}], "reason":"…"}
GET  /admin/refunds/
```
Requires `platform.execute_refund` (**superuser, platform_admin, finance_admin — not
support**). Over-refunding returns `409 refund_limit_exceeded`. A successful refund
automatically reverses the agency commission proportionally.

### 3.8 eSIMs
```
GET  /admin/esims/                    ?status=&search=
GET  /admin/esims/{id}/
POST /admin/esims/{id}/reveal/        ← separate capability + audited + 10/hour
POST /admin/esims/{id}/refresh-usage/
```
```json
{
  "id": "0fadd862-7f08-4f7a-9a09-de3912b1138e",
  "status": "ready",
  "order_number": "ESF-CEFBC29ACDF2",
  "product_name": "Albania 10 GB — 30 Days",
  "country_iso2": "AL",
  "iccid_last4": "8640",
  "total_data_bytes": 10000000000,
  "remaining_data_bytes": 10000000000,
  "installed_at": null, "activated_at": null, "expires_at": null,
  "last_synced_at": null,
  "created_at": "2026-07-28T17:56:40.313690Z"
}
```
**List and detail never contain credentials.** Only `POST …/reveal/` returns them, and it
requires `platform.reveal_credentials` (superuser, platform_admin, support_admin —
**finance cannot**). Every reveal is written to the audit trail; the audit records *that* it
happened, never the secret. Build this as an explicit "Reveal credentials" button, not an
auto-load.

### 3.9 Operations
```
GET  /admin/supplier-events/          ?status=
POST /admin/supplier-events/{id}/retry/
GET  /admin/notifications/            ?status=
POST /admin/notifications/{id}/retry/
```
```json
{
  "id": "fcfecd2b-2ff4-4cfe-b884-a241caa30a35",
  "event_type": "provision",
  "status": "succeeded",
  "attempt_count": 1,
  "next_attempt_at": null,
  "error_code": null, "error_message": null,
  "supplier_reference": "esimref_7ce3774a27438d62",
  "correlation_id": "ae30fb11-a808-4843-970c-ce05588efda7",
  "completed_at": "2026-07-28T17:56:40.334494Z",
  "created_at": "2026-07-28T17:56:40.314989Z"
}
```
Retry is only valid from `failed | manual_review | retrying` — a `succeeded` job returns
**409** (re-running a completed provision could buy a second eSIM). Retries reuse the
original idempotency key, so they are safe.

### 3.10 Audit trail
`GET /admin/audit-events/` — filters `?action=&actor_type=&object_type=&organization=`
```json
{
  "id": "a93ea70e-9c3a-4a70-906a-4de8d34e1e60",
  "created_at": "2026-07-28T17:56:40.250774Z",
  "actor_email": "",
  "actor_type": "system",
  "organization": "5942e8ab-0738-490e-a37c-b266305b32bd",
  "action": "promo_code.tracking_issued",
  "object_type": "PromoCode",
  "object_id": "31f4deaf-68a4-4496-bc49-74652eca76f3",
  "object_repr": "PromoCode object (31f4deaf-…)",
  "changes": { "code": "SUNRISE20", "commission_bps": 2000 },
  "context": {},
  "ip_address": null
}
```
**Read-only** — `POST`/`PATCH`/`DELETE` return `405`. `actor_email` is empty for
system-initiated events. `changes` is redacted; secrets never appear.

---

### 3.11 Getting test accounts (do this first)

Do **not** hand-build users in Django admin — a bare `is_staff` user has **no** platform
capability and the API will look broken. One command creates every role:

```bash
python manage.py seed_demo_accounts
```

It prints the agency's `organization_id` and creates, all with password `DevPass!2345`:

| Account | Role |
|---|---|
| `root@esimflys.test` | superuser (everything) |
| `platform@esimflys.test` | platform_admin |
| `support@esimflys.test` | support_admin (no refunds, no pricing) |
| `finance@esimflys.test` | finance_admin (refunds, no credential reveal) |
| `readonly@esimflys.test` | readonly_admin |
| `agency-owner@esimflys.test` | agency **owner** |
| `agency-admin@esimflys.test` | agency **admin** |
| `agency-buyer@esimflys.test` | agency **buyer** |
| `agency-viewer@esimflys.test` | agency **viewer** |

It also creates an active agency ("Sunrise Travel") with the tracking code `SUNRISE20`, so
you can place an attributed order and see commissions appear. Re-running is safe.

### 3.12 Commissions

`GET /admin/commissions/` — filters `?status=&organization=&date_from=&date_to=&unpaid=true`
```json
{
  "id": "b9bd3f89-6186-4064-a9db-6283759cc1fc",
  "organization": "56df7542-54d6-4327-8555-e3fcf343cc67",
  "organization_name": "Sunrise Travel",
  "order_number": "ESF-FC3B3AAD47AD",
  "commission_type": "percentage_bps",
  "commission_value_snapshot": 2000,
  "commissionable_minor": 3398,
  "commission_minor": 679,
  "reversed_minor": 0,
  "net_minor": 679,
  "currency": "USD",
  "status": "pending",
  "approved_at": null, "paid_at": null, "payout": null,
  "created_at": "2026-07-29T20:50:12.639485Z"
}
```
- `POST /admin/commissions/{id}/approve/` → the same object with `status: "approved"` and
  `approved_at` set.
- `POST /admin/commissions/bulk-approve/` — body `{"commission_ids": ["…"]}`. Never aborts
  on one bad item; it reports each:
```json
{ "approved": [],
  "failed": [{ "id": "b9bd…", "error": "A commission in state 'paid' cannot be approved." }] }
```

**Lifecycle:** `pending → approved → paid`, plus `reversed` (refunded). Review-first by
design — commissions accrue as `pending` and only a human approval makes them payable.
Approving twice → `409 commission_not_approvable`. A commission fully reversed by a refund
can never be approved.

Show **`net_minor`** (`commission_minor − reversed_minor`) as the payable figure.

### 3.13 Payouts

`GET /admin/payouts/` — plain array; filters `?organization=&status=`
`POST /admin/payouts/` — body `{organization, period_start, period_end, currency?}` → **201**
```json
{
  "id": "0ac0175f-a416-44d3-bdd8-37131e6e78ec",
  "organization": "56df7542-…", "organization_name": "Sunrise Travel",
  "currency": "USD", "amount_minor": 679, "status": "draft",
  "period_start": "2026-07-01", "period_end": "2026-07-31",
  "payment_method": null, "external_reference": null, "paid_at": null,
  "commission_count": 1,
  "created_at": "2026-07-29T20:50:31.578414Z"
}
```
`POST /admin/payouts/{id}/pay/` — body `{reference?, method?}` → `status: "paid"`,
`paid_at` set, and every commission in the payout becomes `paid`.

- A payout only ever includes **approved** commissions **created inside its period**.
- No approved commissions in that period → `409 nothing_to_pay_out`.
- Paying twice → `409 payout_already_paid`.
- Month-end is normally run by `python manage.py run_monthly_payouts` (defaults to last
  month, idempotent, never auto-approves), so the panel is mostly for review and paying.

### 3.14 Catalogue — countries

`GET /admin/countries/` — plain array, `?search=`
```json
{
  "id": "b8c92aac-d491-4aa8-8c70-83d4ce6c53da",
  "iso2": "SA", "name": "Saudi Arabia", "slug": "saudi-arabia",
  "region": "Middle East & N.Africa", "flag_emoji": "🇸🇦", "timezone": null,
  "is_popular": true, "homepage_badge": "popular", "is_active": true, "sort_order": 1,
  "plan_count": 8, "active_plan_count": 8
}
```
`GET|PATCH /admin/countries/{id}/` — editable: `is_active`, `is_popular`,
`homepage_badge` (`null | "popular" | "best_value"`), `sort_order`, `timezone`.
Identity fields (`iso2`, `name`, `slug`, `region`, `flag_emoji`) are **read-only** — they
come from the supplier workbook.

`POST /admin/countries/{id}/activate-plans/` — the usual go-live action; turns on every
sellable plan for that country:
```json
{ "updated": ["<plan id>", "…"], "failed": [], "status": "active" }
```

### 3.15 Catalogue — plans

`GET /admin/plans/` — filters `?status=&country=&country_iso2=&search=`
```json
{
  "id": "ba48ab0e-c5ef-4be2-835c-43580f223feb",
  "product_code": "AL-10GB-30D-V1",
  "country": "e29258c3-…", "country_iso2": "AL", "country_name": "Albania",
  "plan_type": "fixed", "display_name": "Albania 10 GB — 30 Days",
  "data_limit_mb": 10000, "daily_high_speed_mb": null, "day_count": null,
  "validity_days": 30, "topup_supported": true, "hotspot_supported": null,
  "network_names": ["One Albania 5G"],
  "retail_amount_minor": 1699,
  "wholesale_amount_minor": 719,
  "margin_minor": 980,
  "currency": "USD", "status": "active", "badge": "popular", "tier": "A",
  "is_default_selected": true, "sort_order": 1,
  "supplier_verified_at": "2026-07-16T00:00:00Z",
  "created_at": "2026-07-22T20:58:14.007324Z"
}
```
> ⚠️ **`wholesale_amount_minor` and `margin_minor` are omitted entirely** for roles without
> `platform.manage_pricing` (support, finance, read-only). Never assume the keys exist.

**Status is changed by action, not PATCH:**
```
POST /admin/plans/{id}/activate/     → status "active"   (this is what makes it sellable)
POST /admin/plans/{id}/pause/        → status "paused"
POST /admin/plans/{id}/draft/        → status "draft"
POST /admin/plans/bulk-status/       {"plan_ids": [...], "status": "active|paused|draft"}
```
- Bulk reports per-item outcomes: `{"updated": [...], "failed": [{id, error}], "status": ...}`
- **Retired plans cannot be changed** → `409 plan_not_activatable`. Re-import instead.

`PATCH /admin/plans/{id}/` — editable: `retail_amount_minor`, `badge`, `tier`, `sort_order`,
`is_default_selected`. Product facts (`product_code`, allowances, `validity_days`) are
read-only. **Changing a price requires `platform.manage_pricing`** — support gets `403`.
Only one plan per country may be `is_default_selected`.

### 3.16 Top-up products & import

```
GET   /admin/topup-products/           ?status=
PATCH /admin/topup-products/{id}/      { retail_amount_minor, status }
POST  /admin/catalog/import/           → {"countries": 68, "plans": 385, "active_plans": 8}
```
Import re-syncs from the supplier workbook and **never activates anything** — expect
`active_plans` to stay as it was.

---

## 4. Travel agency API — `/api/v1/agency/{organization_id}/`

Every path is tenant-scoped. The `organization_id` comes from the user's memberships —
call the storefront's `GET /api/v1/organizations/` to list them.

### 4.1 Dashboard
`GET /agency/{id}/dashboard/`
```json
{
  "currency": "USD",
  "attributed_sales": { "order_count": 1, "total_minor": 3398 },
  "commissions": {
    "earned_minor": 679, "reversed_minor": 0,
    "outstanding_minor": 679, "paid_minor": 0
  },
  "payouts": { "paid_out_minor": 0, "payout_count": 0 }
}
```
No `margin` key — ever.

### 4.2 Sales — **note what is missing**
`GET /agency/{id}/sales/` (paginated)
```json
{
  "id": "7a38968d-392c-4335-8995-168d2916e831",
  "order_number": "ESF-CEFBC29ACDF2",
  "currency": "USD",
  "total_minor": 3398,
  "status": "fulfilled",
  "payment_status": "paid",
  "placed_at": "2026-07-28T17:56:40.282208Z",
  "promo_code_snapshot": "SUNRISE20",
  "commission_minor": 679,
  "commission_status": "pending"
}
```
There is **no `customer_email`, no items, no eSIM data**. This is the core privacy rule, not
an oversight.

### 4.3 Commissions & payouts
`GET /agency/{id}/commissions/` — `?status=`
```json
{
  "id": "3b58b1e7-866a-4ab8-8061-e8f593831ece",
  "order_number": "ESF-CEFBC29ACDF2",
  "commission_type": "percentage_bps",
  "commission_value_snapshot": 2000,
  "commissionable_minor": 3398,
  "commission_minor": 679,
  "reversed_minor": 0,
  "net_minor": 679,
  "currency": "USD",
  "status": "pending",
  "approved_at": null, "paid_at": null,
  "created_at": "2026-07-28T17:56:40.300224Z"
}
```
Statuses: `pending → available → approved → paid`, plus `reversed`/`cancelled`.
Show **`net_minor`** (= `commission_minor − reversed_minor`) as the headline figure.
`GET /agency/{id}/payouts/` lists settlements.

### 4.4 Profile
`GET|PATCH /agency/{id}/profile/`
```json
{
  "id": "5942e8ab-0738-490e-a37c-b266305b32bd",
  "name": "Sunrise Travel",
  "organization_type": "travel_agency",
  "status": "active",
  "billing_email": "ops@sunrise.com",
  "support_email": "help@sunrise.com",
  "country": "AE",
  "default_commission_type": null,
  "default_commission_value": null,
  "commission_currency": null,
  "created_at": "2026-07-28T17:56:40.110907Z"
}
```
Editable: `name`, `billing_email`, `support_email`, `country` — and only with the
`manage_profile` capability (owner/admin). **Commission fields and `status` are read-only**;
render them as disabled text, and expect writes to be ignored.

### 4.5 Staff, codes, reports, activity
```
GET    /agency/{id}/members/            POST {"email","role"}
PATCH  /agency/{id}/members/{mid}/      {"role"} / {"status"}
DELETE /agency/{id}/members/{mid}/
GET    /agency/{id}/tracking-codes/     ← read-only; only the platform issues codes
GET    /agency/{id}/reports/revenue/    → {"series":[…]}
GET    /agency/{id}/activity/           ← this agency's audit events only
```
An agency user may only grant roles **strictly below their own** — an `admin` cannot create
an `owner` (`403`). The last active owner cannot be demoted, disabled or removed
(`409 last_owner_protected`).

---

## 5. Role → capability matrix

### Platform roles (Django groups; `is_superuser` implies everything)
| Capability | superuser | platform_admin | support_admin | finance_admin | readonly_admin |
|---|:-:|:-:|:-:|:-:|:-:|
| view dashboard / orders / customers / eSIMs / ops / audit / reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| manage agencies, members, tracking codes | ✅ | ✅ | ❌ | ❌ | ❌ |
| manage orders (cancel etc.) | ✅ | ✅ | ✅ | ❌ | ❌ |
| **execute refunds** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **reveal eSIM credentials** | ✅ | ✅ | ✅ | ❌ | ❌ |
| manage catalogue / pricing (→ sees `margin`) | ✅ | ✅ | ❌ | ❌ | ❌ |
| manage roles / settings | ✅ | ❌ | ❌ | ❌ | ❌ |

> ⚠️ **`is_staff` alone grants nothing here.** It only opens Django admin. Platform API
> access requires membership of one of the groups above.

### Agency roles
| Capability | owner | admin | buyer | viewer |
|---|:-:|:-:|:-:|:-:|
| dashboard, sales, commissions, payouts, reports, tracking codes | ✅ | ✅ | ✅ | ✅ |
| manage profile | ✅ | ✅ | ❌ | ❌ |
| manage staff | ✅ | ✅ | ❌ | ❌ |
| view activity log | ✅ | ✅ | ❌ | ❌ |
| **edit commission rate / execute refunds** | ❌ | ❌ | ❌ | ❌ |

*(`buyer` exists for a future agency-purchasing flow that is currently out of scope; today
it behaves like `viewer` plus nothing.)*

---

## 6. Errors and limits

Same envelope as the storefront: `{"error": {"code", "message", "fields"}}`.

| Code | HTTP | When |
|---|---|---|
| `validation_error` | 400 | bad input — inspect `fields` |
| `permission_denied` | 403 | role lacks the capability |
| `not_found` | 404 | missing **or another tenant's** |
| `invalid_status_transition` | 409 | illegal organization lifecycle move |
| `last_owner_protected` | 409 | would leave the agency ownerless |
| `refund_limit_exceeded` | 409 | over the refundable balance |
| `conflict` | 409 | wrong state (e.g. retrying a succeeded job) |
| `rate_limited` | 429 | see below |

| Scope | Limit |
|---|---|
| admin endpoints | 60/min |
| agency endpoints | 120/min |
| credential reveal | **10/hour** |
| exports | 5/hour |

---

## 7. What is not built

Deliberately out of scope for the confirmed model: agency order creation, agency customer
management, agency-visible eSIM credentials, agency pricing/markup, agency-initiated
refunds. Not yet built: support tickets, CSV exports, platform settings UI, MFA.

Still stubbed backend-wide: Stripe and the eSIM supplier run on fakes, and email prints to
the console — see [`API.md`](./API.md) §10. The admin API contract does not change when
real credentials land.
