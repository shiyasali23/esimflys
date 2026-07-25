# Cross-Validation Report — eSIMFlys vs esim70.com

Evidence-based comparison. Sources: `reference-website-analysis.md` (esim70, DOM-verified) + `frontend-content-analysis.md` (ours, source-verified). Every finding: element → issue → why → severity → confidence → recommendation. **No guessing** — items needing external tooling are marked *Not verified*.

Confidence key: **Confirmed** (directly observed both sides) · **Likely** (strong inference) · **Possible** (plausible, unverified).

## A. Side-by-side snapshot

| Dimension | esim70 (reference) | eSIMFlys (ours) | Verdict |
|---|---|---|---|
| Core URL structure | `/esim/[slug]`, `/destinations`, … | same core spine | **Equal** |
| Homepage `<title>` | keyword-first ("Travel eSIM Plans for 150+ Countries \| Esim70") | brand-first ("eSIMFlys \| Instant Travel eSIM Data") | Ours slightly weaker |
| Country `<title>` | "Japan eSIM - …" (country-first) | "{country} eSIM — Travel Data Plans" (country-first) | **Equal** |
| Meta descriptions | 123–136 chars, keyword-rich | 140–155 chars, keyword-rich | **Equal** |
| Canonical / OG / Twitter | full, self-referential | full, self-referential | **Equal** |
| JSON-LD | Org, WebSite, Breadcrumb, Product(offers), **FAQPage** | Org, WebSite, Breadcrumb, Product(AggregateOffer), **DefinedTermSet** | Mostly equal; we omit FAQPage, add DefinedTermSet |
| **hreflang / i18n** | **10–17 locales** | **none (en only)** | **Weaker** |
| **Country page content** | **unique per-country editorial** → indexed | **templated across 68** → noindex | **Weaker (central)** |
| Indexable country URLs | ~165 | **0** (all gated noindex) | **Weaker (central)** |
| Trust signals | **real** 4.3★/109 + verified reviews | placeholder samples (labelled, `verified:false`) | Weaker, but ours is *honest* |
| Savings/per-day model | per-day + strikethrough "Save $X" | per-day only (no fabricated savings) | Weaker, but honest |
| Regional bundles | `/esim/[region]` pages | none | Weaker (coverage) |
| Blog / content marketing | `/blog` | none (dead route builder) | Weaker |
| Live local-time widget | yes | removed (no tz data) | Weaker (minor) |
| H1 per page | 2 in DOM (responsive dup) | **1** | **Stronger** |
| Misleading claims | states "Hotspot ready", savings | removed all unsupported claims | **Stronger (risk-safety)** |
| Scaled-content protection | relies on genuine uniqueness | `noindex` gate until unique+approved | **Stronger (safety)** |
| Domain authority / backlinks / rankings | established, indexed | new | *Not verified — needs Ahrefs/GSC* |

## B. Findings

### F1 — Country pages are templated/near-duplicate (central organic gap) · High · Confirmed
- **Where:** `features/catalog/components/country-content.jsx`, `country-faq.jsx`; gate in `config/indexing.js`. All 68 `/esim/[slug]`.
- **Element:** 4 content blocks + 4 FAQ answers vary only by `${country.name}` (+ `${networks}` / plan numbers in the content block).
- **Issue:** esim70's country pages carry genuinely unique editorial (country context, "why eSIM here", local specifics) and are **indexed**; ours are near-duplicate and **noindex**.
- **Why it matters:** country queries ("Japan eSIM", "eSIM for Thailand") are the highest-intent organic terms in this niche. With 0 indexable country pages we currently earn **no** organic traffic on them.
- **Recommendation:** author unique per-country editorial (start with top ~10–20 markets), then flip the gate per country. Keep `noindex` until then (current stance is correct). Do **not** copy esim70's wording — write from our real data (networks, plan ranges) + genuine destination-specific guidance.

### F2 — No hreflang / internationalization · High · Confirmed
- **Where:** `lib/seo/metadata.js` (no `alternates.languages`); whole app is en-only. (Backend `country_content.locale` exists but unused by the frontend.)
- **Element:** esim70 ships 10–17 hreflang alternates; we ship none.
- **Issue/why:** non-English travelers search in their own language ("eSIM Japon", "eSIM 日本"); esim70 captures that demand, we don't. This is a large addressable-market gap.
- **Recommendation:** roadmap i18n (locale routing + translated content + `alternates.languages` hreflang). Not a pre-launch blocker; a strategic growth item. Only ship locales you can genuinely translate (machine-translated thin pages would be a new duplicate-risk).

### F3 — FAQPage structured data absent · Low · Confirmed
- **Where:** `lib/seo/jsonld.js` (no FAQPage); we render visible FAQs (home `faq.json`, `country-faq.jsx`) without schema. esim70 emits FAQPage on home + country.
- **Issue/why:** Google deprecated FAQ rich results for most non-authoritative sites (Aug 2023), so esim70's FAQPage likely yields no visible SERP feature for a commercial eSIM page. Upside is low; our omission is defensible.
- **Recommendation:** **Optional.** If desired, emit FAQPage that exactly mirrors the visible FAQ (honest, low-risk parity). Not a ranking lever — deprioritize.

