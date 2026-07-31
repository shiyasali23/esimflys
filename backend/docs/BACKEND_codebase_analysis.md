# Backend Codebase Analysis

**Audit date:** 2026-07-30  
**Audit target:** Current working tree at `/Users/macbookpro/Desktop/code-red/esim`  
**Audited backend:** Django 5.2 / Django REST Framework / PostgreSQL monolith under `backend/`  
**Verdict:** **Unsafe for production**

## 1. Executive summary

The backend has a strong foundation: server-side pricing, integer minor-unit money, database constraints, Stripe webhook signature verification, event idempotency keys, encrypted eSIM credentials, tenant-scoped agency queries, explicit capability matrices, durable supplier/notification rows, and a substantial PostgreSQL-backed test suite. The audit executed all **311 tests successfully in 73.147 seconds**, found **no model/migration drift**, and found **no broken installed Python requirements**.

Those strengths do not make the current system production-safe. Two confirmed critical risks remain:

1. The Docker build copies the ignored local `.env` into the image because no `.dockerignore` exists. A build can permanently embed Django, Stripe, supplier, encryption, and HMAC secrets in an image layer.
2. Refunds call Stripe while a local transaction is open and create a new random idempotency key for each invocation. A Stripe success followed by a database/connection/response failure can produce a second refund on retry.

High-risk problems also affect authentication policy, payment state transitions, crash recovery, authorization, gateway configuration, tax, production deployment, encryption-key rotation, catalogue/supplier eligibility, and the unverified live supplier contract. Notably:

- django-allauth exposes password reset and password change routes that bypass the custom rule preventing agency users from self-managing platform-issued credentials.
- A failed PaymentIntent releases a promo reservation, but the same PaymentIntent can later succeed; the discounted order is then paid while its redemption remains released and no longer counts toward limits.
- Refunds that Stripe reports as `processing`, Stripe disputes/chargebacks, and later refund state changes are never reconciled.
- Supplier and email jobs can remain `processing` forever after a crash; unexpected exceptions can terminate the only worker loop.
- A read-only platform administrator has the capability used by the supplier retry endpoint, which can re-trigger a money-spending supplier operation.
- Misspelled gateway settings silently select fake providers. A production typo can create fake eSIM credentials.
- Checkout permits an aggregate quantity large enough to create hundreds of thousands of order items and then performs per-item provisioning writes synchronously in a Stripe webhook.
- The supplied container command runs only Gunicorn: it does not migrate, collect static assets, or run the supplier/notification worker. The only CI workflow is frontend-only.

Production release should be blocked until all Critical and High findings are remediated and verified with failure-injection, concurrency, and real-provider staging tests.

## 2. Scope, method, and evidence

### Repository areas reviewed

- `backend/config/`: settings, URL routing, WSGI, ASGI
- `backend/apps/accounts/`: custom user, sessions, registration/login/reset, organizations, membership, commissions, payouts, allauth adapter
- `backend/apps/catalog/`: countries, suppliers, plans, top-ups, selectors, serializers, import and demo activation
- `backend/apps/orders/`: carts, promos, checkout, immutable order snapshots, guest lookup, notification queue
- `backend/apps/payments/`: PaymentIntents, webhooks, reconciliation, refunds, Stripe/fake gateways
- `backend/apps/esims/`: provisioning, supplier client, usage refresh, top-ups, encryption, durable job queue
- `backend/apps/administration/`: platform/agency roles, tenant scoping, audit events, operational actions, reports, API surfaces
- All backend migrations and tests
- `backend/Dockerfile`, `.env.example`, `.gitignore`, `pyproject.toml`, README and API/implementation documents
- `.github/workflows/ci.yml`
- Frontend API adapters and proxy configuration where needed to confirm backend call flows

The current working tree contains many pre-existing modified and untracked files. This audit uses the current filesystem as the source of truth and does not assume Git `HEAD` reflects the deployed candidate.

### Verification performed

| Check | Result |
|---|---|
| `manage.py test apps --verbosity=1` | **311 tests passed**, PostgreSQL test database, 73.147s |
| `manage.py makemigrations --check --dry-run` | **No changes detected** |
| `pip check` | **No broken requirements found** |
| Django production system check with safe audit-only environment overrides | HSTS warning remained; no migration/model errors |
| Local development deploy check | Expected warnings because the checked local `.env` has `DEBUG=True` |
| Installed-package inventory | Django 5.2.16, DRF 3.15.2, django-allauth 65.18.0, stripe 15.3.1, httpx 0.28.1, cryptography 49.0.0, gunicorn 26.0.0, psycopg 3.3.4, others listed by `pip` |
| Vulnerability database query | **Not completed**. `pip-audit` was installed under `/private/tmp`; the environment security policy rejected exporting the installed package/version inventory to an external vulnerability service. No “zero vulnerabilities” claim is made. |

No application source was modified. This report is the only created file.

## 3. Architecture summary

The application is a synchronous Django monolith with PostgreSQL as its durable source of truth:

1. Public catalogue endpoints expose active countries and plans.
2. Authenticated users use database-backed Django sessions; guests use a random `X-Cart-Token` whose SHA-256 digest is stored.
3. Checkout locks the cart, reloads current catalogue prices, snapshots each purchased unit into an `OrderItem`, reserves a promo redemption, and converts the cart.
4. A PaymentIntent is created from the stored `Order.total_minor`. Stripe webhooks are the authority for marking non-zero orders paid.
5. Paid orders enqueue one `SupplierEvent` per eSIM/top-up and queue email notifications.
6. A management-command worker polls `SupplierEvent` and `Notification` rows using `SELECT ... FOR UPDATE SKIP LOCKED`.
7. eSIM credentials are encrypted with Fernet; ICCIDs also have an HMAC blind index.
8. Agency referrals create partner commissions. Platform finance administrators approve commissions, group payouts, and invoke refunds.
9. Platform and agency admin APIs use declarative capability maps. Agency requests resolve an active membership and active organization before accessing tenant-scoped querysets.
10. Audit events capture sensitive actions with recursive field-name and binary-value redaction.

### Main data relationships

- `User` → carts, orders, organization memberships, audit events
- `Organization` → members, referral promo codes, referred orders, commissions, payouts
- `Cart` → `CartItem` → `CatalogPlan`
- `Order` → `OrderItem` → `Payment` → `Refund`/`RefundItem`
- `Order` → optional `PromoRedemption` and `PartnerCommission`
- `OrderItem` → optional `EsimProfile` or `TopupFulfillment`
- `SupplierEvent` → order item / eSIM profile
- `Notification` → order / eSIM profile

## 4. Critical workflow summary

### Authentication and agency access

- Custom DRF endpoints implement registration, login, logout, password reset, and account profile.
- django-allauth is mounted separately under `/accounts/` for Google OAuth and also exposes its standard account-management routes.
- Platform roles are Django group names; agency roles are stored in `OrganizationMember`.
- Agency tenancy requires an active membership in an active organization.

### Checkout and payment

- Catalogue retail price is reloaded at checkout; no client total is trusted.
- Each quantity unit becomes one immutable order item.
- Stripe intent amount/currency/order metadata are reconciled by a signature-verified webhook.
- Zero-total orders are completed locally.
- Refunds are initiated by finance/platform administrators and allocated to order items.

### Provisioning and top-up

- Paid order handling creates profiles and durable supplier jobs.
- Provisioning is two-phase: order, persist supplier order number, then poll for credentials.
- The worker encrypts credentials and moves order fulfillment state.
- Top-up orders reuse the standard payment flow, then invoke the supplier and increase stored balances.

