# Admin Panels — Backend Implementation Plan

**Scope:** two separate administration systems on the existing eSIMFlys Django backend —
(1) a **Superuser/Platform Admin Panel**, (2) a **Travel Agency Admin Panel** with strict
multi-tenant isolation.

**Status of this document:** analysis + implementation plan. **No application code was modified
to produce it.**

**Legend**
`VERIFIED` observed directly in the repository · `MISSING` does not exist ·
`SECURITY RISK` exploitable or dangerous today · `MIGRATION REQUIRED` schema change ·
`UNVERIFIED` could not be confirmed from the repo alone

---

## 0. Requirements update (CONFIRMED — supersedes earlier assumptions)

The product owner has confirmed the agency model. This section overrides anything below it
that conflicts.

| Decision | Consequence |
|---|---|
| The platform issues a **referral tracking code** to each agency; the agency passes it to customers. | Codes are attribution-only. |
| **The customer pays full price — the code carries no discount.** | `discount_minor = 0`, so `commissionable = subtotal`. |
| **The customer buys on the public website**, entering the code at checkout. | Agencies do **not** place orders. |
| Agency commission = **20% of the amount billed** (`2000` bps). | `DEFAULT_COMMISSION_BPS = 2000`. |
| The agency panel is **reporting-only**; the superuser sees all purchases. | Large scope reduction. |

**Scope changes**

- **Phase C3 is CANCELLED** — no agency order creation, no `AgencyCustomer` book, and
  `Order.buyer_organization` / `Cart.organization` stay unused. §5.7 is therefore *not* a
  gap to close; it is out of scope.
- **§5.5 is resolved by design.** With no customer-facing discount there is no discount for
  an agency to manipulate. The commission rate remains platform-controlled.
- **All agency orders are referral orders**, so §8.2's referral rules apply universally:
  the agency sees **commission and order value only — never customer PII and never eSIM
  credentials**. (Chosen as the safe default; masked identity can be added later, whereas a
  harvested customer list cannot be recalled.)
- `RefundRequest` (§11, §7.8) is **deferred** — the customer's relationship is with the
  platform, so refunds are requested from the platform directly.
- Agency features reduce to: dashboard, profile, staff, commissions, payouts, reports,
  tracking-code visibility, support, activity log.

**Already implemented** (see §23 phase A): `PromoCode.kind` (`discount` | `tracking`) with
DB constraints forcing tracking codes to zero discount and to belong to an organization,
plus `apps.accounts.services.create_agency_tracking_code()`.

---

## 1. Executive summary

The backend is a **modular Django 5.2 monolith** (`apps/{common,accounts,catalog,orders,payments,esims}`)
with 23 business tables, DRF endpoints under `/api/v1/`, session auth, a durable job worker, and
81+ passing tests. The commercial core (catalogue → cart → checkout → payment → provisioning →
commission → refund) is complete and tested.

**The critical finding for this project: the multi-tenant foundation is declared but not enforced.**

- `Organization` and `OrganizationMember` exist, and `MEMBER_ROLES = ("owner","admin","buyer","viewer")`
  is defined at `apps/accounts/models.py:59` — but **no code anywhere reads `role`**. `VERIFIED`
  A `viewer` currently has identical authority to an `owner`. `SECURITY RISK`
- `Order.buyer_organization` (`apps/orders/models.py:197`) and `Cart.organization` exist but are
  **never assigned by any service**. Agency-on-behalf-of purchasing does not exist. `VERIFIED` `MISSING`
- There are **zero staff-gated API endpoints**. No `IsAdminUser`, no `DjangoModelPermissions`
  anywhere in `apps/`. `VERIFIED` The only administrative surface is Django Admin.
- There is **no audit log model of any kind**. `VERIFIED` `MISSING`

Consequently both panels are essentially greenfield at the API layer, but they sit on a strong,
correct data model. The bulk of the work is **authorisation, tenancy, and admin APIs**, not
re-modelling the commerce domain.