### F4 — Trust signals are placeholder, no rating schema · Medium · Confirmed
- **Where:** `content/reviews.json` (sample, now `verified:false`), `content/site.json` stats; `config/flags.js` blocks Review/AggregateRating.
- **Element:** esim70 shows real 4.3★/109 + named verified testimonials (and can emit Review/AggregateRating); we show clearly-labelled samples and no rating schema.
- **Issue/why:** real ratings/testimonials lift conversion and can earn review rich results; we forgo both — **correctly**, since fabricating them would violate policy and risk manual action.
- **Recommendation:** collect real reviews post-launch (verified-purchase → `reviews.is_verified_purchase`); then enable Review/AggregateRating schema. Until then keep honest placeholders. **Do not fabricate.**

### F5 — Homepage title is brand-first · Low–Medium · Confirmed
- **Where:** `app/layout.js` (`default: "eSIMFlys | Instant Travel eSIM Data"`).
- **Issue/why:** esim70 leads the homepage title with the primary keyword ("Travel eSIM Plans for 150+ Countries | Esim70"). Keyword-first titling is marginally stronger for the head term on the most-linked page.
- **Recommendation:** consider a keyword-first homepage title, e.g. "Travel eSIM Data for 60+ Countries | eSIMFlys" (original wording, ~45 chars). Low effort, small upside.

### F6 — Zero country URLs in the sitemap · High · Confirmed
- **Where:** `app/sitemap.js` (filters `isCountryIndexable`; currently 0). Consequence of F1 + the paused-plans data blocker.
- **Issue/why:** Google discovers ~21 static URLs and none of the 68 country pages, so the site's crawlable surface is tiny vs esim70's ~165. This caps organic reach until F1 is resolved.
- **Recommendation:** resolve via F1 (approve unique content) + activate plans; the sitemap auto-includes them once indexable. No sitemap code change needed.

### F7 — No regional-bundle pages · Medium · Confirmed
- **Where:** `routes.js` maps `region()` and `country()` to the same `/esim/[slug]`; no regional data exists.
- **Issue/why:** esim70 has `/esim/[region]` (e.g. Asia) with descriptive intros — extra indexable pages + "Asia eSIM"-type keyword coverage. We can't offer them (no regional product).
- **Recommendation:** add regional bundles when the product/data exists; until then, honest to omit. Roadmap.

### F8 — No blog / content-marketing surface · Medium · Confirmed
- **Where:** `routes.blog()`/`blogPost()` exist but there is **no `/blog` route** (dead builders); not linked in nav/footer.
- **Issue/why:** top-of-funnel guides ("best eSIM for Japan", "how to set up an eSIM on iPhone") are a major organic channel in this niche that esim70 works via `/blog`; we have none.
- **Recommendation:** (a) remove the dead `blog()` route builders **or** (b) build a real blog with original guides. Content roadmap item.

### F9 — Live local-time widget / per-country freshness cues absent · Low · Confirmed
- **Where:** removed in our build (no reliable tz data); backend `countries.timezone` exists.
- **Issue/why:** minor relevance/credibility cue on country pages; small UX/trust delta, negligible direct SEO.
- **Recommendation:** optionally restore using `countries.timezone` when wired. Low priority.

### F10 — Organization JSON-LD missing `logo`/`sameAs` · Low · Confirmed
- **Where:** `lib/seo/jsonld.js` `organizationJsonLd()` (logo/sameAs intentionally omitted until real assets exist).
- **Issue/why:** esim70's Organization node includes logo, sameAs (socials), contactPoint — richer entity signals / knowledge-panel eligibility. Ours is minimal (honest — no fake socials).
- **Recommendation:** add `logo` (real asset) and real `sameAs` profiles once they exist. Low priority, honest to defer.

### F11 — Product schema on noindex pages (wasted, not harmful) · Low · Confirmed
- **Where:** `esim/[slug]/page.js` emits Product+AggregateOffer, but the page is `noindex`.
- **Issue/why:** valid schema, but Google won't harvest rich results from a noindex page — so the markup does nothing until F1 flips the page to indexable. Not a risk, just latent.
- **Recommendation:** no action; it activates automatically when the page becomes indexable.

## C. Where we are STRONGER / EQUAL / WEAKER

**Stronger (or safer):**
- **Honesty/claims** — we removed hotspot, non-live regional, fabricated savings, and mislabeled reviews; esim70 makes some claims (hotspot, savings) we avoid. Lower manual-action risk. *(Confirmed)*
- **One H1 per page** vs esim70's duplicated hero H1 in DOM. *(Confirmed)*
- **Scaled-content protection** — our `noindex` gate prevents thin-page penalties; esim70 relies on genuine uniqueness (which they have). *(Confirmed)*
- Clean, consistent metadata lengths and canonical/OG architecture. *(Confirmed)*

**Equal:**
- Core URL structure, country-title formula, canonical/OG/Twitter setup, Organization+WebSite+Breadcrumb+Product schema, shadcn/Tailwind/Oswald/Poppins foundation, Product+offers markup.

**Weaker:**
- Unique country content (F1) — the decisive one · hreflang/i18n (F2) · real reviews/ratings (F4) · sitemap surface (F6) · regional pages (F7) · blog (F8) · richer Organization entity (F10) · local-time/savings UX (F9).
- **Domain authority, backlinks, indexation, live rankings — Not verified** (requires Search Console / Ahrefs). esim70 is an established, indexed site; we are new. This authority gap is the ultimate ranking differentiator and cannot be closed by on-page work alone.

## D. Reminder
A high Lighthouse "SEO 100" is technical *eligibility*, not a ranking guarantee. Our on-page/technical parity is strong; the gap that actually limits rankings is **unique indexable content (F1/F6)**, **internationalization (F2)**, **real trust (F4)**, and **off-page authority (not verified)** — not tag hygiene.