### Commissions and payouts

- A qualifying organization promo snapshots commission terms when payment succeeds.
- Refunds reverse commission proportionally.
- Human approval precedes grouping into a draft payout.
- A separate action marks a payout paid; no bank/payout provider integration exists.

## 5. Codebase-specific audit checklist

The following checklist was derived from this repository's actual design:

### Identity, sessions, and OAuth

- [x] Custom email uniqueness is case-insensitive in PostgreSQL.
- [x] Session authentication is protected by CSRF on authenticated unsafe requests.
- [x] Password validators run on custom registration/reset and platform-set agency passwords.
- [x] Google email linking requires a provider-verified address.
- [x] Tenant resolution checks active membership and organization state.
- [ ] Every route capable of changing an agency password enforces the platform-issued credential policy.
- [ ] Agency membership requires invitation/acceptance by the target user.
- [ ] Registration responses do not disclose whether an email exists.
- [ ] Credential-reveal and guest-lookup controls provide strong possession proof, not reusable business identifiers.

### Catalogue, cart, promo, and checkout

- [x] Checkout reloads current server-side prices.
- [x] Order snapshots preserve historical product and wholesale data.
- [x] Promo usage reservation is serialized by locking the promo row.
- [x] Order totals have balancing and non-negative constraints.
- [ ] Aggregate cart quantity and order-item creation are tightly bounded.
- [ ] Checkout uses a constant number of catalogue queries.
- [ ] Active sellability includes supplier operational status.
- [ ] Promo reservations have explicit expiry/cancellation state transitions.
- [ ] A failed-then-successful PaymentIntent cannot evade promo usage accounting.
- [ ] Tax jurisdiction, taxable address, tax calculation, and evidence retention are implemented.

### Stripe and refunds

- [x] Prices/totals come from stored orders.
- [x] Webhook signatures are verified.
- [x] Event IDs and provider PaymentIntent IDs are unique.
- [x] Successful payment webhooks reconcile amount, currency, and order metadata.
- [ ] Provider calls and local commits use a durable outbox/state machine that tolerates every crash point.
- [ ] Refund request idempotency is stable across client retries.
- [ ] Async refund results are finalized by webhook/poller.
- [ ] Disputes, chargebacks, cancellations, and late/out-of-order events are handled.
- [ ] Multiple partial refunds remain possible.
- [ ] Refunding fulfilled service coordinates supplier cancellation or records an explicit loss decision.
- [ ] Invalid webhook traffic cannot grow the database without bound.

### Supplier and background work

- [x] Supplier provisioning uses a stable transaction ID.
- [x] A persisted supplier order number prevents normal retries from buying twice.
- [x] Credentials are redacted from durable supplier payloads.
- [x] Jobs use `SKIP LOCKED` for parallel workers.
- [ ] Processing leases expire and stale work is reclaimed.
- [ ] Unexpected exceptions fail/retry one job without terminating the worker.
- [ ] The real order body and duplicate-recovery query have been contract-tested safely.
- [ ] Top-up compatibility is checked against base plan/package and profile lifecycle state.
- [ ] Read-only roles cannot retry money-spending work.
- [ ] Supplier balance and worker backlog are monitored by the production platform.

### Encryption and secrets

- [x] Activation secrets are encrypted at rest.
- [x] ICCID lookup uses HMAC rather than an unhashed identifier.
- [x] Audit redaction blocks named secrets and binary values.
- [ ] Docker build contexts exclude `.env`, virtual environments, and local artefacts.
- [ ] Old encryption keys remain available during rotation.
- [ ] Rotation/re-encryption has a tested runbook.
- [ ] Database TLS verifies server identity.

### Database, performance, and reports

- [x] Core status and amount constraints exist for orders/payments/refunds.
- [x] Public/admin list views commonly paginate.
- [x] Important owner/tenant detail querysets are scoped.
- [ ] All financial model values and percentage bounds have database constraints.
- [ ] Promo customer-limit and payout-period queries have supporting indexes.
- [ ] Custom APIView list responses are bounded.
- [ ] Serializer permission checks do not query groups once per row.
- [ ] Session invalidation does not decode every live session.
- [ ] Dashboard date filters apply consistently to revenue, margin, commissions, and payouts.
- [ ] Margin reflects refunds and the requested reporting period.

### Deployment and operability

- [ ] Dependencies are reproducibly locked and vulnerability-scanned in CI.
- [ ] Backend tests, deploy checks, and migration checks run in CI.
- [ ] The release process runs migrations and `collectstatic`.
- [ ] A separately supervised worker deployment exists.
- [ ] Production email transport is fully configured and tested.
- [ ] Readiness checks shared cache and essential worker health, not only PostgreSQL.
- [ ] HSTS and trusted-proxy/TLS assumptions are explicitly configured.
- [ ] Provider fakes are impossible in production unless an explicit demo mode is enabled.

## 6. Findings ordered by severity

### Critical

#### F-01 — Docker images can contain the local `.env` and all secrets

- **Severity:** Critical
- **Confidence:** Confirmed
- **Category:** Secret exposure / deployment
- **Location:** `backend/Dockerfile:12`; missing `backend/.dockerignore`; `backend/.gitignore:6`
- **Evidence:** The repository contains `backend/.env`. Git ignores it, but Docker does not use `.gitignore`. `COPY . .` copies the entire backend build context, and no `.dockerignore` exists. The same build context also contains `backend/.venv`.
- **Why this is a problem:** Secrets become part of an immutable image layer and may be recoverable from a registry, build cache, exported image, or anyone with image access. Deleting `/app/.env` in a later layer would not remove it from earlier layers.
- **Impact / exploitation:** Exposure can compromise Django session signing, Stripe API/webhooks, supplier wallet access, encrypted eSIM credentials, and ICCID blind indexes. The virtual environment also makes images much larger and less deterministic.
- **Precise fix:** Add a restrictive `backend/.dockerignore` including `.env`, `.env.*` except an intentionally safe example, `.venv`, caches, test artefacts, local data, and VCS metadata. Inject secrets only at runtime through the deployment secret store. Use a multi-stage build with a locked dependency file. If any image has already been built or pushed with this context, treat every value in `.env` as exposed and rotate it.
- **Simpler implementation:** The minimum safe correction is a `.dockerignore` plus runtime environment injection; no container-platform abstraction is required.
- **Suggested test:** Build an image from a fixture context containing sentinel secrets, export/search all layers, and assert the sentinels and `/app/.env` are absent. Assert `.venv` is absent and compare image size.

#### F-02 — Refunds can be duplicated when Stripe succeeds but local persistence fails

