# eSIMFlys — Frontend Build Guide

**For:** the engineer building the eSIMFlys frontend system.
**Backend status:** complete and tested (248 tests), running locally on `:8000`, currently
wired to stand-ins for Stripe, the eSIM supplier, and email. **The API contract will not
change** when those go live — you can build everything today.

---

## 1. What you are building

Three separate surfaces on one backend:

| # | Surface | Who uses it | Auth |
|---|---|---|---|
| **A** | **Storefront** | the public / travellers | guest + optional account |
| **B** | **Platform admin panel** | you and internal staff | staff account + role |
| **C** | **Travel agency panel** | travel agencies | agency account + role |

They can live in one Next.js app (route groups) or separate apps. **Recommendation: one app,
three route groups** — they share the API client, auth, and design tokens, and the admin
surfaces are small.

---

## 2. Read these first (in order)

| Document | What it gives you |
|---|---|
| `backend/docs/API.md` | Storefront API — every endpoint, **real captured payloads**, auth flow, error codes |
| `backend/docs/ADMIN_API.md` | Both admin APIs, role→permission matrix, tenancy rules |
| `esim_frontend_design.md` | Visual/product spec for the storefront |
| `backend/README.md` | How to run the backend locally |

Both API docs contain **real responses captured from the running server**, not invented
examples. Trust them over any assumption.

---

## 3. Current state of the repo

**Stack already in place** (`esim/frontend`): Next.js **16.2.10**, React **19.2.4**,
Tailwind **v4**, Radix UI, embla-carousel, lucide-react, react-hook-form, zod, zustand.

**~24 routes already exist** — marketing pages, `/destinations`, `/esim/[slug]`, auth
screens, `/checkout`, `/account/esims`, help/legal.

**⚠️ But none of it talks to the backend.** The storefront renders from a static
`data/catalog.json`. There is **no API client, and no proxy configured** in
`next.config.mjs` (only redirects). Wiring it up is job one.

> Note: `data/catalog.json` is **stale** — it lacks the curated `homepage_badge` and
> `sort_order` that the API returns. Treat the API as the source of truth and retire the JSON.

---

## 4. ⚠️ The one architectural decision — make it before writing code

The backend uses **session cookies (`HttpOnly`, `SameSite=Lax`)**, not JWTs. This is
deliberate and won't change.

**The problem:** a `fetch()` from `localhost:3000` to `localhost:8000` is cross-origin, so
the browser won't send the session cookie. Login will appear to "work" and then every
subsequent call comes back unauthenticated.

**The fix — proxy the backend under the frontend's own origin:**

```js
// next.config.mjs
async rewrites() {
  return [
    { source: "/api/v1/:path*",  destination: "http://127.0.0.1:8000/api/v1/:path*" },
    { source: "/accounts/:path*", destination: "http://127.0.0.1:8000/accounts/:path*" },
  ];
}
```

Then call `/api/v1/...` (relative). The browser only ever talks to `:3000`, the cookie is
same-site, CSRF works, and CORS becomes irrelevant. Use the same pattern in production
(reverse proxy / same domain).

**Do not** solve this by adding JWTs — the backend deliberately doesn't store auth tokens in
browser-accessible storage.

### Auth client essentials
```js
// once on app boot — sets the csrftoken cookie
await fetch("/api/v1/auth/csrf/", { credentials: "include" });

const csrf = () =>
  document.cookie.split("; ").find(c => c.startsWith("csrftoken="))?.split("=")[1];

// every request
fetch(url, {
  credentials: "include",                                  // ← required on ALL calls
  headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() }, // unsafe methods
});
```

**Server Components:** anything authenticated must forward the incoming cookies, or be
fetched client-side. Public catalogue data is fine to fetch server-side (great for SEO).

---

## 5. Five rules that will bite you if you skip them

