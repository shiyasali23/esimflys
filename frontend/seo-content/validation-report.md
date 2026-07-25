# eSIMFlys — Validation Report

Every rewritten block checked against the Step-4 rules. Companion to `rewritten-content.md`.

## Checks applied to each block
Original wording · correct grammar · accurate meaning · natural keyword usage · matching search intent · no keyword stuffing · no unsupported claims · no duplicate content · no broken links · no UI/functionality change · correct heading structure · correct metadata length & relevance · consistent brand voice.

**Result key:** ✅ PASS (all checks) · ⚠ CONDITIONAL (passes as written; note a dependency) · ❌ FAIL — action required (applies to *current* strings that must change).

---

## 1. Homepage + chrome

| Block | Result | Notes |
|---|---|---|
| home hero (titleLines + subtitle) | ✅ PASS | Original; keeps 3-line H1 + highlight token "60+ countries." unchanged (no UI/logic change); "travel eSIM data" natural; removes non-live "region"; honest. |
| home whereTravelersGo.cta | ✅ PASS | "Browse all destinations" drops off-brand "cards"; same `/destinations` target. |
| home howItWorks features + step[0].body | ✅ PASS | Removes non-live "region"; drops duplicate "validity"; 3 features + step structure intact. |
| home ctaBand.subtitle | ✅ PASS | Single-clause removal; roaming/airport theme intact; no regional claim. |
| home appCta.subtitle | ✅ PASS | "Coming soon for iOS and Android" matches the "· soon" badges; "buy your next one" replaces conditional "top up". |
| reviews title | ✅ PASS | Removes the "real" authenticity claim; items stay sample-labelled by the note; H2 level unchanged. |
| reviews Hiroko T. | ✅ PASS | Removes hotspot/tethering claim (hotspot = Unknown); keeps family flavour; sample. |
| reviews Elena M. | ✅ PASS | Removes non-live "regional plan across four countries"; reflects live per-country model; sample. |
| quiz 4 option descs | ✅ PASS | All "hotspot" / "multiple devices…hotspot" removed; describes data intensity only; other options untouched. |
| quiz intro.subtitle | ✅ PASS | Drops internal "catalog" jargon; matches plan-finder intent. |
| site ticker | ✅ PASS | Hotspot claim removed; "worldwide" → "in 60+ countries" (accurate); vague "best-value" → concrete "per-day pricing"; regional claim dropped; 5 distinct items (marquee unaffected). |
| site stats label | ✅ PASS | "Typical setup" removes the "measured average" implication; value unchanged. |
| hero.jsx image alt | ✅ PASS | Descriptive for AT/SEO; keeps "travel eSIM data"; drops "worldwide" overclaim; no markup change. |

## 2. Catalog + commerce

| Block | Result | Notes |
|---|---|---|
| esim/[slug] metadata title | ✅ PASS | Leads with `${country.name}` for exact-match "[Country] eSIM"; 30 (Japan) to ~45 (long names) ≤ ~50; transactional. |
| esim/[slug] metadata description | ⚠ CONDITIONAL | Original; natural keywords; no fabricated/hotspot claims. Length flexes with name + price: modal case ≈ 150–155; very short name + no price ≈ 140; very long names ≈ 165 (Google truncates gracefully). |
| esim/[slug] intro | ✅ PASS | Brand voice; template-safe (`${country.name}`); no hotspot/unsupported claims. |
| esim/[slug] CONFIDENCE | ✅ PASS | Original, honest, parallel; no hotspot/savings claims. |
| country-content When to activate | ✅ PASS | Accurate activation model; `${country.name}` preserved. |
| country-content Network partners | ✅ PASS | `${country.name}` + `${networks.join(", ")}` preserved; no claims beyond the real networks list. |
| country-content Connection details | ✅ PASS | All three ternary interpolations preserved byte-for-byte; "where the local network offers it" avoids overclaim; no hotspot. |
| country-content Why an eSIM | ✅ PASS | Honest (no fabricated savings); `${country.name}` heading unchanged. |
| country-faq Q1–Q4 answers | ✅ PASS | Original; genuinely useful (EID check, validity-clock, roaming-off tip, top-up caveat "if yours does"); only `${country.name}` (drop-in safe); no hotspot / no unsupported top-up promise. |
| destinations metadata description | ✅ PASS | 150 chars at countryCount 68; `${SITE.countryCount}` preserved; honest. |

## 3. Standalone pages + nav/footer/legal