- **Severity:** Critical
- **Confidence:** Confirmed
- **Category:** Payments / transactions / idempotency
- **Location:** `backend/apps/payments/services.py:214-290`, especially `249`, `266-279`; `backend/apps/administration/admin_api/views.py:529-543`
- **Evidence:** `create_refund()` opens `transaction.atomic()`, creates a random key with `secrets.token_hex(8)`, inserts local rows, calls Stripe while locks are held, then saves the provider result. A new invocation always gets a different idempotency key. The audit write occurs after the service transaction has committed.
- **Why this is a problem:** A remote side effect cannot participate in the PostgreSQL transaction. If Stripe accepts the refund and the process, database connection, commit, or HTTP response fails afterward, local state may roll back or the caller may see an error. Retrying creates a new Stripe idempotency key, so Stripe may issue another refund.
- **Impact / exploitation:** Duplicate refunds, inconsistent refundable-balance calculations, incorrect commissions/order states, and manual reconciliation. A finance user retrying a 500 is sufficient; malicious access is not required.
- **Precise fix:** Persist a refund request with a caller-supplied or deterministic request id before contacting Stripe; commit it; process it asynchronously from a durable outbox; call Stripe with that stable key; and reconcile provider state idempotently. Lock only during short local transitions. Make the API retry return the existing request. Put the audit row in the same local transaction as each state transition.
- **Simpler implementation:** A `RefundRequest`/existing `Refund` row with a unique external request key and a worker is enough; a distributed transaction system is unnecessary.
- **Suggested test:** Inject failures (a) after Stripe returns, (b) before DB commit, (c) after commit before response, and (d) during audit insertion. Retry the same API request and assert exactly one provider refund and one local refund.

### High

#### F-03 — django-allauth bypasses the agency credential-management policy

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Authentication / authorization
- **Location:** `backend/config/urls.py:18`; `backend/config/settings.py:102-108`; custom restriction in `backend/apps/accounts/views.py:86-108`
- **Evidence:** The custom password-reset endpoint blocks every user with an organization membership. However, mounting `allauth.urls` exposes `/accounts/password/reset/` and `/accounts/password/change/`. Only `SOCIALACCOUNT_ADAPTER` is customized; no allauth account adapter/form blocks password reset/change for agency users. Runtime URL reversal confirmed both routes.
- **Why this is a problem:** The explicitly documented security rule (“agency credentials are platform-issued and cannot be self-managed”) is enforced on only one API path.
- **Impact / exploitation:** An agency user with mailbox access or an authenticated agency session can reset/change the platform-issued password outside the audited admin path, bypassing operational approval and session-flush behavior.
- **Precise fix:** Mount only the allauth social/OAuth routes actually needed, or implement a custom `ACCOUNT_ADAPTER`/forms that reject reset and change for agency users and audit the attempt. Ensure the reset-confirm path rechecks the policy. Consider whether the policy itself is appropriate; if self-service is allowed, remove the misleading restriction everywhere and implement MFA.
- **Simpler implementation:** Restrict the URL include to Google login/callback/logout rather than exposing all account-management views.
- **Suggested test:** For active, invited, and disabled agency memberships, POST both allauth reset and change routes and assert no email/password change. Verify customer flows still work and attempts are audited.

#### F-04 — Failed-then-successful PaymentIntents can bypass promo usage limits

- **Severity:** High
- **Confidence:** Highly likely
- **Category:** Payments / promo business logic / state transitions
- **Location:** `backend/apps/payments/services.py:164-180`; `backend/apps/orders/services.py:156-165`; `backend/apps/orders/services.py:251-259`
- **Evidence:** `payment_intent.payment_failed` releases a reserved redemption. A later success calls `consume_promo_for_order()`, which updates only `status="reserved"`; a released row stays released. Usage checks count only reserved/consumed rows. The order keeps its discounted total and PaymentIntent id.
- **Why this is a problem:** A Stripe PaymentIntent may emit a failed-attempt event and later succeed with another payment method. Released redemption is no longer capacity-reserving or counted.
- **Impact / exploitation:** Limited-use and per-customer promo codes can be oversubscribed. A customer can retain the discount while the ledger says it was not consumed.
- **Precise fix:** Do not release a reservation for a recoverable PaymentIntent failure. Keep it reserved until the order/intent is explicitly canceled or expires. If success can follow release, atomically transition `released -> consumed` and enforce the global/per-customer limit at that transition, with a defined compensation path if capacity is no longer available.
- **Simpler implementation:** Treat `payment_failed` as an attempt status on `Payment`, not terminal cancellation of the `Order` or promo.
- **Suggested test:** Checkout with a usage-limit-one promo, process `payment_failed`, let a second order attempt the promo, then process success for the first intent. Assert the limit cannot be exceeded and the paid order has a consumed redemption.

#### F-05 — The Stripe lifecycle is incomplete after payment and during refunds

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Payments / refunds / reliability
- **Location:** `backend/apps/payments/services.py:107-113`, `272-289`; `backend/apps/administration/admin_api/views.py:521-524`
- **Evidence:** Webhook dispatch handles only `payment_intent.succeeded` and `payment_intent.payment_failed`. A refund returned as non-succeeded is stored `processing`, but no refund webhook/poller ever completes it. Chargebacks/disputes and intent cancellation are ignored. After one partial refund, `Payment.status` becomes `partially_refunded`, but the admin endpoint selects only `status="succeeded"`, blocking another partial refund.
- **Why this is a problem:** Local financial state diverges from Stripe for asynchronous refunds, disputes, chargebacks, cancellations, or subsequent partial refunds.
- **Impact / exploitation:** Customers may be refunded while orders and commissions remain paid; disputes can leave commission payable; operators cannot complete legitimate staged refunds through the API.
- **Precise fix:** Define and enforce a complete state machine. Handle at least relevant refund updates/failures, charge/dispute events, cancellations, and out-of-order delivery. Reconcile from provider object IDs. Select refundable payments in `succeeded` and `partially_refunded` states. Add a scheduled reconciliation command for missed webhooks.
- **Simpler implementation:** One webhook handler per provider object type plus a daily reconciliation query is sufficient.
- **Suggested test:** Simulate async refund success/failure, two partial refunds, dispute creation/closure, duplicate/out-of-order events, and missed-webhook reconciliation.

#### F-06 — Background jobs have no stale-lease recovery and unexpected errors can stop the worker

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Background jobs / reliability
- **Location:** `backend/apps/esims/services.py:117-154`; `backend/apps/orders/notifications.py:46-86`; `backend/apps/esims/management/commands/process_jobs.py:34-42`; retry restrictions in `backend/apps/administration/services/operations.py:16-18`
- **Evidence:** Jobs are marked `processing` and committed before work. Claim queries only select pending/retrying rows. There is no `locked_at` timeout recovery for supplier events; notifications have no lock timestamp. `_process()` catches supplier-specific exceptions only. An unexpected database, encryption, data-shape, or programming exception propagates through the infinite command loop. Manual retry explicitly excludes `processing`.
- **Why this is a problem:** A process crash at any point after claim leaves work permanently stuck. One unexpected job can terminate the only worker, stopping all provisioning and email.
- **Impact / exploitation:** Paid orders can remain unfulfilled indefinitely; reset/order/eSIM-ready emails stop; operational dashboards show processing work without an automated repair path.
- **Precise fix:** Add leases (`locked_at`, worker id, lease expiry), reclaim stale processing rows, catch top-level exceptions per job, store a bounded/redacted error, and continue. Use heartbeat/health monitoring and a supervisor restart policy. Add a safe admin action for stale processing rows.
- **Simpler implementation:** A periodic query that moves `processing` rows older than a conservative timeout back to `retrying`, combined with per-job `except Exception`, addresses the core risk.
- **Suggested test:** Kill a worker after claim and after provider response; advance time beyond the lease; start another worker; assert safe completion without duplicate supplier action. Inject malformed provider data and assert later jobs still run.