1. **All payable money is an integer in minor units.** `1699` = **$16.99**. Always divide by
   100 for display. The only exceptions are `price_from` and `price_per_day`, which arrive
   pre-formatted as `{"amount": "0.57", "currency": "USD"}`.

2. **The catalogue is empty by default.** All 385 plans ship `paused`, and the API only
   returns *active* ones. You'll get 68 countries with `price_from: null` and empty plan
   lists. **This is correct, not a bug.** Ask the backend team to run
   `python manage.py activate_demo_catalog` so you have data. **Design a real empty state** —
   it's the production default until plans are switched on.

3. **List shapes are inconsistent.** Some endpoints return a plain array, others a paginated
   envelope. Check `API.md` per endpoint.
   - Plain array: `/catalog/countries/`, `/catalog/countries/{slug}/plans/`
   - `{count, next, previous, results}`: `/orders/`, `/esims/`, all admin lists

4. **Guest carts use a token returned once, in a response header.** The first
   `POST /cart/items/` returns `X-Cart-Token`. Persist it (localStorage) and send it back on
   every later cart/checkout call. Miss it and the guest's cart vanishes.

5. **Payment truth comes from the server, not the browser.** After payment, **poll** until
   `payment_status === "paid"`, then until `fulfillment_status === "delivered"`, before
   showing the eSIM. Never mark an order paid from a client-side callback.
   **Use the right endpoint for the buyer:**
   - **logged in** → `GET /orders/{id}/`
   - **guest** → `POST /orders/lookup/` with `{order_number, email}`. `GET /orders/{id}/`
     returns **403** for guests — the cart token does *not* grant access. Verified E2E.

---

## 6. Surface A — Storefront

### Pages → endpoints

| Page | Endpoints |
|---|---|
| Home | `GET /catalog/countries/` (popular + `homepage_badge`) |
| `/destinations` | `GET /catalog/countries/` |
| `/esim/[slug]` | `GET /catalog/countries/{slug}/` + `/plans/` |
| Cart | `GET /cart/`, `POST/PATCH/DELETE /cart/items/…` |
| Checkout | `POST /cart/promo-code/` (preview), `POST /checkout/` |
| Payment | `POST /payments/payment-intent/` |
| Confirmation | poll `GET /orders/{id}/` (logged in) or `POST /orders/lookup/` (guest) |
| `/account/esims` | `GET /esims/`, `GET /esims/{id}/`, `POST /esims/{id}/refresh-usage/` |
| Order lookup (guest) | `POST /orders/lookup/` |
| Auth | `/auth/register|login|logout`, `/account/me/`, password reset |

### The purchase flow
```
browse → GET /catalog/countries/{slug}/plans/
add    → POST /cart/items/            ← save X-Cart-Token
promo  → POST /cart/promo-code/       (preview only — resend the code at checkout)
buy    → POST /checkout/              → order (pending_payment)
pay    → POST /payments/payment-intent/ → client_secret
         (if response has zero_total:true → skip payment entirely, already paid)
confirm→ poll GET /orders/{id}/       → payment_status "paid" → fulfillment_status "delivered"
         (guest? poll POST /orders/lookup/ instead — /orders/{id}/ is 403 without a session)
show   → GET /esims/{id}/  (or POST /orders/lookup/ for guests) → render qr_payload as a QR
```

### Detail that matters
- **Plan types:** `fixed` → show `data_limit_mb` (total). `daily` → show
  `daily_high_speed_mb` per day plus `day_count`. Data is in **MB** (1 GB = 1000 MB), but
  eSIM *usage* is in **bytes** — don't mix them.
- `is_default_selected` marks the plan to pre-select on a country page (exactly one per country).
- `hotspot_supported: null` means **unknown** — render "unknown", not "no". It's null for
  every plan right now.
- **Guest order lookup returns the QR** — build a "find my order" page (order number + email).
- **"Continue with Google"** is a full-page redirect, not a fetch:
  `<a href="/accounts/google/login/">`. It returns to `FRONTEND_BASE_URL/account`; then call
  `/account/me/`. Use `localhost`, not `127.0.0.1`, or Google rejects the redirect.