**Headline recommendation.** Build a dedicated **`apps/administration`** app exposing two namespaced
DRF APIs — `/api/v1/admin/**` (platform) and `/api/v1/agency/**` (tenant) — sharing one permission
and audit framework. Retain Django Admin as **break-glass internal tooling for superusers only**;
never expose it to agencies (it has no row-level tenancy and would leak every tenant's data).

**Most important design decision in this document (§8.2).** The schema already encodes *two
different* agency↔order relationships, and they must **not** grant the same visibility:

| Relationship | Meaning | Agency may see |
|---|---|---|
| `Order.referring_organization` | a retail customer used the agency's coupon | commission + order value only — **no customer PII, no eSIM credentials** |
| `Order.buyer_organization` | the agency purchased on behalf of a customer | full order, customer, and eSIM detail |

Conflating these would leak the platform's retail customers to any agency holding a coupon.
This is the single highest-value isolation rule in the plan.

---

## 2. Current backend architecture `VERIFIED`

```
backend/
├── config/            settings.py · urls.py · wsgi.py · asgi.py
├── apps/
│   ├── common/        base models, error envelope, pagination, encryption, health,
│   │                  reset services + reset_full / reset_readonly commands
│   ├── accounts/      User, Organization, OrganizationMember, PartnerCommission,
│   │                  CommissionPayout · auth views · allauth adapter
│   ├── catalog/       Country, Supplier, CatalogPlan, TopupProduct · import_catalog,
│   │                  activate_demo_catalog commands · public read API
│   ├── orders/        Cart, CartItem, PromoCode, Order, PromoRedemption, OrderItem,
│   │                  Notification · checkout service · notifications service
│   ├── payments/      Payment, WebhookEvent, Refund, RefundItem · stripe gateway
│   └── esims/         EsimProfile, SupplierEvent, TopupFulfillment · supplier gateway
│                      · process_jobs worker
└── templates/emails/  4 templates
```

**Layering (enforced by convention):** thin views → serializers validate → **services own state
changes** → models own invariants. External providers sit behind swappable gateways
(`apps/payments/stripe.py`, `apps/esims/supplier.py`) selected by `settings.PAYMENTS_GATEWAY` /
`SUPPLIER_GATEWAY`, defaulting to `"fake"` when credentials are absent.

**Request pipeline:** `SecurityMiddleware → CorsMiddleware → Session → Common → Csrf → Auth →
Message → XFrame → allauth.AccountMiddleware`.

**Background work:** durable rows in `supplier_events` and `notifications`, claimed with
`SELECT FOR UPDATE SKIP LOCKED` by `manage.py process_jobs`. Exponential backoff, max 5 attempts,
then `manual_review`.

**Integrations today:** Stripe (fake gateway), eSIM Access (fake gateway), email (console backend),
Google OAuth via `django-allauth` (real credentials, classic redirect flow).

---

## 3. Complete model and database inventory `VERIFIED`

All 23 business tables. UUID PKs, `created_at`/`updated_at` on every row (plus a Postgres
`set_updated_at` trigger applied to all 23 tables by `payments/migrations/0004`), money as
`BIGINT` minor units, emails as `citext`.

### 3.1 `accounts`

**`users`** — custom email-only user (`USERNAME_FIELD="email"`, **no username field**).
`password, last_login, is_superuser, id(PK), created_at, updated_at, email(UQ,citext), first_name,
last_name, preferred_currency, email_verified_at, is_active, is_staff, date_joined, deleted_at`
+ M2M `groups`, `user_permissions`.
Note: `deleted_at` exists but **no soft-delete manager filters on it** — it is inert. `MISSING`

**`organizations`** — `id, name, organization_type, billing_email(citext), status(default 'pending'),
default_commission_type, default_commission_value, commission_currency, metadata(JSONB)`.
Constraints: `organization_type_valid`, `organization_commission_type_valid`.
Types: `travel_agency | business | affiliate` (`models.py:57`). Statuses are **unconstrained free
text** — no CheckConstraint. `SECURITY RISK` (see §5.4)

**`organization_members`** — `id, organization(FK CASCADE), user(FK CASCADE), role, status`.
`UNIQUE(organization,user)`; roles `owner|admin|buyer|viewer`; statuses `invited|active|disabled`.

**`commission_payouts`** — `organization(FK PROTECT), currency, amount_minor, status,
period_start, period_end, payment_method, external_reference, paid_at`.
Statuses `draft|approved|processing|paid|failed|cancelled`.

**`partner_commissions`** — `organization(PROTECT), order(PROTECT), promo_code(PROTECT,null),
payout(PROTECT,null), commission_type, commission_value_snapshot, commissionable_minor,
commission_minor, reversed_minor, currency, status, available_at, approved_at, paid_at`.
`UNIQUE(organization,order)`; `0 <= reversed_minor <= commission_minor`.

### 3.2 `catalog`

**`countries`** — `iso2(UQ), name, slug(UQ), region, flag_emoji, timezone, is_popular,
homepage_badge, is_active, sort_order`. 2 indexes; 3 check constraints.

**`suppliers`** — `code(UQ), name, status, api_base_url, support_email, metadata`.
Credentials are **environment secrets, never columns** — correct.

**`catalog_plans`** — 24 columns incl. `product_code(UQ)`, `supplier(PROTECT)`, `country(PROTECT)`,
`plan_type`, `data_limit_mb`, `daily_high_speed_mb`, `validity_days`, `retail_amount_minor`,
**`wholesale_amount_minor`**, `status`, `badge`, `tier`, `is_default_selected`, `sort_order`,
`supplier_verified_at`, `supplier_metadata`. 8 check constraints + partial unique
`one_default_plan_per_country`; 3 indexes.

**`topup_products`** — `supplier(PROTECT)`, `base_plan(SET_NULL)`, `product_code(UQ)`,
`data_amount_mb`, `validity_days`, `retail_amount_minor`, `wholesale_amount_minor`, `status`.

### 3.3 `orders`

**`carts`** — `user(SET_NULL)`, `organization(SET_NULL)`, `guest_token_hash(UQ,bytea)`, `currency`,
`status`, `expires_at`. Constraints: user XOR guest; org requires user; one active cart per
user+currency.

**`cart_items`** — `cart(CASCADE)`, `item_type`, `catalog_plan(PROTECT)`, `topup_product(PROTECT)`,
`target_esim_profile(PROTECT)`, `quantity`. 4 checks + `unique_plan_per_cart`.

**`promo_codes`** — `code(UQ,citext)`, `organization(PROTECT,null)`, `discount_type`,
`discount_value`, `discount_currency`, `maximum_discount_minor`, `minimum_order_minor`,
**`commission_type`, `commission_value`, `commission_currency`**, `usage_limit`,
`per_customer_limit`, `starts_at`, `ends_at`, `is_active`. 7 check constraints.

**`orders`** — `order_number(UQ)`, `user(SET_NULL)`, **`buyer_organization(SET_NULL)`**,
**`referring_organization(PROTECT)`**, `promo_code(PROTECT)`, `promo_code_snapshot`,
`customer_email(citext)`, `currency`, `subtotal_minor`, `discount_minor`, `tax_minor`,
`total_minor`, `status`, `payment_status`, `fulfillment_status`, `placed_at`, `metadata`.
9 check constraints incl. `order_total_balances`; 2 indexes.

**`promo_redemptions`** — `promo_code(PROTECT)`, `order(O2O PROTECT)`, `user(SET_NULL)`,
`customer_email_hash(bytea)`, `status`, `reserved_at`, `consumed_at`, `released_at`.

**`order_items`** — immutable snapshot: `order(PROTECT)`, `catalog_plan(PROTECT)`,
`topup_product(PROTECT)`, `supplier(PROTECT)`, `item_type`, `product_code`,
`supplier_package_code`, `product_name`, `country_iso2/name`, `plan_type`, `data_limit_mb`,
`daily_high_speed_mb`, `validity_days`, `traffic_policy`, `network_names`, `unit_amount_minor`,
**`wholesale_amount_minor`**, `currency`, `status`. **No quantity column** — one row per eSIM.

**`notifications`** — `user(SET_NULL)`, `order(PROTECT)`, `esim_profile(PROTECT)`, `channel`,
`recipient`, `template_code`, `idempotency_key(UQ)`, `provider_message_id`, `status`,
`attempt_count`, `next_attempt_at`, `failure_message`, `sent_at`, `delivered_at`.

### 3.4 `payments`

**`payments`** — `order(PROTECT)`, `provider`, `provider_payment_id`,
`provider_checkout_session_id`, `idempotency_key(UQ)`, `amount_minor`, `currency`, `status`,
`failure_code/message`, `paid_at`. 2 partial unique constraints.

**`webhook_events`** — `provider`, `external_event_id`, `event_type`, `payload_redacted`,
`signature_valid`, `status`, `attempt_count`, `next_attempt_at`, `last_error`, `received_at`,
`processed_at`. `UNIQUE(provider, external_event_id)` = the idempotency ledger.

**`refunds`** — `payment(PROTECT)`, `provider_refund_id`, `idempotency_key(UQ)`, `amount_minor`,
`currency`, `reason`, `status`, `completed_at`.

**`refund_items`** — `refund(PROTECT)`, `order_item(PROTECT)`, `amount_minor`,
`UNIQUE(refund, order_item)`.

### 3.5 `esims`

**`esim_profiles`** — `order_item(O2O PROTECT)`, `supplier(PROTECT)`, `supplier_reference`,
`status`, **`iccid_encrypted`, `iccid_hash(UQ)`, `iccid_last4`, `smdp_address_encrypted`,
`activation_code_encrypted`, `qr_payload_encrypted`, `encryption_key_version`**,
`total_data_bytes`, `remaining_data_bytes`, `installed_at`, `activated_at`, `expires_at`,
`last_synced_at`, `supplier_payload_redacted`.

**`supplier_events`** — durable job queue + audit: `supplier(PROTECT)`, `order_item(PROTECT)`,
`esim_profile(PROTECT)`, `event_type`, `idempotency_key(UQ)`, `correlation_id`, `status`,
`attempt_count`, `next_attempt_at`, `locked_at`, `request_data_redacted`,
`response_data_redacted`, `error_code/message`, `completed_at`.

**`topup_fulfillments`** — `order_item(O2O PROTECT)`, `esim_profile(PROTECT)`,
`topup_product(PROTECT)`, `supplier_reference`, `status`, `completed_at`.

### 3.6 Ownership graph (how a row is attributed to a tenant) `VERIFIED`

```
EsimProfile → order_item → order → { user | buyer_organization | referring_organization }
Payment/Refund → order → …
PartnerCommission → organization (direct)
CommissionPayout → organization (direct)
PromoCode → organization (direct, nullable)
```
**Only `PartnerCommission`, `CommissionPayout` and `PromoCode` carry a direct tenant FK.**
Everything else requires a 2–3 hop join through `Order`. This is the central performance and
correctness constraint for tenant scoping (§8.4).

---

## 4. Existing authentication and permission system `VERIFIED`

- **Session auth** (`django.contrib.sessions`, DB-backed), `SESSION_COOKIE_HTTPONLY=True`,
  `SameSite=Lax`, `Secure` when not DEBUG. DRF default
  `DEFAULT_AUTHENTICATION_CLASSES=[SessionAuthentication]`,
  `DEFAULT_PERMISSION_CLASSES=[IsAuthenticated]`.
- **Backends:** `ModelBackend` + `allauth.account.auth_backends.AuthenticationBackend`.
- **Google OAuth:** classic allauth at `/accounts/google/login/`; custom
  `apps/accounts/adapters.py::SocialAccountAdapter.pre_social_login` links to an existing account
  **only when the provider email is verified**.
- **Endpoints (26 total).** Public/`AllowAny`: all catalogue, all cart, checkout, payment-intent,
  stripe webhook, order lookup, csrf/register/login/password-reset. `IsAuthenticated`: logout,
  `account/me`, orders list/detail, all `esims/*`, all `organizations/*`.
- **The only object-level permission in the codebase** is
  `apps/esims/permissions.py::IsEsimOwner` (7 lines): `obj.order_item.order.user_id == user.id`.
- **Tenant scoping today** is `apps/accounts/views.py:139 _member_orgs(user)` —
  `Organization.objects.filter(members__user=user, members__status="active")`. Used by the four
  `organizations/*` endpoints. **It is role-blind.**
- **Throttles:** scopes `auth`(10/min), `checkout`(30), `payment`(30), `promo`(30), `usage`(20)
  via `ScopedRateThrottle`, cache = **LocMemCache** (per-process).
- **Django Admin:** 15 ModelAdmins registered across the apps; one custom action
  (`approve_commissions`). Gated only by `is_staff`.

---

## 5. Current gaps and risks

### 5.1 `SECURITY RISK` — unthrottled guest lookup returns decrypted eSIM secrets
`apps/orders/views.py:165 OrderLookupView` is `AllowAny`, **declares no `throttle_scope`**
(confirmed: the only scopes are auth/checkout/payment/promo/usage), and returns
`decrypt_credentials(profile)` — full ICCID, SM-DP+ address, activation code and QR payload — for
any `{order_number, email}` pair. `order_number` is `"ESF-"+uuid4().hex[:12].upper()`
(`apps/orders/services.py:277`, ~48 bits) so blind guessing is impractical, **but** an attacker
who learns an order number (support email, screenshot, referrer leak) needs only the customer's
email address — which is frequently known. There is no rate limit, no lockout, and no audit entry.
**Fix: add a `lookup` throttle scope, add audit logging, and consider returning credentials only
after an emailed one-time link.**

### 5.2 `SECURITY RISK` — roles are decorative
`MEMBER_ROLES` (`apps/accounts/models.py:59`) is enforced only by a DB CheckConstraint on the
*value*. No view, serializer, service or permission class reads `role`. Any agency endpoint added
without a role framework grants `viewer` the same power as `owner`.

### 5.3 `SECURITY RISK` — no audit trail
No audit model exists. Refunds, commission approval, payouts, plan activation and price changes
are all mutations of financial state with **no record of actor, time, before/after, or IP**.
Django Admin's `LogEntry` covers only admin-UI changes and stores no field-level diff.

### 5.4 `SECURITY RISK` — `organizations.status` is unconstrained and unenforced
`status` defaults to `'pending'` with **no CheckConstraint** and **no code path that checks it**.
A `pending` or suspended agency's coupons still work and still accrue commission
(`apps/accounts/services.py:7 create_commission_for_order` checks only that
`referring_organization` and `promo_code` exist). Suspension is therefore not enforceable today.

### 5.5 `SECURITY RISK` — agency-created promo codes could set their own commission
`PromoCode.commission_value` lives on the same row an agency would create. Any agency endpoint
that lets an agency create/edit its own promo code without server-side clamping is a direct
financial privilege escalation.

### 5.6 `SECURITY RISK` — wholesale cost is one serializer field from exposure
`catalog_plans.wholesale_amount_minor` and `order_items.wholesale_amount_minor` are the platform's
margin. Public serializers correctly omit them today, but an admin/agency serializer built with
`fields = "__all__"` would leak them to agencies. **Agency serializers must be allowlist-only.**

### 5.7 `MISSING` — no agency purchasing path
`Order.buyer_organization` is referenced **only** at its own definition (`apps/orders/models.py:197`);
`Cart.organization` is never assigned. An agency cannot buy on behalf of a customer.
`apps/orders/services.py::checkout()` accepts no organization argument.

### 5.8 `MISSING` — no agency customer book
Agencies have no concept of "my customers". Retail orders have `user` or a guest `customer_email`;
there is no model linking a traveller to an agency.

### 5.9 `MISSING` — no refund API, no admin API
`create_refund` (`apps/payments/services.py:214`) is called only from tests. Refunds are executable
only from a Django shell. No `IsAdminUser` endpoint exists anywhere.

### 5.10 `MISSING` — no platform admin role tiers
Only `is_staff` / `is_superuser`. No support-admin, finance-admin, or read-only platform role.

### 5.11 Operational / scalability
- Throttle cache is **LocMemCache** → per-process counters; with N gunicorn workers the effective
  limit is N×. Needs Redis/DB cache before launch. `SECURITY RISK` (weakens brute-force defence)
- Tenant queries must join `order_items → orders`; without a denormalised tenant column or covering
  indexes, agency dashboards will table-scan as volume grows (§10.4).
- `users.deleted_at` exists but nothing filters it — soft delete is not implemented.
- No `select_related` on the admin list views that will need it.

### 5.12 Contradiction check
The spec (`esim_backend_design.md` §9) states *"Commission approval and payout creation are
staff-only Django Admin operations at launch"* and lists a dedicated agency portal as **excluded**.
This plan **intentionally supersedes** that decision by introducing agency-facing write APIs.
That is a deliberate scope expansion, and §18 re-imposes the safety properties the spec relied on
(server-side commission calculation, immutable snapshots, no agency mutation of commission values).

---

## 6. Superuser admin panel requirements

**Delivery decision.** Expose `/api/v1/admin/**`, `IsPlatformAdmin`-gated, in a new
`apps/administration` app. Keep Django Admin for superuser break-glass only.

For every feature below: **all writes go through a service function**, every state-changing call
emits an `AuditEvent` (§17), and all list endpoints support pagination + filtering.

| # | Feature | Backend logic | Models/fields | Endpoints | Permission | Notes |
|---|---|---|---|---|---|---|
| 6.1 | **Dashboard** | aggregate GMV, orders, active eSIMs, failed jobs, pending commissions, MRR-style trend | none new (read) | `GET /admin/dashboard/` | `platform.view_dashboard` | cache 60s; must not compute unbounded scans |
| 6.2 | **Agency management** | list/create/update orgs | `Organization` + new `status` constraint, `slug`, `approved_at/by` | `GET,POST /admin/organizations/`, `GET,PATCH /admin/organizations/{id}/` | `platform.manage_agency` | |
| 6.3 | **Approve / suspend / activate** | transition service enforcing legal transitions | `Organization.status` + `AuditEvent` | `POST /admin/organizations/{id}/{approve,suspend,activate}/` | `platform.manage_agency` | suspension **must** block coupon accrual (§5.4) |
| 6.4 | **Agency staff mgmt** | invite/disable members on behalf of an agency | `OrganizationMember`, `AgencyInvitation` (new) | `GET,POST /admin/organizations/{id}/members/`, `DELETE .../members/{id}/` | `platform.manage_agency` | |
| 6.5 | **Customer management** | search users + guest orders by email | `User` (+ soft delete) | `GET /admin/customers/`, `GET /admin/customers/{id}/` | `platform.view_customer` | PII access is audited |
| 6.6 | **Order management** | full order search; cancel; resend notification | `Order` | `GET /admin/orders/`, `GET /admin/orders/{id}/`, `POST /admin/orders/{id}/cancel/` | `platform.view_order` / `platform.manage_order` | |
| 6.7 | **Payments & refunds** | **expose the existing `create_refund` service** | `Payment`, `Refund`, `RefundItem` | `GET /admin/payments/`, `POST /admin/orders/{id}/refunds/`, `GET /admin/refunds/` | `platform.manage_refund` (finance) | closes §5.9; per-item allocations required |
| 6.8 | **eSIM management** | view profile, force usage refresh, re-provision, reveal credentials | `EsimProfile` | `GET /admin/esims/`, `POST /admin/esims/{id}/refresh-usage/`, `POST /admin/esims/{id}/reprovision/`, `POST /admin/esims/{id}/reveal/` | `platform.view_esim` / `platform.reveal_credentials` | **reveal is a separate permission and always audited** |
| 6.9 | **Supplier monitoring** | job queue health, retry, manual-review queue | `SupplierEvent`, `Supplier` | `GET /admin/supplier-events/`, `POST /admin/supplier-events/{id}/retry/`, `GET /admin/suppliers/` | `platform.view_ops` | retry must reuse the original idempotency key |
| 6.10 | **Top-up management** | CRUD + activate | `TopupProduct` | `GET,POST /admin/topup-products/`, `PATCH .../{id}/` | `platform.manage_catalog` | |
| 6.11 | **Pricing & commission** | edit retail price, set default agency commission | `CatalogPlan`, `Organization`, `PromoCode` | `PATCH /admin/plans/{id}/`, `PATCH /admin/organizations/{id}/commission/` | `platform.manage_pricing` | price changes audited with before/after |
| 6.12 | **Catalogue** | countries/plans CRUD, activate/pause, trigger import | `Country`, `CatalogPlan` | `GET,PATCH /admin/countries/`, `/admin/plans/`, `POST /admin/catalog/import/`, `POST /admin/plans/{id}/{activate,pause}/` | `platform.manage_catalog` | import runs as a background job, not inline |
| 6.13 | **Notifications** | view queue, retry, resend | `Notification` | `GET /admin/notifications/`, `POST /admin/notifications/{id}/retry/` | `platform.view_ops` | |
| 6.14 | **Support / disputes** | ticket CRUD, assign, reply, close | `SupportTicket`, `SupportMessage` (new) | `GET,POST /admin/support/tickets/`, `POST .../{id}/messages/` | `platform.manage_support` | |
| 6.15 | **Audit logs** | immutable, filterable | `AuditEvent` (new) | `GET /admin/audit-events/` | `platform.view_audit` | **read-only; no delete endpoint ever** |
| 6.16 | **Background jobs** | unified queue view over supplier events + notifications | existing | `GET /admin/jobs/` | `platform.view_ops` | |
| 6.17 | **Roles & permissions** | assign platform roles | `PlatformRole` / Django `Group` | `GET /admin/roles/`, `POST /admin/users/{id}/roles/` | `platform.manage_roles` (superuser only) | privilege-escalation guard (§18.6) |
| 6.18 | **Reports & exports** | revenue, margin, commission, agency performance; CSV | `ReportExport` (new) | `GET /admin/reports/{name}/`, `POST /admin/exports/` | `platform.view_reports` | async for large ranges |
| 6.19 | **System / integration settings** | non-secret runtime config | `PlatformSetting` (new) | `GET,PATCH /admin/settings/` | `platform.manage_settings` (superuser) | **secrets stay in env — never stored here** |
| 6.20 | **Error monitoring** | recent 5xx by correlation_id | `AuditEvent` / log store | `GET /admin/errors/` | `platform.view_ops` | `UNVERIFIED` — depends on chosen log sink |

---

## 7. Travel agency admin panel requirements

Namespace `/api/v1/agency/**`. **Every** endpoint resolves a tenant (§8.3) and every queryset is
tenant-filtered at the manager level (§8.4).

> ⚠️ **Superseded by §0.** The agency panel is **reporting-only**. Rows 7.4 (customers),
> 7.5 (order creation), 7.7 (payment visibility), 7.8 (refund requests), 7.9 (eSIM delivery),
> 7.10 (top-ups), 7.11 (usage) and 7.12 (pricing) are **CANCELLED** — agencies neither sell
> nor hold customer relationships. They are retained below only as a record of the original
> analysis. The live scope is rows 7.1, 7.2, 7.3, 7.13, 7.14, 7.16, 7.17, 7.18.

| # | Feature | Backend logic | DB changes | Endpoints | Roles | Isolation notes |
|---|---|---|---|---|---|---|
| 7.1 | **Dashboard** | sales, commission earned/pending/paid, active eSIMs | none | `GET /agency/dashboard/` | all | referral vs buyer split shown separately |
| 7.2 | **Profile & settings** | view/update name, billing email, logo | `Organization` + `logo_url`, `support_email`, `settings` JSONB | `GET,PATCH /agency/profile/` | owner, admin | **commission fields read-only** (§5.5) |
| 7.3 | **Staff & roles** | invite, change role, disable | `AgencyInvitation` (new), `OrganizationMember` | `GET,POST /agency/members/`, `PATCH,DELETE /agency/members/{id}/` | owner, admin | cannot grant a role above own; cannot remove last owner |
| 7.4 | **Customers** | agency's own customer book | `AgencyCustomer` (new) | `GET,POST /agency/customers/`, `GET,PATCH /agency/customers/{id}/` | owner, admin, buyer | scoped by `organization_id` |
| 7.5 | **Order creation** | agency buys on behalf of a customer | `Order.buyer_organization` **now populated**; `Cart.organization` | `POST /agency/orders/` | owner, admin, buyer | server prices from DB; agency cannot set price |
| 7.6 | **Order management** | list/detail | `Order` | `GET /agency/orders/`, `GET /agency/orders/{id}/` | all | **buyer orders only in detail**; referral orders appear in reports as anonymised aggregates |
| 7.7 | **Payment visibility** | payment status of own orders | `Payment` | `GET /agency/orders/{id}/payments/` | owner, admin | no provider IDs exposed |
| 7.8 | **Refund requests** | request → platform approves | `RefundRequest` (new) | `POST /agency/orders/{id}/refund-requests/`, `GET /agency/refund-requests/` | owner, admin | **agency may never execute a refund** |
| 7.9 | **eSIM delivery** | view + resend delivery email | `EsimProfile` | `GET /agency/esims/`, `GET /agency/esims/{id}/`, `POST /agency/esims/{id}/resend/` | owner, admin, buyer | credentials only for `buyer_organization` orders |
| 7.10 | **Top-ups** | buy top-up for an owned eSIM | existing top-up flow + tenant check | `GET,POST /agency/esims/{id}/topups/` | owner, admin, buyer | target profile must belong to the agency |
| 7.11 | **Usage monitoring** | remaining data per eSIM | `EsimProfile` | `GET /agency/esims/{id}/usage/` | all | throttled (supplier calls cost money) |
| 7.12 | **Pricing / mark-up** | agency resale markup | `AgencyPricingRule` (new) | `GET,POST,PATCH /agency/pricing-rules/` | owner | **display/quote only at launch** — must not alter platform settlement (§16.4) |
| 7.13 | **Commission & revenue reports** | earned, reversed, paid, per period | `PartnerCommission`, `CommissionPayout` | `GET /agency/commissions/`, `GET /agency/payouts/`, `GET /agency/reports/revenue/` | owner, admin, viewer | read-only always |
| 7.14 | **Promo codes** | view own codes + usage stats | `PromoCode` | `GET /agency/promo-codes/` | owner, admin | **read-only at launch** (§5.5); creation requires platform approval |
| 7.15 | **Customer communication** | resend order/eSIM emails | `Notification` | `POST /agency/orders/{id}/resend-email/` | owner, admin | rate-limited; templated only — no free-text send |
| 7.16 | **Reports & exports** | CSV of own data | `ReportExport` (tenant-scoped) | `POST /agency/exports/`, `GET /agency/exports/{id}/` | owner, admin | export rows re-filtered at generation time |
| 7.17 | **Support requests** | raise ticket to platform | `SupportTicket` | `GET,POST /agency/support/tickets/` | all | |
| 7.18 | **Activity log** | own agency's audit events | `AuditEvent` filtered by tenant | `GET /agency/activity/` | owner, admin | **only `organization_id == tenant`** |

---

## 8. Multi-tenant architecture

### 8.1 Model
**Shared database, shared schema, row-level tenancy** keyed on `Organization`. Justified: single
Postgres, modest tenant count, existing FKs, and the operational simplicity the spec demands
(no microservices). Schema-per-tenant is rejected — it would fracture the catalogue and the
commission ledger.

### 8.2 The two agency↔order relationships (**critical**) `VERIFIED`

```
Order.referring_organization  → coupon attribution. The customer is the PLATFORM'S.
Order.buyer_organization      → agency purchased for its customer. Agency owns the relationship.
```

**Visibility rules — non-negotiable:**

| Data | referral order | buyer order |
|---|---|---|
| commission amount / order value | ✅ | ✅ |
| customer email, name | ❌ **never** | ✅ |
| eSIM credentials (ICCID/QR/activation) | ❌ **never** | ✅ |
| refund request | ❌ | ✅ |

Implement as two distinct querysets — `Order.objects.for_agency_buyer(org)` and
`Order.objects.for_agency_referral(org)` — never a single `Q(buyer=org) | Q(referring=org)` filter,
because a single filter inevitably gets reused by a detail serializer and leaks PII.

### 8.3 Tenant resolution
1. URL-scoped: `/api/v1/agency/{organization_id}/...` — explicit, cache-friendly, auditable, and
   supports users belonging to multiple agencies. **Recommended.**
2. Header/session-scoped active tenant — fewer URL params but adds hidden state.

Resolution middleware/mixin: load `OrganizationMember` for `(request.user, organization_id)`
with `status="active"`, attach `request.tenant` (Organization) and `request.membership`.
Deny (404, not 403 — do not confirm existence) when absent, when the org status is not `active`,
or when the user is inactive.

### 8.4 Enforcement (defence in depth — all four layers)
1. **Manager layer** — `TenantQuerySet.for_organization(org)` on every tenant model. Views must
   never hand-roll `filter(organization=...)`.
2. **Permission layer** — `IsAgencyMember` + `HasAgencyRole(*roles)` on every view.
3. **Object layer** — `has_object_permission` re-checks the tenant on every detail/mutation.
4. **Serializer layer** — allowlist fields only; never `fields = "__all__"` (§5.6).

Plus a **test-enforced invariant**: a cross-tenant test for every agency endpoint (§24.3).

### 8.5 Denormalisation for performance `MIGRATION REQUIRED`
Add a nullable `organization_id` to `EsimProfile` (and optionally `Payment`) mirroring
`order.buyer_organization`, maintained in the provisioning service, to avoid 3-table joins on
every agency eSIM list. Backfill in a data migration. Treat as a **cache of** the order's value —
the order remains the source of truth, and a reconciliation check belongs in the test suite.

---

## 9. Roles and permissions matrix

### 9.1 Platform roles (new — `MISSING` today)
| Role | Basis | Capabilities |
|---|---|---|
| `superuser` | `is_superuser` | everything incl. roles + settings |
| `platform_admin` | Group | all except role/settings management |
| `support_admin` | Group | customers, orders, eSIM view, resend, tickets. **No refunds, no pricing** |
| `finance_admin` | Group | payments, refunds, commissions, payouts, reports |
| `readonly_admin` | Group | read-only across the admin API |

### 9.2 Agency roles (exist as data at `apps/accounts/models.py:59`; enforcement `MISSING`)
| Capability | owner | admin | buyer | viewer |
|---|---|---|---|---|
| view dashboard / reports | ✅ | ✅ | ✅ | ✅ |
| view commissions & payouts | ✅ | ✅ | ✅ | ✅ |
| manage profile | ✅ | ✅ | ❌ | ❌ |
| manage staff | ✅ | ✅ | ❌ | ❌ |
| manage customers | ✅ | ✅ | ✅ | ❌ |
| create orders / top-ups | ✅ | ✅ | ✅ | ❌ |
| view eSIM credentials (buyer orders) | ✅ | ✅ | ✅ | ❌ |
| request refunds | ✅ | ✅ | ❌ | ❌ |
| manage pricing rules | ✅ | ❌ | ❌ | ❌ |
| **edit commission rates** | ❌ | ❌ | ❌ | ❌ (platform only) |
| **execute refunds** | ❌ | ❌ | ❌ | ❌ (platform only) |
| view own activity log | ✅ | ✅ | ❌ | ❌ |

Implement as a single declarative map (`apps/administration/roles.py`) consumed by
`HasAgencyRole` — not as scattered `if role ==` checks.

---

## 10. Required database changes

### 10.1 `MIGRATION REQUIRED` — constrain and extend `Organization`
```python
STATUS = ("pending", "active", "suspended", "rejected", "closed")
+ CheckConstraint(name="organization_status_valid", condition=Q(status__in=STATUS))
+ slug            SlugField(unique=True)      # stable public identifier
+ logo_url        URLField(null=True)
+ support_email   CIEmailField(null=True)
+ country         CharField(2, null=True)
+ approved_at     DateTimeField(null=True)
+ approved_by     FK(User, SET_NULL, null=True, related_name="approved_organizations")
+ suspended_at    DateTimeField(null=True)
+ suspension_reason TextField(null=True)
+ settings        JSONField(default=dict)
+ Index(fields=["status", "organization_type"])
```

### 10.2 `MIGRATION REQUIRED` — `OrganizationMember` lifecycle
```python
+ invited_by      FK(User, SET_NULL, null=True)
+ invited_at / accepted_at / disabled_at  DateTimeField(null=True)
+ last_active_at  DateTimeField(null=True)
+ Index(fields=["organization", "status"])
```

### 10.3 `MIGRATION REQUIRED` — enforce suspension in commission accrual
Not a schema change but a **required service change**: `create_commission_for_order`
(`apps/accounts/services.py:7`) must return `None` (and audit) when
`org.status != "active"`. Closes §5.4.

### 10.4 `MIGRATION REQUIRED` — tenant indexes
```python
Order:        Index(["buyer_organization", "status", "-placed_at"])
              Index(["referring_organization", "-placed_at"])
PartnerCommission: Index(["organization", "status", "-created_at"])
EsimProfile:  Index(["organization", "status"])          # after 8.5
Notification: Index(["order"])                            # agency resend lookups
```

### 10.5 `MIGRATION REQUIRED` — soft delete becomes real
Either implement a `SoftDeleteManager` that filters `deleted_at__isnull=True` **everywhere**, or
drop the column. A half-implemented soft delete is worse than none: today a "deleted" user can
still authenticate. `SECURITY RISK`

---

## 11. Proposed new models

All inherit `apps/common/models.py::BaseModel` (UUID PK + timestamps). New app: `apps/administration`
(cross-cutting: audit, support, settings, exports); agency-domain models live in `apps/accounts`.

**`AuditEvent`** (`audit_events`) — *append-only*
```
actor(FK User SET_NULL null) · actor_email(char 254)   # preserved if user deleted
actor_type(char: platform|agency|system|customer)
organization(FK Organization SET_NULL null)            # tenant scope for agency activity view
action(char 80)            # "refund.created", "organization.suspended"
object_type(char 80) · object_id(uuid null) · object_repr(char 240)
changes(JSONB)             # {field: [before, after]} — MUST be redacted (§17.3)
ip_address(GenericIPAddress null) · user_agent(text null)
correlation_id(uuid null) · created_at
Index(["organization","-created_at"]), Index(["action","-created_at"]),
Index(["object_type","object_id"])
```
No update/delete API. Retention policy per §18.9.

**`AgencyInvitation`** (`agency_invitations`)
```
organization(FK CASCADE) · email(citext) · role(char 20) · token_hash(bytea UQ)
invited_by(FK User SET_NULL) · status(pending|accepted|revoked|expired)
expires_at · accepted_at · accepted_user(FK User SET_NULL null)
UniqueConstraint(organization, email, condition=status="pending")
```
Store **only the hash** of the invite token (mirrors the guest-cart pattern already in `carts`).

**`AgencyCustomer`** (`agency_customers`)
```
organization(FK CASCADE) · user(FK User SET_NULL null)   # link if they register
email(citext) · first_name · last_name · phone(null) · country(2, null)
notes(text null) · metadata(JSONB) · created_by(FK User SET_NULL)
UniqueConstraint(organization, email)
Index(["organization","-created_at"])
```
Add `Order.agency_customer FK(SET_NULL, null)` to tie agency orders to the book.

**`RefundRequest`** (`refund_requests`)
```
organization(FK PROTECT) · order(FK PROTECT) · requested_by(FK User SET_NULL)
amount_minor(bigint) · currency(3) · reason(text)
status(pending|approved|rejected|completed|cancelled)
reviewed_by(FK User SET_NULL null) · reviewed_at · review_note(text null)
refund(FK payments.Refund SET_NULL null)      # set when executed by platform
Index(["organization","status"]), Index(["status","-created_at"])
```

**`SupportTicket`** / **`SupportMessage`** (`support_tickets`, `support_messages`)
```
Ticket: organization(FK SET_NULL null) · user(FK SET_NULL null) · order(FK SET_NULL null)
        subject · category · priority(low|normal|high|urgent)
        status(open|pending|resolved|closed) · assigned_to(FK User SET_NULL null)
        resolved_at · Index(["status","priority"]), Index(["organization","status"])
Message: ticket(FK CASCADE) · author(FK User SET_NULL) · body(text)
         is_internal(bool)      # internal notes never returned to agency/customer
         attachments(JSONB)
```

**`AgencyPricingRule`** (`agency_pricing_rules`)
```
organization(FK CASCADE) · scope(all|country|plan)
country(FK SET_NULL null) · catalog_plan(FK SET_NULL null)
markup_type(percentage_bps|fixed) · markup_value(bigint) · currency(3 null)
is_active(bool) · priority(int)
CheckConstraint: percentage markup <= a platform-configured ceiling
Index(["organization","is_active","priority"])
```

**`PlatformSetting`** (`platform_settings`) — `key(UQ)`, `value(JSONB)`, `description`,
`updated_by(FK SET_NULL)`. **Non-secret values only.**

**`ReportExport`** (`report_exports`) — `organization(null=platform-wide)`, `requested_by`,
`report_type`, `params(JSONB)`, `status`, `file_path`, `row_count`, `expires_at`.
Generated asynchronously by the existing worker; files expire.

---

## 12. Proposed model modifications

| Model | Change | Reason |
|---|---|---|
| `Organization` | fields + status constraint (§10.1) | approval/suspension lifecycle |
| `OrganizationMember` | invitation/lifecycle fields (§10.2) | staff management |
| `Order` | **populate** `buyer_organization`; add `agency_customer` FK, `source` (`web|agency|admin`) | agency purchasing + attribution |
| `Cart` | **populate** `organization` (constraint already exists) | agency cart |
| `EsimProfile` | denormalised `organization` FK (§8.5) | agency list performance |
| `User` | `phone`, `last_login_ip`, `mfa_enabled`; real soft delete (§10.5) | admin/security |
| `PromoCode` | `created_by`, `approved_by`, `approved_at` | agency codes need platform approval (§5.5) |
| `Refund` | `initiated_by` FK, `refund_request` FK | attribution + audit |
| `CatalogPlan` | *(optional)* `price_updated_at`, `price_updated_by` | pricing audit |

---

## 13. Required migrations (ordered)

1. `accounts/00XX_organization_lifecycle` — Organization fields + status CheckConstraint + index.
   **Data migration:** set existing rows to `active` before adding the constraint, else rows with
   legacy values fail. **Backward-compatible; deploy before the code that reads them.**
2. `accounts/00XX_organizationmember_lifecycle` — nullable fields + index.
3. `administration/0001_initial` — `AuditEvent`, `PlatformSetting`, `SupportTicket`,
   `SupportMessage`, `ReportExport`.
4. `accounts/00XX_agency_models` — `AgencyInvitation`, `AgencyCustomer`, `AgencyPricingRule`.
5. `orders/00XX_order_agency_fields` — `agency_customer`, `source`, tenant indexes.
6. `payments/00XX_refund_request` — `RefundRequest` + `Refund.initiated_by`.
7. `esims/00XX_esim_organization` — nullable `organization` FK + **backfill data migration** from
   `order_item.order.buyer_organization` + index.
8. `accounts/00XX_user_security_fields` — `phone`, `last_login_ip`, `mfa_enabled`.
9. **`payments/00XX_refresh_updated_at_triggers`** — re-run the idempotent DO-block from
   `payments/migrations/0004` so **all new tables receive the `set_updated_at` trigger**.
   ⚠️ Easy to forget; the trigger is attached per-table at migration time.

All must be additive/nullable so they can deploy ahead of application code (spec §20).

---

## 14. Required API endpoints (summary)

**Platform** `/api/v1/admin/` — dashboard · organizations (+approve/suspend/activate/members) ·
customers · orders (+cancel) · payments · refunds · esims (+refresh/reprovision/reveal) ·
supplier-events (+retry) · notifications (+retry) · countries · plans (+activate/pause) ·
topup-products · promo-codes (+approve) · commissions (+approve) · payouts (+create/mark-paid) ·
support/tickets · audit-events · reports · exports · settings · roles.

**Agency** `/api/v1/agency/{organization_id}/` — dashboard · profile · members (+invite) ·
invitations (+accept, public) · customers · orders (+create) · payments · refund-requests ·
esims (+resend/usage/topups) · pricing-rules · commissions · payouts · promo-codes ·
reports · exports · support/tickets · activity.

Conventions: reuse the existing `{"error":{code,message,fields}}` envelope
(`apps/common/exceptions.py`) and `DefaultPagination`; all list endpoints support
`?search=&ordering=&created_after=&created_before=&status=`.

---

## 15. Backend services and business logic

New service modules — **views must contain no business logic**:

- `apps/administration/services/audit.py` — `record_audit(actor, action, obj, changes, request)`;
  a `@audited` decorator for service functions; `diff_model(before, after)`.
- `apps/administration/services/organizations.py` — `approve/suspend/activate/reject`,
  each validating the transition and auditing.
- `apps/administration/services/refunds.py` — `request_refund` (agency),
  `approve_refund_request` → delegates to the **existing** `apps/payments/services.py:214
  create_refund`. Do not reimplement refund logic.
- `apps/accounts/services.py` (extend) — `invite_member`, `accept_invitation`, `change_role`,
  `disable_member`, with the "cannot remove last owner" and "cannot escalate above self" rules.
- `apps/orders/services.py` (extend) — `checkout(..., organization=None, agency_customer=None)`
  setting `buyer_organization`; **must not** alter existing signature semantics for retail.
- `apps/administration/services/reports.py` — aggregation with mandatory tenant filter argument.
- `apps/administration/services/exports.py` — async CSV generation via the existing worker.

---

## 16. Validation rules

1. Money remains **integer minor units**; no float arithmetic anywhere.
2. Agency **cannot set prices** — `create_order` reprices from `CatalogPlan` server-side (the
   existing checkout already does this; keep it).
3. Agency **cannot set commission values** — those serializer fields are read-only for agency
   scope, enforced server-side, not merely hidden in the UI.
4. `AgencyPricingRule` markup is capped by a platform setting and, at launch, is **display-only**;
   platform settlement always uses `CatalogPlan.retail_amount_minor`. Any future change to real
   agency-billed pricing must revisit commission maths in `apps/accounts/services.py:7`.
5. `RefundRequest.amount_minor` ≤ refundable balance, validated again at execution time
   (the existing `create_refund` already enforces per-item and per-payment ceilings).
6. Role changes: cannot assign a role higher than the actor's; cannot demote/remove the last
   active `owner`.
7. Invitations: single-use, expiring, hashed token, email-bound.
8. Org status transitions: `pending→{active,rejected}`, `active→suspended`, `suspended→active`,
   `*→closed`. Anything else rejected.
9. Suspended/pending organizations: no logins to agency scope, no new orders, **no commission
   accrual** (§10.3).
10. Every mutating admin/agency endpoint requires CSRF (session auth) and re-validates tenancy.

---

## 17. Audit logging requirements

**17.1 Must be audited:** all authentication events (login success/failure, password reset, MFA);
every org lifecycle transition; role/membership change; refund request/approval/execution;
commission approval, payout creation and marking paid; price and plan status changes; catalogue
import; **every credential reveal** (`/admin/esims/{id}/reveal/`, `/orders/lookup/`); data exports;
settings changes; impersonation (if ever added).

**17.2 Fields:** actor, actor_type, organization, action, object type/id/repr, before/after diff,
IP, user agent, correlation id, timestamp.

**17.3 `SECURITY RISK` — redaction is mandatory.** The `changes` diff must never contain ICCID,
activation code, QR payload, SM-DP+ address, password hashes, tokens, or raw provider payloads.
Reuse the existing redaction discipline (`apps/esims/services.py::_redact`,
`apps/payments/services.py::_redact`). A single naive `diff_model()` over `EsimProfile` would
write plaintext secrets into the audit table — audit the *action*, not the ciphertext fields.

**17.4 Immutability:** append-only; no update/delete API; DB-level revoke of UPDATE/DELETE on
`audit_events` for the application role is recommended.

**17.5 Tenant visibility:** agencies see only `organization_id == their tenant` **and** a
whitelisted subset of actions (never platform-internal ones).

---

## 18. Security requirements

1. **Default deny.** `apps/administration` views default to `IsPlatformAdmin` / `IsAgencyMember`;
   `AllowAny` must never appear in these namespaces.
2. **Object-level checks on every detail/mutation** — membership in the URL is not sufficient.
3. **404 over 403** for cross-tenant access, to avoid confirming existence of other tenants' objects.
4. **Never expose** `wholesale_amount_minor`, `supplier_metadata`, `supplier_package_code`,
   provider IDs, or any `*_encrypted` column to agency scope. Allowlist serializers only (§5.6).
5. **Credential reveal** is a distinct permission, audited, rate-limited, and returns data only for
   `buyer_organization` orders.
6. **Privilege-escalation guards:** a user may not grant a role they do not hold; agency users may
   never receive `is_staff`/`is_superuser`; platform role assignment is superuser-only and audited.
7. **`SECURITY RISK` (existing, §5.1)** — add a `lookup` throttle scope to `OrderLookupView`, audit
   every call, and prefer an emailed one-time link before returning credentials.
8. **`SECURITY RISK` (existing, §5.11)** — replace `LocMemCache` with a shared cache (Redis or
   `django.core.cache.backends.db`) so throttles hold across gunicorn workers.
9. **Retention:** audit events retained per policy; redacted operational payloads prunable;
   financial and fulfilment history never pruned (spec §16).
10. **MFA** (TOTP) strongly recommended for all platform admins and agency owners; treat as
    required before real money flows.
11. **Session hygiene:** rotate on login, invalidate on password reset and on membership
    disable/role downgrade. Consider a shorter idle timeout for admin scopes.
12. **Rate limits:** new scopes `admin`(60/min), `agency`(120/min), `lookup`(10/min),
    `export`(5/hour), `reveal`(10/hour).
13. **Cross-origin/session:** admin panels are separate origins from `:8000`; use the same
    same-origin proxy strategy documented in `API.md` rather than introducing tokens
    (spec §11 forbids browser-accessible auth tokens).

---

## 19. Reporting requirements

**Platform:** GMV & net revenue; **margin** (`retail − wholesale` from order-item snapshots);
orders by status; refund rate; commission liability (accrued − reversed − paid); agency
league table; catalogue performance; provisioning success rate & mean time-to-ready; failed
payments/webhooks; notification delivery rate.

**Agency:** own sales (buyer orders), commission earned/pending/reversed/paid, payout history,
top destinations, customer count, eSIM status mix. **No platform-wide or cross-agency figures,
and no margin data.**

Implementation: DB aggregation with mandatory tenant filter; short-TTL cache; CSV export async via
`ReportExport`; date-range bounded (reject unbounded ranges); reuse minor-unit conventions.

---

## 20. Background-job requirements

Extend the existing `process_jobs` worker (already drains `supplier_events` + `notifications`):
- `ReportExport` generation (large CSVs).
- Scheduled catalogue import.
- Commission availability transitions (`pending → available` after a review window) — currently
  manual (spec §21: release timing unconfirmed).
- Invitation-expiry sweep; audit retention sweep; stale-lock recovery (already implemented for
  supplier events).
- Admin visibility endpoints for queue depth, failure counts, manual-review items (§6.9/6.16).

Keep the Postgres `SKIP LOCKED` pattern; do not introduce Celery/Redis without measured need
(spec §17).

---

## 21. Integration requirements

- **Stripe** — refunds already implemented behind the gateway; admin refund endpoint reuses it.
  `client_secret` today is a stub (`PAYMENTS_GATEWAY="fake"`). `UNVERIFIED` until real keys land.
- **eSIM Access** — `apps/esims/supplier.py::EsimAccessGateway` intentionally raises; admin
  "reprovision" must go through `SupplierEvent` with the original idempotency key.
- **Email** — console backend today; agency "resend" must use templated `Notification` rows, never
  free-text sending (anti-abuse). Real provider pending.
- **Google OAuth** — works for customers; decide whether agency staff may use it (recommend: yes
  for convenience, but MFA/allowlist for platform admins).
- **Object storage** — needed for `ReportExport` files and agency logos. `MISSING`.
- **Error monitoring** — Sentry recommended; correlation ids already generated in
  `apps/common/exceptions.py`.

---

## 22. File-by-file implementation plan

```
apps/administration/                    NEW APP
├── __init__.py · apps.py               register in INSTALLED_APPS
├── models.py                           AuditEvent, PlatformSetting, SupportTicket,
│                                       SupportMessage, ReportExport
├── roles.py                            PLATFORM_ROLES + AGENCY_ROLE_CAPABILITIES map
├── permissions.py                      IsPlatformAdmin, HasPlatformPerm,
│                                       IsAgencyMember, HasAgencyRole, IsSameTenant
├── tenancy.py                          resolve_tenant(), TenantScopedMixin, TenantQuerySet
├── audit.py                            record_audit(), @audited, diff_model() + redaction
├── pagination.py / filters.py          shared list filtering
├── services/                           organizations.py · refunds.py · reports.py ·
│                                       exports.py · members.py
├── admin_api/                          serializers.py · views.py · urls.py   (/api/v1/admin/)
├── agency_api/                         serializers.py · views.py · urls.py   (/api/v1/agency/)
├── migrations/0001_initial.py
└── tests/                              test_tenancy.py · test_permissions.py ·
                                        test_audit.py · test_admin_api.py · test_agency_api.py

MODIFY
├── config/settings.py                  + apps.administration; + throttle scopes
│                                       (admin/agency/lookup/export/reveal);
│                                       + shared CACHES backend (§18.8)
├── config/urls.py                      + /api/v1/admin/, + /api/v1/agency/
├── apps/accounts/models.py             Organization/Member fields; AgencyInvitation,
│                                       AgencyCustomer, AgencyPricingRule
├── apps/accounts/services.py           §10.3 suspension gate in create_commission_for_order;
│                                       member/invitation services
├── apps/orders/models.py               Order.agency_customer, Order.source, tenant indexes
├── apps/orders/services.py             checkout(organization=…, agency_customer=…)
├── apps/orders/views.py                OrderLookupView: + throttle_scope="lookup" + audit  (§5.1)
├── apps/payments/models.py             RefundRequest; Refund.initiated_by
├── apps/payments/services.py           expose create_refund via admin service layer
├── apps/esims/models.py                EsimProfile.organization (denormalised)
├── apps/esims/services.py              set EsimProfile.organization on provisioning
└── apps/common/exceptions.py           + tenant/permission error codes
```

---

## 23. Recommended implementation order

| Phase | Deliverable | Why first |
|---|---|---|
| **A1** | Audit framework + `AuditEvent` | everything else must be auditable from day one |
| **A2** | Fix §5.1 lookup throttle, §5.4 suspension gate, §18.8 shared cache | existing risks, cheap fixes, no new surface |
| **A3** | Roles, permissions, tenancy primitives (+ tests) | the security foundation both panels stand on |
| **B1** | Organization lifecycle (approve/suspend) + platform org/member admin API | unblocks agency onboarding |
| **B2** | Platform read APIs: dashboard, customers, orders, payments, eSIMs | highest operational value |
| **B3** | Platform refund API (reuses existing service) + commission approval/payout | closes §5.9 |
| **C1** | Agency auth scope, dashboard, profile, staff + invitations | agency panel MVP |
| **C2** | Agency commissions/payouts/reports (read-only) | pure value, low risk |
| ~~**C3**~~ | ~~`AgencyCustomer` + agency order creation~~ | **CANCELLED (§0)** — customers buy on the public website |
| ~~**C4**~~ | ~~Agency eSIM view/resend/top-ups + refund requests~~ | **CANCELLED (§0)** — agencies see no PII or credentials |
| **D1** | Support tickets, exports, settings | pricing rules cancelled (§0) |
| **D2** | MFA, retention jobs, error monitoring | pre-launch hardening |

Ship A1–A3 before any panel work. They are the difference between a secure system and a fast one.

---

## 24. Testing strategy

1. **Permission matrix tests** — parametrised over every role × every endpoint × every method;
   assert exact status codes. Auto-fail when a new endpoint has no matrix entry.
2. **Cross-tenant isolation** — for **every** agency endpoint, Agency A must receive 404 for
   Agency B's objects (list, detail, update, delete, export).
3. **Referral vs buyer visibility** — assert a referral order exposes **no** customer email and
   **no** eSIM credentials, while a buyer order does. Directly guards §8.2.
4. **Privilege escalation** — `viewer` cannot mutate; `admin` cannot grant `owner`; last owner
   cannot be removed; agency user cannot obtain `is_staff`.
5. **Audit coverage** — every mutating service emits exactly one event with correct actor/tenant;
   **a redaction test asserting no plaintext ICCID/QR/activation code ever reaches `audit_events`**.
6. **Financial correctness** — refund request → approval → execution → commission reversal
   end-to-end (extends existing tests in `apps/payments/tests.py`).
7. **Serializer leak tests** — assert `wholesale_amount_minor`, `supplier_*`, and `*_encrypted`
   never appear in any agency response (mirrors the existing catalogue leak test).
8. **Performance** — `assertNumQueries` on dashboards/lists to prevent N+1 as tenants grow.
9. **Migration tests** — the `EsimProfile.organization` backfill produces values consistent with
   `order_item.order.buyer_organization`.

Target: no new endpoint merges without matrix + isolation + audit tests.

---

## 25. Acceptance criteria

- [ ] Agency A can never read, modify, or export any Agency B data (proved by tests, all endpoints).
- [ ] A referral-only agency can see commission figures but **zero** customer PII and **zero** eSIM
      credentials.
- [ ] Every agency role behaves exactly per §9.2; `viewer` cannot mutate anything.
- [ ] Suspended/pending organizations cannot log into agency scope, order, or accrue commission.
- [ ] Every financial and lifecycle mutation produces an immutable, correctly-attributed
      `AuditEvent` containing **no** secrets.
- [ ] Refunds are executable only by finance/platform admins; agencies can only request.
- [ ] Commission values and platform pricing are never writable from agency scope.
- [ ] `wholesale_amount_minor` and supplier metadata never appear in an agency response.
- [ ] `/orders/lookup/` is throttled and audited.
- [ ] Throttles hold across multiple worker processes.
- [ ] All existing tests still pass; new suites cover the permission matrix and isolation.
- [ ] All new tables carry the `set_updated_at` trigger.
- [ ] No agency user holds `is_staff`; Django Admin remains superuser-only.

---

## 26. Risks, assumptions, and unresolved questions

**Risks**
1. **Tenant leakage** — highest-severity risk; mitigated by four enforcement layers (§8.4) plus
   mandatory isolation tests.
2. **Audit as a leak vector** — a naive diff writes secrets to the audit table (§17.3).
3. **Scope creep vs the spec** — the design spec excludes an agency portal and makes commission
   approval admin-only (§5.12). This plan supersedes that; the spec should be updated so code and
   spec do not diverge.
4. **Pricing/markup ambiguity** — if agency markup ever becomes real billing (not display),
   commission maths, refunds, and settlement all change. Keep display-only until decided.
5. **Denormalised `EsimProfile.organization` drift** — needs a reconciliation test/job.
6. **Django Admin exposure** — granting `is_staff` to any agency user leaks every tenant. Must be
   blocked in code, not just policy.

**Assumptions** (`UNVERIFIED`)
- Tenants number in the tens–hundreds, not thousands (shared-schema tenancy is appropriate).
- Agency panel is a separate frontend consuming JSON, not Django templates.
- Agencies pay via the same Stripe flow as retail (no invoicing/credit terms) at launch.
- Reporting volumes permit synchronous aggregation for short ranges.

**Unresolved questions for the product owner**
1. ~~Do agencies buy on behalf of customers, refer via coupons, or both?~~ **ANSWERED (§0):**
   referral only — customers buy on the public website with a zero-discount tracking code.
2. ~~Can agencies set their own retail markup?~~ **ANSWERED (§0):** no — full price, fixed 20%
   commission.
3. ~~Are agency-created promo codes allowed?~~ **ANSWERED (§0):** no — the platform issues
   tracking codes to agencies.
3a. Should the agency see a **masked** customer identity (e.g. `j***@gmail.com`) so it can
   match a sale to the person it gave the code to? Currently **no identity at all** (safe
   default). Reversible upgrade.
4. Commission release policy — manual approval, or automatic after N days? (spec §21 open)
5. Is MFA mandatory for platform admins at launch?
6. Do agencies need white-label branding (logo/domain) on customer emails?
7. Data retention for audit events and exports?
8. Should platform admins be able to impersonate an agency user for support? (powerful; requires
   its own audit action and strict gating)