#### F-07 — Cart quantity amplification can exhaust memory/database and make payment webhooks time out

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Performance / availability / database
- **Location:** `backend/apps/orders/models.py:105-107`; `backend/apps/orders/services.py:108-142`, `189-203`; `backend/apps/esims/services.py:25-55`; checkout throttle at `backend/config/settings.py:153`; catalogue size documented at `backend/README.md:49`
- **Evidence:** Quantity is capped per cart item at 1,000, but no aggregate cart/order cap exists. `_price_cart()` performs one catalogue query per distinct cart item and appends one Python snapshot per unit. `bulk_create` receives the whole list. Paid webhook processing then loops all order items and performs `get_or_create` operations per item synchronously.
- **Current complexity:** For `N` cart lines and `Q=sum(quantity)`, checkout is **O(N + Q)** time, **O(Q)** memory, and approximately **1 + N** catalogue/cart queries before the bulk insert. Provision enqueue is **O(Q)** with multiple database operations per unit. With the imported 385 plans, the model permits up to 385,000 units in one cart.
- **Why this is a problem:** Rate limits bound request count, not the amount of work in one request. A single accepted checkout can therefore allocate and insert an operationally unsafe amount of data while holding a transaction open.
- **Impact / exploitation:** An unauthenticated client can cause large allocations, long transactions, huge inserts, and webhook timeouts. Rate limiting 30 requests/minute does not bound work per request.
- **Precise fix:** Set a small business aggregate limit (items and total units), validate it on every cart mutation and checkout, fetch cart items with `select_related("catalog_plan__country", "catalog_plan__supplier")`, batch inserts, and enqueue provisioning asynchronously outside the webhook transaction.
- **Expected improvement:** Catalogue reads become constant-query (typically one joined query); memory remains O(Q) only if one row per unit is retained, but bounded Q makes it safe. Provider enqueue should be batch-oriented/async. Benchmark before choosing batch size.
- **Suggested test:** Boundary and concurrent cart tests; assert a constant checkout query count as N grows; load-test the maximum accepted cart; assert webhook response latency is independent of Q because enqueue is deferred.

#### F-08 — Invalid gateway names silently select fake payment/supplier implementations

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Configuration / fail-safe behavior
- **Location:** `backend/apps/payments/stripe.py:95-99`; `backend/apps/esims/supplier.py:354-358`
- **Evidence:** Each factory returns the real gateway only for one exact name and returns the fake for every other value. No allowed-value validation runs at startup.
- **Why this is a problem:** Security- and money-critical configuration fails open.
- **Impact / exploitation:** A typo such as `esim_acess` can cause paid production orders to be marked fulfilled with deterministic fake credentials. A payment typo can produce unusable fake client secrets and operational confusion.
- **Precise fix:** Validate values against explicit enums at settings import/startup and raise `ImproperlyConfigured` for unknown values. When `DEBUG=False`, forbid fake gateways unless a separate, loudly named demo override is set.
- **Simpler implementation:** Two `if name not in {...}: raise` checks plus production assertions are enough.
- **Suggested test:** Boot production settings with blank, misspelled, fake, and valid names; assert invalid/fake configurations fail before serving traffic.

#### F-09 — A read-only platform role can retry supplier jobs

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Authorization / external side effects
- **Location:** `backend/apps/administration/roles.py:89-117`; `backend/apps/administration/admin_api/views.py:632-640`
- **Evidence:** `VIEW_OPS` belongs to `_READ_ONLY`, which is granted to `readonly_admin`. The mutation endpoint `AdminSupplierEventRetryView` requires only `VIEW_OPS`. Retrying can call the supplier order/top-up API and spend wallet funds.
- **Why this is a problem:** A read capability authorizes an externally consequential write.
- **Impact / exploitation:** A compromised or mistaken read-only account can requeue manual-review supplier work, potentially buying an eSIM/top-up or repeatedly exercising provider recovery paths.
- **Precise fix:** Introduce `MANAGE_OPS`/`RETRY_SUPPLIER_EVENT`, grant it only to deliberately authorized roles, and keep list access under `VIEW_OPS`. Consider a second approval for uncertain-outcome jobs.
- **Simpler implementation:** A single new capability and permission-matrix entry fixes the privilege boundary.
- **Suggested test:** Assert readonly/support roles can list but receive 403 on supplier and notification retries; assert authorized operations/platform roles can retry.

#### F-10 — An agency can attach arbitrary existing users and alter their authentication policy

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Account security / tenancy
- **Location:** `backend/apps/administration/agency_api/views.py:117-135`; `backend/apps/administration/services/members.py:114-138`; `backend/apps/accounts/services.py:64-78`
- **Evidence:** An owner/admin supplies an email, the view finds any existing `User`, and membership is immediately created `active` without target-user consent. `is_agency_account()` treats any membership, including disabled, as an agency account, which blocks social login and the custom password reset.
- **Why this is a problem:** Membership is both tenant authorization and a global authentication-policy flag, yet another tenant can assign it unilaterally.
- **Impact / exploitation:** A malicious agency manager can add known customer emails and deny those users Google login/custom reset. The target also gains unintended access to agency data.
- **Precise fix:** Create an `invited` membership with a signed, expiring acceptance token sent to the target. Activate only after the authenticated target accepts. Base global credential restrictions on an explicitly managed account type, not any historical membership.
- **Simpler implementation:** Invitation/acceptance on the existing membership status field is sufficient.
- **Suggested test:** Agency adds an existing customer; assert membership remains invited, customer auth behavior is unchanged, and no agency data is available until acceptance.

#### F-11 — Tax is hard-coded to zero and required tax evidence is absent

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Financial correctness / compliance
- **Location:** `backend/apps/orders/services.py:121-135`, `273-274`; `backend/apps/orders/models.py:261-271`
- **Evidence:** `_calculate_tax()` always returns `0`. Orders store only customer email and no billing location, tax jurisdiction, tax identifier, calculation reference, or tax evidence.
- **Why this is a problem:** The system cannot determine, charge, explain, or audit applicable VAT/sales tax.
- **Impact / failure or exploitation path:** Every order is persisted and charged with zero tax. If tax is due, this causes undercollection, incorrect invoices/revenue, regulatory exposure, and inability to reconstruct tax decisions. Exact legal obligations depend on merchant location and customer/product classification and require specialist review.
- **Precise fix:** Decide merchant-of-record and tax policy before launch. Collect validated billing/tax location evidence, calculate server-side through a tested rules engine/provider, snapshot jurisdiction/rate/basis/provider reference, and include tax in Stripe/order reconciliation. Do not activate sales in jurisdictions lacking a decision.
- **Simpler implementation:** A reputable tax provider plus immutable snapshots is safer than a custom global rules engine.
- **Suggested test:** Jurisdictional fixtures, inclusive/exclusive tax, zero-rated/exempt cases, refunds, rounding, currency, and provider outage behavior reviewed by tax counsel/accounting.