---

## 7. Surface B — Platform admin panel

Namespace `/api/v1/admin/`. Full reference + payloads in `backend/docs/ADMIN_API.md`.

| Screen | Endpoints |
|---|---|
| Dashboard | `GET /admin/dashboard/`, `/admin/reports/revenue/` |
| Agencies | `GET/POST /admin/organizations/`, `GET/PATCH …/{id}/` |
| Agency detail | members, tracking-codes, lifecycle actions |
| Orders | `GET /admin/orders/` + `/{id}/` (items, payments, eSIMs) |
| Customers | `GET /admin/customers/` + `/{id}/` |
| Payments / refunds | `GET /admin/payments/`, `/admin/refunds/`, `POST /admin/orders/{id}/refunds/` |
| eSIMs | `GET /admin/esims/`, `POST …/reveal/`, `POST …/refresh-usage/` |
| Operations | `GET /admin/supplier-events/`, `/admin/notifications/` + retry actions |
| Audit log | `GET /admin/audit-events/` |

### Build notes
- **Roles change what exists, not just what's clickable.** The `margin` block is **absent**
  from the dashboard response for non-pricing roles — code for its absence, don't assume the
  key. A finance admin gets `403` on eSIM reveal; support gets `403` on refunds.
- **Lifecycle = actions, not field edits.** `PATCH {"status": "active"}` is silently ignored.
  Use `POST /admin/organizations/{id}/approve|suspend|activate|reject|close/`. Suspend
  **requires** a `reason`. Illegal moves return `409 invalid_status_transition` — surface the
  message, it explains which transitions are allowed.
- **Credential reveal is an explicit button**, never auto-loaded. It's separately permissioned,
  limited to 10/hour, and audited.
- **Retry is state-dependent** — retrying a `succeeded` supplier job returns `409` (it could
  buy a second eSIM). Only offer retry on `failed`/`manual_review`/`retrying`.
- **Audit log is read-only** — `POST`/`DELETE` return `405`.

### ⚠️ Two screens have no API yet
**Catalogue management** (activate/pause plans, edit prices, countries) and **commission
approval / payouts** are not built on the backend. Leave placeholders and coordinate — don't
design around endpoints that don't exist.

---

## 8. Surface C — Travel agency panel

Namespace `/api/v1/agency/{organization_id}/`. **Reporting only.**

| Screen | Endpoint |
|---|---|
| Dashboard | `GET …/dashboard/` |
| Sales | `GET …/sales/` |
| Commissions | `GET …/commissions/` |
| Payouts | `GET …/payouts/` |
| Tracking codes | `GET …/tracking-codes/` (read-only) |
| Profile | `GET/PATCH …/profile/` |
| Staff | `GET/POST …/members/`, `PATCH/DELETE …/members/{id}/` |
| Reports | `GET …/reports/revenue/` |
| Activity | `GET …/activity/` |

### The business model (so the UI makes sense)
The platform gives an agency a **referral tracking code**. The agency passes it to customers.
The **customer buys on the public website and pays full price — the code gives no discount.**
It only attributes the sale so the agency earns commission (default **20%**).

### Non-negotiable UI constraints
- **There is no customer data.** The sales payload has **no `customer_email` field at all**.
  Don't build a customer column, search, or detail view — there is nothing behind it. This is
  a privacy rule, not an oversight.
- **Agencies never see eSIM credentials.** There is no agency eSIM endpoint.
- **Commission rate and status are read-only.** Render them disabled; writes are ignored.
- **Agencies cannot issue their own codes** — the platform issues them.
- **404 means "not yours or doesn't exist"** — the two are intentionally indistinguishable.
  Show a generic not-found, never "you don't have permission to view agency X".
