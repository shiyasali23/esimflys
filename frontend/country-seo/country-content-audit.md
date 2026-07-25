# Country Content Audit — Thin-Content Fix

## Problem (before)
All 68 `/esim/[slug]` pages rendered the **same template** with only `${country.name}` (+ `${networks}` / plan numbers) swapped — near-duplicate across destinations. The index gate held **every** country page at `noindex`, so 0 country pages could rank for their core queries ("Saudi Arabia eSIM", "Thailand eSIM"). This was the single biggest organic-traffic limiter.

## What was available (facts inventory)
Per-country **verified DB facts** (from `data/catalog.json`, generated from `eSIM_DB_Catalogue_Launch.xlsx`): real local **operator names** (65/68 distinct sets), **plan types** (fixed / unlimited-daily), **data tiers (GB)**, **validity (days)**, **USD price range + per-day**, **top-up availability**, **region**. **Not** in the data: coverage %, network speeds/quality, city/rural specifics, timezone (null), hotspot (Unknown) — so none of those were asserted.

## Priority (evidence-based)
Selected the **top 10 by the client's own `sort_order`** (their business ranking, which also matches the homepage-featured set) — no guessing:
1. Saudi Arabia · 2. United Arab Emirates · 3. Thailand · 4. Indonesia · 5. Malaysia · 6. Singapore · 7. Maldives · 8. Turkey · 9. Morocco · 10. Montenegro.
Japan (sort_order 123) and Egypt (16) are **batch-2 candidates**: high external eSIM demand and rich plan sets, but ranked low in the client's current `sort_order` — flagged for the client to re-prioritise before authoring.

## What was built
A scalable **country content system** (frontend representation of the backend `country_content` model, swappable to `:8000` later):
- Content store: `src/content/countries/<slug>.json` (metaTitle, metaDescription, intro, countryContext, networkNotes, connectionDetails, activationNotes, whyEsim, faqs[4], status) + loader `src/content/countries/index.js`.
- Rendering: `country-content.jsx` and `country-faq.jsx` render authored content when approved, else the existing data-driven fallback (58 countries unchanged).
- Metadata: authored `metaTitle`/`metaDescription` per page (fallback to formula).
- Schema: **FAQPage** JSON-LD added for authored FAQs (real, mirrors the visible accordion) — alongside Breadcrumb + Product + Organization + WebSite.
- Indexing: `config/indexing.js` now gates on **approved `country_content`** (`isCountryContentApproved`) + real plans. Sitemap auto-includes only approved countries.

## Result
- **10 countries** now carry genuinely unique, fact-based editorial → `index, follow`, in the sitemap, FAQPage schema.
- **58 countries** remain templated → `noindex`, excluded from the sitemap (protected from scaled-content risk).
- Content uses **only** verified DB facts + universal eSIM facts + the real operator names + verifiable public geography (region). **No fabricated coverage, speed, quality, reviews, stats, pricing, hotspot, or features.**
- No UI/layout/component change; build, lint, and 15 tests pass.

> Honest scope note: unique content makes these pages *eligible* to rank; actual ranking vs an established competitor also depends on off-page authority/backlinks (out of scope, and no rankings are guaranteed).
