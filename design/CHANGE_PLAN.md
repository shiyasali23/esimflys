# CHANGE_PLAN.md — Phase 3 Change Ledger

Ordered by dependency: **tokens → shell → navigation → primitives → views → density → pagination**.

Scope discipline: this is a **presentation-layer refactor**. No new pages, no new metrics,
no new endpoints, no new domain concepts. Every row below changes how existing data looks,
not what data exists.

| ID | File | Lines | Current behaviour | Target behaviour | Spec ref | Risk | Rollback |
|---|---|---|---|---|---|---|---|
| **T1** | `src/app/globals.css` | append to `@theme` | No admin tokens; admin reuses storefront tokens | Add `--color-admin-*`, `--text-admin-*`, `--radius-admin*`, `--shadow-admin`, `--spacing-sidebar*`. **Purely additive — no existing token altered** | §9 | **Low** — additive only; customer tree cannot change | Delete the appended block |
| **T2** | `src/app/globals.css` | append | — | `[data-surface="admin"]` scope block binding admin tokens to the shell subtree | §1.1 | Low | Delete block |
| **L1** | `src/app/(admin)/layout.js` | 1–12 | Imports customer `Header` + `Footer`; `<main className="pt-20">` | Renders `AdminSurface` only. **Header/Footer removed from the tree — not hidden** | R2 | **Med** — every superuser route re-parents | `git revert` (12-line file) |
| **L2** | `src/app/(agency)/layout.js` | 1–43 | Own 64px header + `max-w-6xl` footer | Renders `AdminSurface` with agency role | R2 | Med | `git revert` |
| **S1** | `src/features/admin/components/admin-surface.client.jsx` | **new** | — | Shared shell: `data-surface="admin"`, sidebar + 48px top bar + fluid content. Owns the collapse state | §5, §6 | Med | Delete file, revert L1/L2 |
| **S2** | `src/features/admin/components/admin-sidebar.client.jsx` | **new** | — | 240/64px sidebar. Icon+label, grouped, active state, collapsible, keyboard navigable, `aria-current`. **Role-aware via a passed item list — no permission logic added** | §5 | Med | Delete file |
| **N1** | `admin-shell.client.jsx` | 15–30, 115–163 | Owns horizontal tab nav + `Container py-12` | Keeps **only** the access probe and its three guard states; nav moves to S2, chrome to S1 | R2, R3 | **Med-High** — guard logic must survive intact | `git revert` |
| **N2** | `agency-shell.client.jsx` | 20–25, 100–172 | Owns tab nav, tenant switcher, `Container py-12` | Keeps **only** tenant resolution + guards + the org switcher (moves into the top bar) | R2, R3 | **Med-High** — 404-not-403 tenancy behaviour must not leak | `git revert` |
| **P1** | `src/components/data/data-table.jsx` | 24–141 | One density; shared with customer `account/order-list` | Add `density="comfortable" \| "compact"`, **defaulting to `comfortable`**. Compact: 40px rows, 32px sticky header, `admin-caps`. Customer call site passes nothing and is byte-identical | §5, R6, §1 | **Med** — shared component | Remove the prop; default path unchanged |
| **P2** | `src/components/data/data-table.jsx` | 108–138 | Pagination hidden when `pages <= 1`; no page-size control | Always render the bar when a list is loaded; add page-size select (24/50/100). Range + total already present | R5 | Low | Revert block |
| **P3** | `src/lib/api/pagination.js` | 10, 32–46 | `DEFAULT_PAGE_SIZE = 24` hardcoded | Accept a page size argument; keep 24 as default. Additive | R5 | Low | Revert |
| **P4** | `src/features/admin/hooks/use-list-query.client.js` | **new** | Every list holds page/filters in `useState`; nothing in the URL | One hook owning `?page=&limit=&q=` via `useSearchParams` + `router.replace`. **`sort` deliberately excluded — see Conflict 2** | R5 | Med | Delete; views keep `useState` |
| **V1–V12** | 12 list components | toolbar + state | Bespoke filter `<form>` above table; local state | Filters move into a compact 40px toolbar slot; state via P4. **Column definitions and data flow untouched** | R3, R4 | Med | Per-file revert |
| **V13** | `admin-dashboard.client.jsx` | 109–231 | 19 tiles in 4-col grid, `space-y-8`, 1792px scroll | KPI strip per §5 anatomy; alert strip retained verbatim. **No metric added or removed** | R4 | Low | Revert |
| **D1** | all admin/agency views | — | `Container` (`max-w-6xl px-6`) + `py-12` | `Container` no longer used on admin routes; S1 provides fluid width + 20px gutters. **`Container` itself unchanged** for its 24 customer call sites | R3 | Low | Revert S1 |

## Conflicts raised before implementation (§6)

**Conflict 1 — "three surfaces" vs. two.**
`(admin)/superuser` and `(agency)/agency` exist. There is no separate travel-agency panel;
`organization_type = "travel_agency"` means the agency portal *is* it. Proceeding with two.
Building a third is a feature, which you have excluded.

**Conflict 2 — R5 asks for `?sort=`; the API cannot sort.**
No admin list view uses DRF's `OrderingFilter`; every queryset has a hardcoded `.order_by()`.
Options: (a) omit `sort` — URL carries `page`, `limit`, `q`; (b) client-side sort, which
**silently sorts one page and reads as sorting the dataset** — actively misleading on
paginated data; (c) add `OrderingFilter` server-side, which is a backend change you have
excluded. **Recommending (a)**, and stating it in the report rather than shipping (b).

**Conflict 3 — "≥90% of viewport width" vs. a persistent sidebar.**
A 240px sidebar caps content at 83% of 1440. Reading the criterion as ≥90% *of the width
available after the sidebar* → 1160/1200 = **96.7%**. Collapsed, 1376/1440 = 95.6% of the
full viewport. Confirm the reading.

**Conflict 4 — accent colour.**
Reference is indigo-violet; product is blue `#2563eb`, shared with customer CTAs. Proposing
indigo `#4F46E5` **scoped to admin only**. If admin should stay blue, that is one token and
nothing else in the spec moves.

**Conflict 5 — `DataTable` is shared with the customer account page.**
Density is added as an opt-in prop defaulting to today's behaviour, so
`features/account/order-list` renders byte-identically. The alternative — forking the file —
duplicates 141 lines and two pagination implementations that will drift. **Recommending the
variant-gate.**

## Explicitly NOT doing (per your instruction: no new features)

- No bar chart / revenue trend widget (the `reports/revenue/` endpoint stays unconsumed)
- No calendar, no notifications centre, no plan/upgrade UI
- No new admin pages, metrics, columns, or endpoints
- No backend changes

## Verification contract for Phase 5

Build · runtime console · screenshots at 1440×900 / 1920×1080 / 1280×720 · measured density
per view · full regression incl. customer-facing pages · computed contrast + keyboard
traversal. Any failure re-runs from step 1.
