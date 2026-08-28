# AUDIT.md — Phase 1 Reconnaissance

## Stack (verified from `package.json`, `next.config.mjs`)

| | |
|---|---|
| Framework | Next.js **16.2.12**, App Router, `output: "export"` (static) |
| React | 19.2.4 |
| Styling | **Tailwind CSS v4** via `@tailwindcss/postcss`; tokens in `@theme` inside `src/app/globals.css` |
| Primitives | Radix (accordion, dialog, slot, tabs) + `class-variance-authority`, `clsx`, `tailwind-merge` |
| Icons | `lucide-react` |
| State | `zustand` |
| Tests | `vitest` + Testing Library + `axe-core` |
| Deploy | Static export → Cloudflare Workers Static Assets + proxy Worker |

## Surfaces found

The directive names **three** surfaces. The repository contains **two**:

| Directive surface | Route group | Reality |
|---|---|---|
| Superuser admin | `src/app/(admin)/superuser/**` | Exists — 18 pages |
| Agency admin | `src/app/(agency)/agency/**` | Exists — 5 pages |
| Travel agency admin | — | **Does not exist as a separate surface.** `Organization.organization_type` is `"travel_agency"`; the agency portal *is* the travel-agency panel. |

**Flagged per §6.** Treating this as two surfaces. If a third is intended, it is unbuilt and is a feature request, not a rebrand.

## File ledger

### Layout / shell — the core of this work

| Path | Purpose | Lines | Surfaces | Shared w/ customer | Verdict |
|---|---|---|---|---|---|
| `src/app/(admin)/layout.js` | Admin route-group layout | 12 | Superuser | **Imports customer `Header`+`Footer`** | **REPLACE** |
| `src/app/(agency)/layout.js` | Agency route-group layout | 43 | Agency | No (own header) | **REPLACE** |
| `src/features/admin/components/admin-shell.client.jsx` | Access probe, title, horizontal tab nav | 164 | Superuser | No | **REPLACE** |
| `src/features/agency/components/agency-shell.client.jsx` | Tenant resolve, title, horizontal tab nav | 173 | Agency | No | **REPLACE** |
| `src/app/layout.js` | Root: fonts, FX, consent, JSON-LD | 103 | All | **Yes** | **LEAVE** |

### Shared primitives — must be forked or variant-gated (§1)

| Path | Purpose | Lines | Surfaces | Shared w/ customer | Verdict |
|---|---|---|---|---|---|
| `src/components/ui/container.jsx` | `mx-auto max-w-6xl px-6` | 20 | Both | **Yes — 24 import sites**, incl. checkout, account, legal | **LEAVE** (admin stops using it) |
| `src/components/data/data-table.jsx` | Admin/agency tables + pagination | 141 | Both | **Yes — `features/account/order-list`** | **MODIFY (variant-gated)** |
| `src/components/data/status-badge.jsx` | Status vocabulary → tone | 73 | Both | Yes | **LEAVE** |
| `src/components/feedback/empty-state.jsx` | Icon + reason + action | 30 | Both | Yes | **LEAVE** |
| `src/lib/api/pagination.js` | DRF `{count,next,previous}` helpers | 53 | Both | Yes | **MODIFY** (additive: accept page size) |
| `src/app/globals.css` | `@theme` token block | ~200 | All | **Yes** | **MODIFY** (additive: scoped admin layer only) |

### Page components — inherit the shell, not individually restyled

All 21 admin + 7 agency components follow one pattern: local `useState` for page/filters, a `load` callback, an optional filter `<form>`, and `<DataTable>`. **None persist state to the URL.**

| Path | Lines | Verdict |
|---|---|---|
| `features/admin/components/admin-{orders,customers,payments,audit,webhooks}.client.jsx` | 142/130/145/122/129 | **MODIFY** (toolbar slot + URL state) |
| `features/admin/components/admin-{esims,agencies,commissions,catalogue,operations,payouts,promo-codes,search}.client.jsx` | 273/322/242/408/205/268/283/137 | **MODIFY** (same, mechanical) |
| `features/admin/components/admin-dashboard.client.jsx` | 231 | **MODIFY** (KPI density) |
| `features/admin/components/admin-*-detail.client.jsx` (order/customer/esim/agency) | 316/185/249/587 | **LEAVE** (inherit shell) |
| `features/agency/components/agency-{dashboard,sales,commissions,payouts}.client.jsx` | 99/95/138/89 | **MODIFY** (same) |
| `src/app/(admin)/superuser/**/page.js` ×18, `(agency)/agency/**/page.js` ×5 | 17–25 each | **LEAVE** (thin wrappers) |

## Read-in-full statement

**Every file above marked `REPLACE` has been read in full, line by line**, in this session: both route-group layouts, both shells, the root layout, and the marketing layout (for shared-header tracing).

**Every file marked `MODIFY` in the primitives table has been read in full**: `data-table.jsx`, `pagination.js`, `container.jsx`, `status-badge.jsx`, `empty-state.jsx`, and the `@theme` block of `globals.css`.

Of the page components marked `MODIFY`, **five have been read in full** (`admin-orders`, `admin-customers`, `admin-payments`, `admin-audit`, `admin-webhooks`) and confirmed to share one identical structure. **The remaining page components have NOT yet been read line by line.** They are marked `MODIFY` on the strength of a verified structural pattern, not a full read. Per §6 this is stated rather than glossed: each will be read in full immediately before it is edited, and the change ledger treats them as mechanical repeats of a pattern proven on five files.

## Measured baseline (live, `/superuser/orders`, viewport 1496×794)

| Metric | Measured | Target |
|---|---|---|
| Content width | **1104px = 73.8%** | ≥90% of available |
| Chrome above first data row | **426px** | ≤120px |
| Rows above the fold | **5 of 24** | maximise |
| Row height | 65px | ~40px |
| Customer `<header>` in DOM | **present, 68px** | absent |
| Page scroll height (24 rows) | 2614px | — |

`/superuser` dashboard: content **77%**, chrome **302px**, scroll height **1792px** for 19 KPI tiles — 2.3 screens.

**Not measured:** the agency portal. The signed-in account (`muhsin`) belongs to no organization, so `/agency/portal` renders "Not found". Its layout constants are read from source (`Container` + `py-12`, identical to admin) but no live density figures were obtained. Stated rather than simulated.