#### F-12 — The repository does not define a complete production runtime

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Deployment / operability / email
- **Location:** `backend/Dockerfile:9-16`; `.github/workflows/ci.yml:8-38`; `backend/.env.example:1-25`; `backend/apps/common/health.py:11-19`; email settings `backend/config/settings.py:194-200`
- **Evidence:** The image command runs only Gunicorn. No deployment artefact runs migrations, `collectstatic`, or `process_jobs`; no worker service or scheduler is defined. CI is frontend-only. Production settings require a shared cache, but `.env.example` omits `CACHE_URL`. SMTP is selected in production, but no `EMAIL_HOST`, port, credentials, TLS/SSL settings are read; `EMAIL_PROVIDER_API_KEY` in the example is unused. Readiness checks only `SELECT 1`.
- **Why this is a problem:** A container can become “ready” while schemas are stale, static admin assets are absent, rate limiting is misconfigured, email is undeliverable, and no paid orders are provisioned.
- **Impact / failure or exploitation path:** Deploying only the supplied image command can produce missing migrations/static assets, stuck fulfillment/notifications, broken reset email, and false-positive health checks.
- **Precise fix:** Define release, web, worker, and scheduled jobs in deployment manifests. Add backend CI with PostgreSQL, migrations, tests, deploy checks, dependency audit, and image scan. Configure/test a real email backend. Document every required setting including cache and proxy/TLS. Add worker/backlog and cache readiness/monitoring.
- **Simpler implementation:** Separate `release`, `web`, and `worker` commands supervised by the chosen platform are sufficient.
- **Suggested test:** Deploy to an empty staging environment from committed artefacts only; verify migrations/static, shared throttling across workers, email receipt, Stripe webhook, provisioning, worker restart recovery, and failing readiness when dependencies are unavailable.

#### F-13 — Encryption-key rotation cannot retain access to existing credentials

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Cryptography / data availability
- **Location:** `backend/config/settings.py:202-204`; `backend/apps/common/encryption.py:12-38`; `backend/apps/esims/models.py:41-51`
- **Evidence:** Rows store `encryption_key_version`, and decryption looks up that version, but settings constructs `FIELD_ENCRYPTION_KEYS` with only the current version and one `FIELD_ENCRYPTION_KEY`.
- **Why this is a problem:** Changing version/key removes the old key from the key ring. Existing eSIM activation data becomes undecryptable.
- **Impact / failure or exploitation path:** Rotating the configured key/version immediately makes older ciphertext unreadable, causing permanent loss of customer credentials or pressure to keep a compromised key as the current key. There is no re-encryption command/runbook.
- **Precise fix:** Load a versioned key ring from separate secret variables/JSON, keep old decrypt-only keys, encrypt with the active version, add a resumable locked re-encryption command, verify counts, then retire old keys only after backup and rollback windows.
- **Simpler implementation:** `FIELD_ENCRYPTION_KEYS_JSON={"1":"...","2":"..."}` plus `FIELD_ENCRYPTION_KEY_VERSION=2` is enough initially.
- **Suggested test:** Encrypt with v1, rotate to v2 while retaining v1, decrypt both, re-encrypt v1 rows, remove v1, and verify all records plus rollback behavior.

#### F-14 — Sellability and top-up eligibility do not enforce supplier/package lifecycle

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** Business logic / external integration
- **Location:** `backend/apps/catalog/selectors.py:22-28`; `backend/apps/orders/services.py:178-185`, `193-198`; `backend/apps/esims/services.py:60-73`; `backend/apps/esims/views.py:62-67`
- **Evidence:** Active catalogue and checkout checks plan/country state but ignore `Supplier.status`. Top-up creation checks only that product and profile have the same supplier. It does not require the original plan to support top-up, match `base_plan`/package compatibility, or require a ready/active profile with a supplier reference. The GET endpoint lists every active top-up for the supplier.
- **Why this is a problem:** “Same supplier” is not a valid package compatibility rule, and disabled suppliers remain sellable.
- **Impact / failure or exploitation path:** A disabled supplier or an incompatible profile/product can pass checkout and reach the worker. Customers can pay for products that cannot be fulfilled; calls may be made with `supplier_reference=None`; refund/support costs follow.
- **Precise fix:** Centralize sellability/eligibility predicates. Require active supplier, country, plan/product, original plan `topup_supported`, compatible base package/metadata, supported profile state, non-null supplier reference, currency agreement, and supplier-confirmed availability.
- **Simpler implementation:** Start with a strict `TopupProduct.base_plan` match and explicit profile states; broaden only when provider contract proves compatibility groups.
- **Suggested test:** Disabled supplier, pending/failed/expired profile, missing reference, incompatible base plan/package, currency mismatch, and concurrently changed product status between display and purchase.

#### F-15 — The live supplier purchase/recovery contract is explicitly unverified

- **Severity:** High
- **Confidence:** Confirmed
- **Category:** External integration / production readiness
- **Location:** `backend/apps/esims/supplier.py:20-25`, `181-215`, especially `191-195` and `212`
- **Evidence:** The source states that the exact `/esim/order` body and the lookup key used after duplicate-transaction recovery are unverified. The supplier has no sandbox, and the first real call spends wallet money.
- **Why this is a problem:** These fields are central to provisioning and unknown-outcome recovery—the area where a wrong assumption can either fail paid orders or buy twice.
- **Impact / failure or exploitation path:** The first real purchase may reject the assumed body; a timeout followed by duplicate recovery may query with an unsupported key. The outcomes are live provisioning failure, duplicate spend, unrecoverable jobs, and manual handling of paid customers.
- **Precise fix:** Do not launch broadly. Obtain written provider contract/examples, create a capped-wallet canary account, perform one controlled low-value order with end-to-end tracing, verify duplicate replay/query recovery, capture redacted fixtures, and add contract tests. Add a kill switch and alerting.
- **Simpler implementation:** A one-order canary and recorded contract fixture is preferable to speculative abstraction.
- **Suggested test:** Real canary tests for accepted request fields, delayed profile polling, timeout after provider acceptance, duplicate transaction replay, and query by each documented key.

### Medium

#### F-16 — Guest credential lookup relies on reusable order number plus email

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Sensitive data access
- **Location:** `backend/apps/orders/views.py:168-220`; `backend/apps/orders/services.py:277-278`
- **Evidence:** An unauthenticated caller who provides the 12-hex-character order suffix and matching email receives decrypted ICCID, activation, QR, and install URLs. Both identifiers are commonly present in email/support systems. Rate limiting is the main compensating control.
- **Why this is a problem:** Email is not a secret and order numbers are business identifiers, not purpose-built capabilities. Anyone obtaining a confirmation email, support screenshot, or logs can install the eSIM.
- **Impact / exploitation:** Credential theft and irreversible eSIM installation by a third party.
- **Precise fix:** Issue a separate high-entropy, revocable, expiring guest-access token stored hashed; require it for credential access; bind/rotate it after first reveal or account claim; retain strict audit and throttling. Avoid including the token in analytics/referrer logs.
- **Suggested test:** Order number+email alone fails; valid capability succeeds; expiry/revocation/replay behavior is enforced; logs/audit never contain it.

#### F-17 — Several audited mutations are not atomic with their audit event

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Audit integrity / transactions
- **Location:** Claim in `backend/apps/administration/audit.py:5-7`, `165-168`; examples `backend/apps/administration/admin_api/views.py:134-144`, `160-172`, `529-543`; `backend/apps/administration/agency_api/views.py:90-100`
- **Evidence:** `record_audit()` participates in a transaction only if the caller opened one. Several views call `serializer.save()`/payment service, then write audit in autocommit as a separate transaction. A failure can leave the action committed without its audit, contrary to the module guarantee.
- **Why this is a problem:** The implementation relies on caller transaction scope but several callers do not provide it, so the stated invariant is not enforced.
- **Impact / failure or exploitation path:** A database error during audit insertion can leave security/financial actions committed without the promised evidence; retries can duplicate non-idempotent actions.
- **Precise fix:** Put each local mutation and audit insert in the same `transaction.atomic()` service function. For external actions, audit intent/result as part of the durable outbox/state transitions rather than claiming remote atomicity.
- **Suggested test:** Force audit insertion failure for organization/profile/refund mutations and assert the local mutation rolls back or an auditable pending intent remains.