- Show **`net_minor`** (`commission_minor − reversed_minor`) as the headline number — a refund
  claws commission back.
- Get the user's organizations from `GET /api/v1/organizations/`; if they belong to more than
  one, build a tenant switcher.

### Roles
`owner` (everything) · `admin` (all but pricing) · `buyer` (read + future purchasing) ·
`viewer` (read-only). A user may only grant roles **below** their own, and the last active
owner cannot be demoted or removed (`409 last_owner_protected`).

---

## 9. Errors — one shape everywhere

```json
{ "error": { "code": "plan_unavailable", "message": "…", "fields": {} } }
```
Render `message`; branch on `code`; `fields` holds per-field validation errors. Build one
error mapper in the API client. Codes worth handling specially:

| Code | Meaning |
|---|---|
| `validation_error` (400) | show `fields` inline on the form |
| `authentication_required` / `permission_denied` | redirect to login / show "no access" |
| `not_found` (404) | also means "another tenant's" on agency routes |
| `plan_unavailable` (409) | catalogue changed — refresh |
| `cart_expired` (409) | start a new cart |
| `payment_already_completed` (409) | go to confirmation |
| `rate_limited` (429) | back off, friendly message |

**Rate limits:** login 10/min · checkout 30/min · payment 30/min · promo 30/min ·
order lookup 10/min · admin 60/min · agency 120/min · credential reveal **10/hour**.

---

## 10. What's stubbed today

| Area | Reality |
|---|---|
| **Payments** | fake gateway — `client_secret` is a stub (`pi_fake_…`). **Do not pass it to Stripe.js yet.** Build the flow; swap in Elements when real keys land. |
| **eSIM provisioning** | fake supplier — real encryption and worker, generated ICCID/QR |
| **Email** | prints to the server console |
| **Plans** | all paused until activated |

None of this changes the API contract. Build against it now.

---

## 11. Suggested build order

1. **Proxy + API client + auth** (§4) — everything depends on it. Prove login → `/account/me/`
   → logout works with cookies.
2. **Storefront catalogue** — migrate `/destinations` and `/esim/[slug]` off `catalog.json`.
   Includes the empty-catalogue state.
3. **Cart → checkout → order** — including the `X-Cart-Token` guest flow.
4. **Payment + confirmation polling + eSIM QR display** + guest order lookup.
5. **Account area** — my eSIMs, usage, profile, password reset, Google sign-in.
6. **Agency panel** — smallest surface, high value, read-mostly.
7. **Platform admin panel** — largest; dashboard and orders first.

## 12. Definition of done for each screen

- Loading, empty, and error states — **including the empty catalogue**
- Money formatted from minor units; no raw integers on screen
- All calls send `credentials: "include"`; unsafe methods send `X-CSRFToken`
- Server errors render `error.message`, never a raw stack or `[object Object]`
- Role-gated UI hides what the user can't do **and** handles the `403`/`404` if they try
- Mobile-first; matches `esim_frontend_design.md`

## 13. Local setup

```bash
# backend (terminal 1 + 2)
cd esim/backend && source .venv/bin/activate
python manage.py migrate
python manage.py activate_demo_catalog     # REQUIRED or the catalogue is empty
python manage.py runserver 8000
python manage.py process_jobs              # separate shell — provisions eSIMs, sends email

# frontend
cd esim/frontend && npm run dev            # :3000, with the rewrites from §4
```

Ask the backend team for a staff account (admin panel) and an agency membership (agency
panel) — both are created through Django admin at `http://localhost:8000/admin/`.

---

## Questions to raise early

1. One Next.js app with route groups, or separate apps per surface?
2. Same-origin proxy in production — reverse proxy, or subdomain + shared cookie domain?
3. Should the agency panel show a **masked** customer email (`j***@gmail.com`)? Currently it
   shows none. Backend change, decide before designing the sales table.
4. Catalogue management and commission approval screens have **no API yet** — sequence with
   the backend team.
