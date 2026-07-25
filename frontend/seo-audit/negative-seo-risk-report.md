# Negative-SEO Risk Report — eSIMFlys

What could create negative SEO, brand, or trust impact for **our** site. Reflects the current post-rewrite state. Each item: element → issue → why → severity → confidence → recommendation. Items needing external tools are marked *Not verified*.

> Framing: a high Lighthouse SEO score is technical *eligibility*, not a ranking guarantee. Most items below are either already mitigated or are opportunity-cost, not active penalties — with two genuine exceptions (R1 legal, R2 gate-dependent thin pages).

---

## 1. ACTIVE risks (could harm if shipped as-is)

### R1 — Copied/false "Always On service" block in Terms · **Critical** · Confirmed
- **Where:** `content/legal/terms.js`, section `always-on-service` (still live at `/legal/terms`).
- **What:** describes subscriptions, a "Local Phone Number Activation" SMS service, free always-on data across ~100 named countries, and dated rollouts — none of which match our data-only prepaid product; reads as copied competitor boilerplate.
- **Why:** (a) **duplicate/plagiarised-content** signal and possible IP issue; (b) **false product claims** in a legally binding document → consumer-protection + brand risk if the site goes live.
- **Recommendation:** remove it (diff prepared in `../seo-content/terms-alwayson-removal.md`) after **legal counsel** confirms. Do not author replacement legal language.

### R2 — Templated country pages = scaled/thin-content risk IF the noindex gate is removed · **High** · Confirmed
- **Where:** `country-content.jsx`, `country-faq.jsx` (68 near-duplicate pages); gate in `config/indexing.js`.
- **What:** identical structure/wording across destinations (only `${country.name}`/networks vary). **Currently `noindex` — so not an active penalty.** The risk is future misconfiguration: flipping the gate on before pages are genuinely unique would expose all 68 to Google's scaled-content-abuse policy.
- **Why:** mass near-duplicate pages are exactly what that policy targets; indexing them thin could suppress the whole domain.
- **Recommendation:** **keep the gate enforced.** Only set `content.approved = true` per country after real, unique editorial exists. Never bulk-flip.

### R3 — Placeholder legal boilerplate (entity/jurisdiction unconfirmed) · **Medium** · Confirmed
- **Where:** `content/legal/{privacy,terms,refund,cookies}.js` (noindex placeholders).
- **What/why:** controlling entity ("eSIMFlys"/"eSIMFlys Global"), governing law ("laws of Ireland"), liability cap ("€100"), and support email are placeholders — legally unverified.
- **Recommendation:** legal review before launch. Keep `noindex` until finalized.

## 2. LATENT / opportunity-cost (limiting, not penalising)

### R4 — Zero indexable country pages → no country organic · **High (business)** · Confirmed
- **Where:** `app/sitemap.js` + gate; 0 of 68 countries indexable (0 approved, 0 with live plans).
- **Why:** the highest-intent queries ("Japan eSIM") can't rank because the pages are noindex and absent from the sitemap; esim70 indexes ~165. This is the single biggest organic-reach limiter.
- **Recommendation:** author unique per-country content (top markets first) + activate plans → pages auto-index. See action plan.

### R5 — Missing keyword coverage: no hreflang, no blog, no regional pages · **Medium** · Confirmed
- **Where:** no `alternates.languages`; no `/blog` route (dead `routes.blog()` builder); no `/esim/[region]`.
- **Why:** forgoes non-English demand (esim70: 10–17 locales), informational long-tail (esim70: `/blog`), and regional keywords (esim70: `/esim/asia`).
- **Recommendation:** roadmap i18n + a real blog; remove the dead `blog()` builder if the blog isn't imminent. Add regional pages only with real product/data.

### R6 — Placeholder trust signals / no rating schema · **Medium** · Confirmed
- **Where:** `content/reviews.json` (sample, `verified:false`), `content/site.json` stats; Review/AggregateRating blocked by policy.
- **Why:** lower conversion + no review rich-result eligibility vs esim70's real 4.3★/109. (Not a penalty — the correct honest choice.)
- **Recommendation:** collect real verified-purchase reviews post-launch, then enable Review/AggregateRating. Never fabricate.