#### F-18 — Concurrent owner changes can leave an organization with no active owner

- **Severity:** Medium
- **Confidence:** Highly likely
- **Category:** Race condition / authorization integrity
- **Location:** `backend/apps/administration/services/members.py:33-51`, `63-71`, `93-101`, `147-162`
- **Evidence:** Each change locks only the target membership. With two active owners, concurrent transactions can lock different rows, each observe the other owner as active, pass `_guard_last_owner`, and then both demote/disable/delete.
- **Why this is a problem:** The invariant depends on a count across multiple rows, but the transactions serialize only one different row each.
- **Impact / failure or exploitation path:** Two simultaneous valid requests can both commit and orphan agency administration, requiring platform intervention.
- **Precise fix:** Lock the organization row (or all active-owner membership rows in a consistent order) before counting/changing owners. Keep the count and change in one transaction.
- **Suggested test:** A `TransactionTestCase` with two database connections concurrently disables/demotes the two owners; assert one transaction is rejected.

#### F-19 — Payment reconciliation mismatch status is rolled back

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Payments / error handling
- **Location:** `backend/apps/payments/services.py:91-99`, `132-136`
- **Evidence:** `_handle_succeeded()` marks the payment failed and immediately raises `PaymentMismatch` inside the surrounding `transaction.atomic()`. The exception rolls back the failure update; only the webhook row is later marked failed.
- **Why this is a problem:** The code intentionally records a reconciliation failure in the same transaction that the raised exception aborts.
- **Impact / failure or exploitation path:** A signed but mismatched event leaves `Payment` stale at `processing`, while only the webhook row records failure. Operators and automated remediation cannot rely on payment state.
- **Precise fix:** Return a typed reconciliation result and commit the local failed/quarantined state before returning a non-2xx response, or catch inside the transaction and use a separate committed state transition.
- **Suggested test:** Send a mismatched signed event and assert both webhook and payment persist a reconciliation-failed state after the request.

#### F-20 — Financial and operational reports mix scopes and overstate margin

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Reporting correctness
- **Location:** `backend/apps/administration/services/reports.py:43-141`, especially `49-58`, `77-89`, `128-140`; agency scope `163-215`
- **Evidence:** Requested date bounds apply to orders/refunds but not commission totals, eSIM totals, or operations. Margin ignores the date bounds entirely and includes full retail/wholesale for refunded orders. Agency date-bounded order figures are combined with all-time commission/payout totals. The result hard-codes currency `USD`.
- **Why this is a problem:** Metrics shown together as one period/currency dashboard do not share the same scope or refund treatment.
- **Impact / failure or exploitation path:** Selecting a narrow date range can still return all-time margin/commission/payout values, and refunded sales remain in margin. Finance/admin users can make decisions from internally inconsistent figures.
- **Precise fix:** Define cash vs accrual semantics, apply identical period/currency scope to each comparable metric, subtract allocated refunds from revenue/cost/margin, and label all-time operational counters separately.
- **Suggested test:** Orders and refunds spanning period boundaries, full/partial refunds, multiple currencies, and commissions/payouts outside the selected period.

#### F-21 — Missing database invariants and indexes leave financial rules to application code

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Database design / performance
- **Location:** `backend/apps/orders/models.py:135-216`, `314-339`; `backend/apps/accounts/models.py:157-218`; payout query `backend/apps/accounts/services.py:199-208`
- **Evidence:** Promo discount/commission values and limits lack general non-negative constraints; commission percentages are not DB-bounded to 10,000; payout/commission amounts lack positive/non-negative constraints. Promo per-customer checks filter `(promo_code, status, customer_email_hash)` but only `(promo_code, status)` is indexed. Payout selection uses `created_at__date`, preventing a normal timestamp range index from being used.
- **Why this is a problem:** Application validation can be bypassed by migrations, imports, admin code, or concurrent paths, while the query shapes do not match available indexes.
- **Impact / failure or exploitation path:** A faulty write can persist negative or out-of-range finance values. Viral promo and month-end payout queries increasingly scan irrelevant ledger rows as data grows.
- **Precise fix:** Add check constraints for all amount/limit/percentage invariants, a composite promo/customer/status index, useful organization/status/currency/created timestamp indexes, and filter with half-open datetime bounds instead of `__date`.
- **Expected improvement:** Promo lookup remains index-selective instead of scanning all redemptions for a promo. Payout selection can use a range index. Exact latency requires production-like `EXPLAIN (ANALYZE, BUFFERS)`.
- **Suggested test:** Migration constraint tests for negative/out-of-range values and query-plan tests on representative ledger volumes.

#### F-22 — Admin/custom list paths contain N+1 and unbounded responses

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Performance / memory / latency
- **Location:** `backend/apps/administration/admin_api/serializers.py:397-410` with `backend/apps/administration/roles.py:131-140`; unbounded responses at `backend/apps/administration/admin_api/views.py:341-343`, `473-486`, `725-741`; top-ups at `backend/apps/esims/views.py:62-72`
- **Evidence:** Pricing-aware serialization calls `has_platform_capability()` per row, which queries group names; a default 24-row plan page can add roughly 24 group queries unless explicitly cached. Password reset scans and decodes every live session (**O(S)**). Customer detail serializes every order; payout GET serializes every payout; top-up available/history is unpaginated, and history serializer reads `topup_product.name` without `select_related`, producing **1 + H** queries.
- **Why this is a problem:** Query and memory costs grow with the entire result/session set instead of a bounded page, and repeated permission/product lookups add avoidable database round trips.
- **Impact / failure or exploitation path:** High-volume tenants or session tables make privileged endpoints slow and memory-heavy; a password reset can become a long request, and repeated requests can tie up web workers.
- **Precise fix:** Resolve capabilities once per request/serializer context; use server-side session indexing or user session tracking; paginate every growing collection; add `select_related("topup_product")`; cap export/detail expansions.
- **Expected improvement:** Plan capability checks drop from O(page size) queries to O(1); top-up history drops from 1+H to one joined query; memory becomes O(page size). Benchmarks are still required.
- **Suggested test:** Query-count assertions as page/history size grows and response-size/load tests for high-order customers/payout history.

#### F-23 — Usage refresh performs a 30-second-capable supplier call in web requests

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Latency / blocking I/O
- **Location:** `backend/apps/esims/views.py:45-53`; admin equivalent `backend/apps/administration/admin_api/views.py:607-615`; timeout `backend/config/settings.py:214`; Gunicorn command `backend/Dockerfile:16`
- **Evidence:** Refresh calls the synchronous supplier client directly. Supplier timeout defaults to 30 seconds. The supplied Gunicorn command does not set a shorter or longer worker timeout; the installed Gunicorn 26.0.0 reports a 30-second default.
- **Why this is a problem:** A user-facing synchronous worker remains occupied for the full external-network wait and cannot serve another request.
- **Impact / failure or exploitation path:** A slow supplier can tie up each web worker for up to the configured provider timeout; enough authenticated refreshes reduce availability, and a worker can be killed near the server timeout.
- **Precise fix:** Queue refresh jobs and return `202`, cache last known usage, enforce freshness intervals, and use connect/read timeouts below the request budget. Apply per-user/per-profile coalescing.
- **Suggested test:** Supplier delay/timeout load test with concurrent refreshes; assert web latency stays bounded and one refresh per profile is queued.

