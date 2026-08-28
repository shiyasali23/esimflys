# REPORT.md — Phase 6

Deployed and verified on production. Two surfaces, per your decision: **Superuser** and
**Agency** (one third-party surface, covering travel agencies and any other partner).

## Density — measured before and after on the live site

Viewport 1496×794 in both runs, same page, same data.

| Metric | Before | After | Target |
|---|---:|---:|---|
| Content width | 1104px | 1232px | — |
| **% of width available beside the sidebar** | 73.8% | **98.1%** | ≥90% ✅ |
| % of full viewport (sidebar collapsed) | 73.8% | 94.7% | — |
| **Chrome above first data row** | 426px | **90px** | ≤120px ✅ |
| Rows above the fold | 5 / 24 | **15 / 24** | ✅ |
| Row height | 65px | 45px | ~40px ✅ |
| Customer `<header>` in DOM | present, 68px | **absent** | ✅ |
| Dashboard height | 1792px (2.3 screens) | **fits one screen** | ✅ |

Chrome budget is now fixed and countable: 48 top bar + 12 gutter + 28 column header = 88,
measured 90 with borders.

## Changes, mapped to CHANGE_PLAN IDs

| ID | File | What |
|---|---|---|
| T1 | `globals.css` | `--color-admin-*`, `--text-admin-*`, radius, shadow, sidebar/topbar sizes. Additive — no existing token altered |
| T2 | `globals.css` | `[data-surface="admin"]` scope: ground, tabular figures, focus ring |
| L1 | `(admin)/layout.js` | Storefront Header/Footer removed from the tree |
| L2 | `(agency)/layout.js` | Own masthead removed; both surfaces share one shell |
| S1 | `admin-surface.client.jsx` **new** | Sidebar + 48px bar + fluid content, own scroll container |
| S2 | `admin-sidebar.client.jsx` **new** | 240/56px rail, grouped, collapsible, `aria-current`, accent bar |
| — | `admin-account-menu.client.jsx` **new** | Sign-out, which the removed mastheads took with them |
| — | `admin-toolbar.client.jsx` **new** | Filters portalled into the top bar |
| N1/N2 | both shells | Keep only their access-probe and tenancy guards; chrome delegated |
| P1 | `data-table.jsx` | `density` variant; customer path byte-identical |
| P2 | `data-table.jsx` | Page-size select, always-visible count — **admin variant only** |
| P3 | `pagination.js` | `PAGE_SIZES`, `normalisePageSize` |
| P4 | `use-list-query.client.js` **new** | URL is the sole source of truth — one fetch per navigation |
| V1–V14 | all 14 paginated views | Toolbar + URL state + page-size selector + compact table |
| V13 | `admin-dashboard.client.jsx` | Compact KPI tile, hoisted to module scope |
| D1 | admin routes | `Container` no longer used; unchanged for its 24 customer call sites |

## Verification

**1. Build** — clean. **Every new utility class was checked against the compiled CSS**
(24/24 emitted rules) before anything was built on them; this repo has previously shipped
a class that emitted nothing and rendered at inherited size.

**2. Runtime** — no console errors on the modified routes.

**3. Visual** — screenshots captured of `/superuser`, `/superuser/orders`, `/account/orders`.

**4. Density** — table above, measured from the live DOM.

**Router mock corrected.** `routerMock.replace` was a bare spy and `useSearchParams`
returned a static object, so a test could change a filter, see the spy fire, and watch the
component keep rendering the old query. Harmless while state lived in `useState`; wrong the
moment it moved to the URL. It now applies the new query and notifies subscribers through
`useSyncExternalStore`, so components re-render as they do in the browser.

**5. Regression** — 796 tests pass; build clean; lint clean. **Customer site verified after
deploy** on `/account/orders`: header present (68px), 53px rows, pagination still hidden on
a single page, storefront ground `#f8fafc`, `[data-surface="admin"]` absent.

**6. Contrast & keyboard** — computed from rendered pixels:

| Pair (read off the live DOM) | Measured |
|---|---|
| label `rgb(91,100,114)` on surface | **5.98:1** |
| label on ground `rgb(247,248,250)` | **5.63:1** |
| value `rgb(17,24,39)` on surface | **17.74:1** |
| accent `rgb(67,56,202)` on surface | **7.90:1** |

Keyboard: 15 focusables in the rail, all tabbable; active item carries `aria-current="page"`;
collapse carries `aria-expanded`; `#main-content` present for the skip link.

## Not done — stated, not glossed

- ~~URL state covers 3 of 12 list views~~ — **now complete: all 14 paginated views** carry
  `?page=`, `?limit=` and their filters, each with a page-size selector, total count and
  range indicator. Verified on production: `/superuser/esims?limit=50&status=ready` reloads
  into the same view and issues **exactly one** request (`?page_size=50&status=ready`) — no
  seed-then-sync double fetch.
- **`?sort=` omitted.** No admin endpoint uses DRF's `OrderingFilter`; every queryset has a
  fixed `.order_by()`. A client-side sort would reorder ONE PAGE while appearing to sort the
  table. Needs a backend change, which you excluded.
- **Agency portal not rendered.** The signed-in account belongs to no organization, so
  `/agency/portal` returns "Not found". It shares `AdminSurface` and is covered by tests, but
  I have no live screenshot or density figure for it and will not invent one.
- **Screenshots at 1440×900 / 1920×1080 / 1280×720 not captured.** The browser holding the
  admin session has a fixed 1496×794 viewport; the resizable one has no session. All figures
  above are from 1496×794.
- **Table `<caption>` missing** on the compact variant — a pre-existing gap, not introduced here.
- Sidebar is collapsible but not yet a drawer below 1024px.

## Backend

Untouched. No new endpoints, no new queries, no added CPU. Page size is capped by the API's
own `max_page_size = 100`, and a larger page is *fewer* requests for the same rows.
