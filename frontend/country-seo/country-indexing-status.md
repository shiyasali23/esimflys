# Country Indexing Status

Status of all 68 country pages after this pass. The gate: a page indexes only when it has **approved `country_content`** AND real plans; otherwise `noindex` + excluded from the sitemap.

## ✅ Ready to index (10) — approved, validated, in sitemap
| Country | Missing facts | Validation | Remaining risk |
|---|---|---|---|
| saudi-arabia | none for current depth | PASS | Off-page authority only (new domain) — not on-page |
| united-arab-emirates | none | PASS | Off-page authority |
| thailand | none | PASS | Off-page authority |
| indonesia | none | PASS | Off-page authority |
| malaysia | none | PASS | Off-page authority |
| singapore | none | PASS | Off-page authority |
| maldives | none | PASS | Off-page authority |
| turkey | none | PASS | Off-page authority (Vodafon→Vodafone typo now fixed in Excel + catalog + content) |
| morocco | none | PASS | Off-page authority |
| montenegro | none | PASS | Off-page authority |

All 10: `robots: index, follow`, unique title/description, Product + BreadcrumbList + FAQPage schema, authored intro + 5 content sections + 4 FAQs, verified render, no unsupported claims.

## ⏸ Keep noindex — awaiting unique content (58)
All other active countries remain templated → `noindex, follow`, absent from sitemap, still live/buyable. This is intentional (prevents scaled/thin-content exposure). Each needs approved `country_content` before it can index.

**Recommended next batch (the client's `sort_order` 11–18, all `is_popular`):** Albania (11), Azerbaijan (12), Georgia (13), Uzbekistan (14), Kazakhstan (15), Bosnia and Herzegovina (16), Egypt (17), Jordan (18). Each has DB facts (operators, plans, pricing) sufficient for the same "honest data-driven" depth.

**Batch-2 candidates pending client re-prioritisation:** Japan and Egypt have strong external eSIM demand and rich plan sets, but Japan sits at `sort_order` 123 in the client's data — confirm priority before authoring (do not guess demand).

**The remaining ~50:** keep `noindex` until authored. To scale, add `src/content/countries/<slug>.json` (status `approved`) + one import line in `src/content/countries/index.js` — the page auto-indexes and enters the sitemap on next build.

## Missing-facts summary (applies to the noindex set and to deeper editorial)
The catalogue provides operators + plan economics per country, but **not** coverage %, speeds, city/rural detail, or timezone. "Honest data-driven" pages are buildable from the DB alone (as the 10 demonstrate). Richer, more competitive pages need the client to supply/approve verifiable public facts per country — **none are to be invented**.

## Guardrails (do not remove)
- Never bulk-flip countries to `approved` without real, unique, validated content.
- Keep `hotspot` out of all country content (catalogue = "Unknown").
- Keep the index decision driven by `isCountryContentApproved` + plans.