#### F-24 — Invalid webhook traffic creates an unbounded database write stream

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Availability / logging
- **Location:** `backend/apps/payments/services.py:59-73`; webhook view `backend/apps/payments/views.py:29-36`
- **Evidence:** Every invalid signature creates a unique `WebhookEvent` row using random bytes. The webhook endpoint has no throttle scope and no retention/aggregation policy.
- **Why this is a problem:** Authentication failure is converted into an unbounded durable write, so the cheapest public failure path consumes a shared database resource.
- **Impact / exploitation:** Public invalid requests can consume database I/O/storage and flood operational dashboards. Edge rate limits may exist externally, but none are defined in this repository.
- **Precise fix:** Reject invalid signatures without a durable row per request; emit a sampled metric/log, apply edge request/body-size limits, and retain only bounded aggregates or sampled forensic events.
- **Suggested test:** High-rate invalid-signature load test; assert database row count remains bounded and legitimate Stripe delivery is unaffected.

#### F-25 — Dependencies and builds are not reproducible or continuously vulnerability-scanned

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Supply chain / deployment
- **Location:** `backend/pyproject.toml:10-22`; `backend/Dockerfile:9-10`; `.github/workflows/ci.yml:12-38`
- **Evidence:** Most dependencies have only lower bounds; several have no upper bound. No lock/constraints file or hashes exist. Docker upgrades pip and resolves dependencies during every build. CI has no backend dependency audit. The installed environment was consistent, but an external vulnerability query could not be completed during this audit.
- **Why this is a problem:** Dependency resolution happens at build time against a changing package index without a reviewed immutable package graph.
- **Impact / failure or exploitation path:** Identical source commits can build different dependency sets; a newly released incompatible or vulnerable direct/transitive dependency can enter production without review.
- **Precise fix:** Generate a reviewed, hashed lock/constraints file for Python 3.13; install with hashes; update via controlled automation; run `pip-audit` (or equivalent), SBOM generation, and image scanning in CI. Pin base image by digest and define patch cadence.
- **Suggested test:** Two clean builds must produce the same package inventory/SBOM; CI fails on lock drift and policy-defined advisories.

#### F-26 — Catalogue import can unexpectedly remove live availability

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Catalogue operations / availability
- **Location:** `backend/apps/catalog/management/commands/import_catalog.py:56-59`, `305-334`; synchronous API trigger `backend/apps/administration/services/catalogue.py:153-166`
- **Evidence:** `_import_status()` maps source `active` and any unrecognized value to `paused`; `update_or_create` overwrites every existing plan status. Reimporting a live catalogue can pause plans. The admin endpoint runs the whole workbook import synchronously.
- **Why this is a problem:** Import facts and operator-controlled merchandising state share one overwritten field, and a batch operation runs inside request latency.
- **Impact / failure or exploitation path:** A routine catalogue refresh can pause active products and remove them from sale; a large or malformed workbook occupies a web worker and may hold a long transaction.
- **Precise fix:** Separate supplier facts from platform merchandising state. Preserve current active/paused state on existing plans unless a deliberate activation operation changes it; only force `retired` for withdrawn products. Run import as a job with preview/diff and approval.
- **Suggested test:** Start with active plans, reimport unchanged source, assert availability is preserved; preview and approve supplier removals; test rollback on malformed rows.

#### F-27 — Production TLS hardening is incomplete

- **Severity:** Medium
- **Confidence:** Confirmed
- **Category:** Transport security / configuration
- **Location:** `backend/config/settings.py:83-86`, `181-189`
- **Evidence:** PostgreSQL defaults to `sslmode=require`, which encrypts but does not require full hostname/CA verification. HSTS defaults to `0`; the production deploy check reported the HSTS warning. Proxy HTTPS trust is configured but the repository does not define a trusted proxy/network boundary.
- **Why this is a problem:** Encryption without server-identity verification does not fully authenticate the database endpoint, while forwarded-protocol trust is safe only behind a correctly configured trusted proxy.
- **Impact / failure or exploitation path:** A misrouted/intercepted database connection may not reject an unexpected server identity, and browser downgrade protection is absent unless deployment overrides HSTS correctly.
- **Precise fix:** Use `verify-full` with managed CA roots where supported; set HSTS only after validating all domains/subdomains; document a proxy that strips client-supplied forwarding headers and sets them itself.
- **Suggested test:** Connection to an invalid DB certificate/hostname fails; direct spoofed `X-Forwarded-Proto` is not trusted; staging HSTS rollout is verified before preload.

### Low

#### F-28 — Registration explicitly enables email enumeration

- **Severity:** Low
- **Confidence:** Confirmed
- **Category:** Authentication privacy
- **Location:** `backend/apps/accounts/serializers.py:30-33`
- **Evidence:** Registration returns “An account with this email already exists.”
- **Why this is a problem:** A public unauthenticated response reveals whether a normalized email is registered.
- **Impact / failure or exploitation path:** Attackers can submit candidate addresses and identify customer/agency accounts for phishing or credential stuffing. Login itself uses a generic error.
- **Precise fix:** Return a generic registration response or use a verify-email/claim flow. Preserve a unique constraint and handle the race without exposing existence.
- **Suggested test:** Existing and new emails produce indistinguishable public responses/timing within practical tolerances.

#### F-29 — Documentation and configuration examples are materially out of sync

- **Severity:** Low
- **Confidence:** Confirmed
- **Category:** Maintainability / deployment
- **Location:** `backend/README.md` references missing `../esim_backend_design.md`; `backend/.env.example:19-25`; supplier default commentary `backend/config/settings.py:215-217`
- **Evidence:** The authoritative design file is absent from the repository inventory. The example includes unused email variables while omitting required production cache configuration. The supplier comment says it stays fake unless explicitly switched, while the default auto-selects real when an API key is present.
- **Why this is a problem:** Deployment documentation and executable settings describe different required variables and different money-spending defaults.
- **Impact / failure or exploitation path:** Operators can follow the documented path and still fail startup, leave email unconfigured, or unintentionally select the real supplier.
- **Precise fix:** Make one maintained production configuration table generated/tested against settings; remove unused variables; correct gateway behavior text; restore or remove missing design references.
- **Suggested test:** CI parses the example environment, supplies non-secret fixtures, and boots production settings; documentation links are checked.

## 7. Security findings index

- **Critical:** F-01 secret-bearing Docker context
- **High:** F-03 allauth policy bypass; F-08 fake-provider fail-open; F-09 read-only retry authority; F-10 arbitrary agency enrollment; F-13 rotation/data-access failure
- **Medium:** F-16 guest secret-access capability; F-17 audit atomicity; F-24 invalid webhook write amplification; F-27 TLS hardening
- **Low:** F-28 account enumeration

Positive evidence: session cookies are HttpOnly/Secure in production mode; CSRF middleware and DRF SessionAuthentication are present; admin/agency endpoints default-deny missing capabilities; tenant queries are generally scoped; Google linking requires a verified email; audit redaction covers named secrets and raw binary values.

## 8. Payment findings index

- **Critical:** F-02 provider refund/local commit split and unstable idempotency
- **High:** F-04 promo ledger can be bypassed after failed-then-success payment; F-05 incomplete refunds/disputes/cancellation state machine; F-11 tax absent
- **Medium:** F-19 mismatch state rolls back; F-20 financial reports mis-scope margin/refunds; F-21 missing finance constraints/indexes