### R7 — Store shows 0 buyable plans in production (data blocker) · **Medium (UX/business)** · Confirmed
- **Where:** all 385 plans `status='paused'`; country pages render them only via `showPausedPlans` dev flag; production shows empty-states.
- **Why:** not a direct SEO penalty (pages are noindex), but the funnel is non-functional for real buyers, and metrics/engagement signals would be poor if indexed.
- **Recommendation:** activate plans before flipping `SHOW_PAUSED_PLANS=false` and before indexing country pages.

### R8 — Footer "Top destinations" stale vs featured set · **Low** · Confirmed
- **Where:** `content/nav.json` footer → `/esim/france|germany|greece|italy` (hardcoded Europe), while the homepage now features SA/UAE/Thailand/Indonesia (from the new `countries` sheet `sort_order`).
- **Why:** minor relevance/consistency issue; those links also point to currently-noindex pages. Not broken, just off-strategy.
- **Recommendation:** align footer destinations with the featured/top-sorted countries (small content edit — deferred to a change phase).

### R9 — Homepage title is brand-first · **Low** · Confirmed
- See cross-validation F5. Optional keyword-first retitle.

## 3. VERIFIED CLEAN (checked; risk NOT present)
- **Duplicate titles:** none — `help/[category]` → "{Category} — Help" (unique), `legal/[doc]` unique, country titles unique by name, static pages unique. *(Confirmed)*
- **Broken internal links:** none — every `nav.json` href resolves to a real route; no `/blog` link exists. *(Confirmed)*
- **Missing metadata:** none — every route sets title + description via `buildMetadata`/root defaults. *(Confirmed)*
- **Incorrect canonicals:** none — self-referential canonical per path; noindex pages correctly self-canonical. *(Confirmed)*
- **Heading structure:** clean — one H1 per page, logical H2/H3. *(Confirmed)*
- **Keyword stuffing:** none — rewrites validated for natural usage. *(Confirmed)*
- **Misleading/hotspot/regional claims (marketing):** removed (ticker, reviews, quiz, help, hero alt). No user-facing "hotspot" text remains. *(Confirmed)*
- **Closely-paraphrased/duplicate marketing copy vs esim70:** our copy is original (not pasted); glossary (was verbatim-source) rewritten. *(Confirmed — except R1 legal block.)*
- **Crawlability:** `robots.txt` allows all, disallows only `/api/`,`/search`; JS/CSS not blocked; sitemap present. *(Confirmed)*
- **Indexing config:** correct — marketing/support pages `index`, funnel/auth/account/legal `noindex+follow`, country pages gated. *(Confirmed)*

## 4. NEEDS EXTERNAL VERIFICATION (not claimed here)
- **Structured-data validity:** our Product/Breadcrumb/Org/WebSite/DefinedTermSet look correct in source, but run Google's **Rich Results Test / Schema validator** on live URLs to confirm no warnings. *(Possible — recommend)*
- **Off-page:** esim70's (and our) **backlinks, domain authority, actual Google indexation and rankings** are **Not verified** — require Search Console + Ahrefs/SEMrush. The authority/age gap (esim70 established, us new) is likely the dominant real-world ranking factor and cannot be closed by on-page work. *(Not verified)*
- **Core Web Vitals (field):** lab build is clean; confirm field CWV post-deploy via CrUX/PageSpeed. *(Not verified)*

## 5. Net assessment
- **Active penalty risk today: LOW**, contingent on two things — (1) keep the country-page `noindex` gate on (R2), and (2) remove the copied Terms block (R1). Fix R1 and the site carries **no active negative-SEO liability** we can find on-page.
- **The real limiter is opportunity cost**: 0 indexable country pages (R4) + no i18n/blog/regional (R5) + placeholder trust (R6) mean the site is *safe but small*. Closing those (with genuine unique content, not copying esim70) is the growth path — see `recommended-action-plan.md`.