| Block | Result | Notes |
|---|---|---|
| how-it-works metadata description | ✅ PASS | 149 chars; original; preserves how-to intent; no new claims. |
| devices Wi-Fi Routers example | ✅ PASS | Same meaning (eSIM-capable router hardware); removes "hotspot" wording to respect the no-tethering rule; no structure change. |
| help metadata description | ✅ PASS | 152 chars; mirrors the real category set (no stuffing); support intent. |
| help Usage answer (optional) | ⚠ CONDITIONAL | Apply only if limit alerts aren't guaranteed; hedged ("where a plan supports it") to avoid an unconditional promise. |
| glossary 11 definitions | ✅ PASS | All fully original (no Wikipedia/source phrasing); meanings accurate; traveler framing; term/badge/seeAlso/JSON-LD structure untouched. |
| glossary intro | ✅ PASS | Original; removes the meta-duplicate line; plain voice. |
| glossary metadata description | ✅ PASS | 148 chars; term list matches page. |
| about body | ✅ PASS | Honest (USD-canonical + "local currency for reference" = indicative; guest/account matches help); keeps `${SITE.countryCount}` + single H1. |
| about metadata description | ✅ PASS | 151 chars; "60+" correct public figure. |
| contact metadata description | ✅ PASS | 154 chars; support intent preserved. |
| for-business body | ✅ PASS | "building" keeps forward features honest; no fabricated capabilities; "60+" correct. |
| for-business title + metadata | ✅ PASS | Title "eSIM Plans for Business" (23 chars, removes brand duplication, adds keyword); description 152 chars. |
| affiliates body | ✅ PASS | No fabricated commission/terms ("being finalised"). |
| affiliates metadata description | ✅ PASS | 151 chars; commercial intent preserved. |

---

## ❌ Failures on CURRENT strings — mandatory before publishing indexable/updated copy

1. **`content/site.json` ticker "Hotspot ready" — FAIL (hard honesty rule).** Explicit hotspot/tethering claim; hotspot = "Unknown" for all 385 plans. Renders in the homepage TrustTicker. → Replace with a non-tethering line (`rewritten-content.md` ticker set, e.g. "Clear per-day pricing").
2. **`content/legal/terms.js` "Always On service" § — FAIL (honesty + duplicate/copied).** Describes subscriptions, a local-phone-number SMS service, free always-on data across ~100 named countries, and dated rollouts — contradicts the data-only prepaid product and reads as competitor boilerplate. → **Remove/replace via legal counsel.** No replacement legal text authored (don't invent legal terms).
3. **`content/site.json` "Average activation 2 min" — FAIL (soft; unsupported metric).** Implies measured telemetry with 0 live plans/customers. → Reframe as "Typical setup" (`rewritten-content.md`).
4. **`content/reviews.json` "Reviews from real trips." + Hiroko "single hotspot" + Elena "regional plan" — FAIL (authenticity/hotspot/non-live).** → Apply the reviews rewrites.
5. **`content/glossary.js` 11 definitions — FAIL (duplicate/verbatim source).** → Apply the original definitions.
6. **`content/quiz.json` 4 hotspot descriptions + `content/site.json`/`content/home.json` "regional" promises — FAIL (hotspot / non-live product).** → Apply the quiz + home/ctaBand/howItWorks rewrites.

## Cross-cutting recommendations (not text-only — need owner decisions)
- **Keep `countryIndexDecision()` `noindex` gate enforced** on `/esim/[slug]`. The rewrites raise honest uniqueness, but the body + FAQ remain templated across 68 pages; do **not** index on templated copy alone. Indexable differentiation still needs per-country **approved editorial** content.
- **Optional per-page-uniqueness lever (needs a small code change):** inject `${networks}` into one FAQ answer, guarded for empty-networks countries — raises real per-page variance beyond the country name.
- **Align the public country figure:** `SITE.description` says "60+" while `/destinations` renders the exact "68" via `${SITE.countryCount}`. Both are honest; pick one convention for voice consistency (a text-only change can't touch the `${SITE.countryCount}` variable).
- **`config/nav.js` + `config/footer.js` are dead/unimported** — the live header/footer read `content/nav.json` + `content/site.json`. No user-facing impact; reconcile the label/mission drift only if ever wired up.

## Confirmation
All rewrites in `rewritten-content.md` are **text-only**: one H1 per page preserved, headings/routes/internal links unchanged, every `${...}` interpolation token kept, and no unsupported claims (no hotspot, no fabricated stats/reviews/coverage, "60+"/USD-canonical intact). Ready for implementation on your approval.