Positive evidence: client totals are ignored; minor-unit integers are used; payment IDs/event IDs/idempotency keys are unique; Stripe signature verification is present; successful payment reconciles amount, currency, and order metadata; duplicate success handling locks payment/order and is idempotent for provisioning/notifications under normal execution.

## 9. Performance and latency findings index

- F-07: 1+N checkout catalogue reads, O(Q) request memory, and per-unit webhook writes
- F-21: promo/payout index and non-sargable date filtering
- F-22: per-row capability queries, 1+H top-up history, O(S) session scan, unbounded custom lists
- F-23: synchronous supplier network call in request path
- F-24: public invalid webhook traffic creates durable writes
- F-26: synchronous workbook import in a web request

No production latency numbers are claimed. Complexity/query findings are proven by code structure; actual milliseconds, memory ceilings, and query plans require staging benchmarks with representative PostgreSQL data.

## 10. Database findings index

- Good use of UUID primary keys, foreign keys, protected immutable history, partial unique constraints, money/status checks, and `SKIP LOCKED`.
- F-02/F-17: database atomicity cannot encompass external actions and is not consistently used for audit.
- F-18: owner-count invariant is race-prone.
- F-21: incomplete finance constraints and supporting indexes.
- F-07: one-row-per-unit model needs an aggregate quantity bound.
- The `updated_at` trigger migrations currently cover existing timestamped tables, but future new tables require an explicit trigger refresh; add a migration helper/test rather than relying on manual awareness.

## 11. Reliability and production-risk findings index

- F-05 incomplete provider reconciliation
- F-06 stuck jobs and worker-wide failure
- F-08 configuration fail-open
- F-12 incomplete release/web/worker/email deployment
- F-13 key rotation
- F-14 invalid sellability/top-up eligibility
- F-15 unverified supplier contract
- F-17 audit consistency
- F-26 import availability regression
- F-29 configuration/documentation drift

## 12. Overcomplicated code and simplification opportunities

1. **Gateway selection:** Replace implicit fallback expressions with explicit validated enums and production assertions.
2. **Payment/refund orchestration:** Move provider work to a small durable outbox state machine. This is simpler to reason about than holding database locks across network calls and adding ad hoc retry branches.
3. **Promo lifecycle:** Model attempt failure separately from order/promo cancellation. Releasing reservations on every failed attempt creates unnecessary transition complexity.
4. **Capability checks:** Resolve platform roles once on the request; do not query groups from every serializer row.
5. **Membership policy:** Separate account type/auth policy from tenant membership. A membership row should not globally redefine how a user can authenticate.
6. **Catalogue state:** Keep supplier facts and platform merchandising status in separate fields so imports cannot silently alter sellability.
7. **Reports:** Use one explicit report scope object (period, currency, accounting basis) passed to every aggregate.
8. **Encryption:** Load a real versioned key ring rather than exposing a mapping abstraction backed by only one key.
9. **Jobs:** One reusable lease/claim/retry helper can serve supplier and notification rows and remove duplicated, inconsistent crash behavior.

## 13. Testing gaps

The 311 passing tests cover many normal and authorization paths, but the highest-risk gaps are:

1. Stripe success followed by DB commit/audit/HTTP failure during refund.
2. Stable API idempotency across repeated refund requests.
3. Async refund, dispute, chargeback, cancellation, and reconciliation flows.
4. Failed PaymentIntent followed by success with a limited promo.
5. Concurrent duplicate webhook delivery in separate DB transactions/processes.
6. Worker kill after claim/provider action and stale lease recovery.
7. Unexpected provider/encryption/database exception followed by processing of the next job.
8. django-allauth reset/change routes for agency users.
9. Agency invitation consent and impact on an existing customer's auth.
10. Read-only role attempting supplier/notification retry.
11. Unknown/fake gateway names under production settings.
12. Aggregate cart limits, checkout query count, and webhook latency at maximum accepted size.
13. Two concurrent last-owner mutations.
14. Multiple partial refunds.
15. Refund of already fulfilled eSIM/top-up and supplier cancellation/financial-loss policy.
16. Disabled supplier and incompatible top-up/base-plan/profile states.
17. Real supplier canary/contract and duplicate-recovery lookup.
18. Encryption key rotation and partial re-encryption recovery.
19. Docker layer secret scanning and reproducible image/SBOM.
20. Empty staging deployment including migration, static, worker, cache, email, and readiness.
21. Tax jurisdiction/rounding/refund cases.
22. Period/currency/refund-correct reporting fixtures.
23. Query-count and response-size tests for admin custom APIViews.
24. Invalid webhook flood and retention.

## 14. Deployment risks

The current repository is not a deployable production definition:

- A build can embed `.env` and `.venv`.
- The image is not reproducible and runs as the base image's default root user.
- There is no migration/static release phase.
- There is no worker/scheduler deployment or worker health signal.
- No backend CI gate exists in the current workflow.
- No real email transport is configured by settings.
- The required shared cache variable is missing from the example.
- HSTS and DB identity verification are incomplete.
- Provider fake/real selection fails open.
- Real supplier purchase/recovery fields remain unverified.
- Dependency vulnerability status is unknown because the external advisory query was blocked.

## 15. Prioritized remediation plan

### P0 — Before any image is built or pushed

1. Add `.dockerignore`; remove secrets from build context; rotate any secret that may have entered an image/cache.
2. Make fake gateways impossible and unknown names fatal in production.
3. Implement stable refund request idempotency and outbox/reconciliation before enabling refunds.
4. Disable/restrict allauth password reset/change routes for agency accounts.

### P1 — Before processing real money

5. Complete Stripe refund/dispute/cancellation state machine and reconciliation.
6. Fix failed-then-success promo accounting and add reservation expiry/cancellation.
7. Add aggregate cart bounds and defer provisioning enqueue outside webhook response/transaction.
8. Add job leases, stale recovery, per-job exception containment, and supervised worker deployment.
9. Split `VIEW_OPS` from supplier retry authority.
10. Require accepted agency invitations and decouple membership from global auth policy.
11. Decide and implement tax policy.
12. Implement a versioned encryption key ring and rotation runbook.

### P2 — Before broad customer launch

13. Validate supplier contract with a capped canary and add contract fixtures.
14. Enforce supplier/plan/top-up/profile eligibility.
15. Replace guest email/order-number credential access with a hashed expiring capability.
16. Make audited local mutations atomic.
17. Add backend CI, locked dependencies, advisory/image scans, release migrations/static, worker/scheduler, cache, email, and health monitoring.
18. Correct reporting scope/refund/margin semantics.

### P3 — Scale and hardening

19. Add database invariants/indexes and run representative `EXPLAIN ANALYZE`.
20. Fix per-row permission queries, session scan, N+1 top-up history, and unbounded admin responses.
21. Move usage refresh and catalogue import to jobs.
22. Bound invalid webhook telemetry and define retention.
23. Harden HSTS, trusted proxy, and DB certificate verification.
24. Remove email enumeration and repair documentation/config drift.

## 16. Final production-readiness verdict

The backend demonstrates thoughtful security and correctness work, and its passing test suite is a meaningful asset. However, confirmed secret exposure in the container build and non-atomic, retry-unsafe refunds alone prohibit production use. The additional High findings create credible paths to authentication-policy bypass, fake fulfillment, promo abuse, stuck paid orders, unauthorized supplier retries, data loss after key rotation, tax undercollection, and deployment without the worker needed to fulfill purchases.

**Unsafe for production**
