# eSIMFlys — Content Analysis (keep / improve / rewrite)

Per-block SEO verdict, target keyword + search intent, and risk. Companion to `current-content.md`; drives `rewritten-content.md`.

## Brand voice (assumption — override if you disagree)
Traveler-first, practical, calm-confident, plain English, second person ("you"), short active sentences, concrete over hype, honest. Themes: land already online, scan a QR, keep your number, clear per-day pricing, trusted local 4G/5G.

## Keyword strategy (mirror the reference site's architecture; original words)
- **Home:** travel eSIM, international eSIM data, buy eSIM online, prepaid travel data, no roaming.
- **Country pages `/esim/[slug]`:** "[Country] eSIM", "eSIM for [Country]", "[Country] travel SIM/data plan", keep your number, install by QR.
- **/what-is-esim:** what is an eSIM, how an eSIM works, eSIM vs physical SIM.
- **/how-it-works:** set up / install / activate an eSIM, scan QR.
- **/supported-devices:** eSIM compatible phones, does my phone support eSIM.
- **/glossary, /help:** eSIM terms/glossary, eSIM help.

## Verdict legend
KEEP = already original, accurate, SEO-safe · IMPROVE = keep intent, tighten wording/length/honesty · REWRITE = originality or honesty problem, replace fully.

---

## ⚠ Cross-cutting risks (highest priority)

1. **Templated thinness across 68 country pages** — `country-content.jsx` + `country-faq.jsx` render on every `/esim/[slug]` with only `${country.name}` (+ `${networks}` and plan-derived numbers in the content block) swapped. FAQ is worst (only the name varies). This is the single biggest scaled/thin-content exposure. **Mitigation already in force:** `countryIndexDecision()` keeps each page `noindex` until `content.approved === true` + real plans. Rewrites maximize honest uniqueness (lean on `${networks}` + plan numbers), but truly indexable pages still need per-country approved editorial.
2. **Hotspot / tethering claims (hard rule violation — hotspot = "Unknown" for all 385 plans)** — `site.json` ticker "Hotspot ready"; `reviews.json` Hiroko T. "single hotspot"; `quiz.json` four option descriptions ("light hotspot", "heavy hotspot", "kids' tablets, hotspot", "Video calls, hotspot"); `devices.json` "eSIM-capable mobile hotspots". All must drop tethering wording.
3. **Regional bundles are NOT live** (the Regional tab literally says "on the way"), yet hero subtitle, howItWorks features/step 1, ctaBand, ticker, and a sample review sell "regional plans". Remove those promises; keep the honest "coming soon" tab.
4. **Copied-looking legal block** — `terms.js` "Always On service" section describes subscriptions, a phone-number SMS service, free always-on data across ~100 named countries, and specific rollout dates. Contradicts the data-only prepaid product and reads as competitor boilerplate. **Remove/replace via legal counsel — do not auto-rewrite legal terms.**
5. **Glossary duplication** — the 11 `glossary.js` definitions read verbatim like Wikipedia leads / generic marketing (file comment: "verbatim from the source design"). Genuine duplicate-content risk on an indexable page → full original rewrite.
6. **Thin meta descriptions (below 140–155)** on how-it-works, help, glossary, about, contact, for-business, affiliates, and the country-page description → lengthen with honest, keyword-relevant copy.
7. **"Average activation / 2 min" stat** implies measured telemetry with 0 live plans/customers → reframe as typical setup time.
8. **"Reviews from real trips." (H2)** asserts authenticity over placeholder samples → drop "real".

---

## 1. Homepage + chrome

| Block | Purpose | Keyword / intent | Verdict | Risk |
|---|---|---|---|---|
| home hero | H1 + value prop | travel eSIM data, 60+ countries | **IMPROVE** | generic ("Zero hassle"); over-promises non-live "region" |
| home whatIsEsim | educational H2 | what is an eSIM (info) | KEEP | none |
| home whereTravelersGo | grid intro | per-day pricing, browse | **IMPROVE** | cta "Show all eSIM cards" ("cards" contradicts no-card message) |
| home howItWorks | 3-step how-to | QR activation, setup | **IMPROVE** | non-live "region"; doubled "validity" |
| home whyPick | benefit grid | keep your number, no roaming | KEEP | none |
| home ctaBand | closing CTA | compare/activate | **IMPROVE** | "regional plans" not live |
| home appCta | app teaser | retention | **IMPROVE** | app "coming soon" but copy says "Works on iOS/Android"; conditional top-up |
| reviews header | social proof | trust | **IMPROVE** | "real trips" asserts authenticity over placeholders |
| reviews items | sample testimonials | trust (samples) | mostly KEEP; **REWRITE Hiroko (hotspot), Elena (regional)** | none |
| faq header + 7 items | FAQ | prepaid travel eSIM, activation | KEEP | none (honest, no hotspot) |
| quiz intro | plan-finder lede | plan finder | **IMPROVE** | "catalog" jargon |
| quiz options | quiz answers | trip profiling | **REWRITE 4 hotspot descs**; others KEEP | none |
| quiz cta/recommendation | result | — | KEEP | none ("Unlimited daily plan" backed by real plans) |
| site tagline | brand line | no roaming/kiosks | KEEP | none |
| site ticker | trust marquee | benefits | **REWRITE** | hotspot violation; "worldwide" overclaim; vague; regional |
| site stats | KPI band | proof | **IMPROVE** ("Average activation"); 60+/385/4G-5G KEEP | unsupported metric |
| config/site.js description | default meta | travel eSIMs, QR, keep number | KEEP | none (143 chars, honest) |
| hero.jsx alt | LCP alt | travel eSIM connectivity | **IMPROVE** | "worldwide" overclaim |
| what-is-esim.jsx alts | alt/SEO | descriptive | KEEP | none |
| layout/page metadata | default title/canonical | brand + travel eSIM | KEEP | none (title 35 chars) |

## 2. Catalog + commerce

| Block | Purpose | Keyword / intent | Verdict | Risk |
|---|---|---|---|---|
| esim/[slug] title | SERP title | "[Country] eSIM" (transactional) | **IMPROVE** (lead with country) | none |
| esim/[slug] description | SERP snippet | buy eSIM / QR / no roaming | **IMPROVE** (was ~84–99 chars) | thin |
| esim/[slug] H1 | page H1 | exact-match "eSIM [Country]" | KEEP | none |
| esim/[slug] intro | supporting intro | — | **IMPROVE** | generic/duplicate (templated) |
| esim/[slug] CONFIDENCE | trust chips | — | **IMPROVE** | too-similar |
| esim/[slug] empty state | edge state | — | KEEP | none |
| country-content (4 blocks) | on-page depth | activation/networks/coverage | **IMPROVE** | duplicate (templated; networks/numbers vary → lower) |
| country-faq heading | FAQ H2 | "[Country] eSIM FAQ" | KEEP | none |
| country-faq Q1–Q4 | FAQ answers | install/activation long-tail | **IMPROVE** | **thin/duplicate (highest — only name varies)** |
| plan-selector labels/CTAs | commerce UI | — | KEEP | none |
| destinations-browser | browse UI | — | KEEP | none (regional line honestly promises nothing) |
| related / recently-viewed headings | internal links | — | KEEP | none |
| destinations title | SERP | "travel eSIM plans by country" | KEEP | none (28 chars) |
| destinations description | SERP snippet | browse plans | **IMPROVE** (~121 chars) | thin |
| destinations H1 + intro | page H1 | stay online in N countries | KEEP | none (renders honest "68") |
| checkout / payment / confirmation / auth | funnel UI (noindex) | — | KEEP | none (honest demo/USD/SSL/QR) |

## 3. Standalone pages + nav/footer/legal

| Block | Purpose | Keyword / intent | Verdict | Risk |
|---|---|---|---|---|
| what-is-esim body + metadata | education | what is an eSIM / how it works / vs SIM | KEEP | none (148-char meta) |
| how-it-works body | how-to | install/activate/scan QR | KEEP | none |
| how-it-works metadata | SERP snippet | — | **IMPROVE** | thin (121 chars) |
| devices checker/categories | compatibility | eSIM compatible phones | KEEP | none |
| devices "mobile hotspots" example | device category | — | **IMPROVE** | too-similar to no-tethering rule (wording) |
| supported-devices metadata | SERP snippet | — | KEEP | none (140 chars) |
| help hub + Q&As | support | eSIM help / install | KEEP | none |
| help metadata | SERP snippet | — | **IMPROVE** | thin (83 chars) |
| help category descriptions ×8 | card + category meta | — | KEEP | thin-but-intentional (card-sized) |
| help Usage answer | task answer | — | **IMPROVE** | soft: definite alert promise → hedge |
| glossary 11 definitions | reference | eSIM glossary/terms | **REWRITE** | **duplicate/too-similar (verbatim source)** |
| glossary intro | lede | — | **IMPROVE** | generic (duplicates meta) |
| glossary H1 / metadata | SERP | eSIM terms | KEEP H1 / **IMPROVE** meta | thin meta (115 chars) |
| about body | brand explainer | brand + travel eSIM | **IMPROVE** | thin (add honest pricing/account depth) |
| about metadata | SERP | — | **IMPROVE** | thin (97 chars) |
| contact body/form | support intake | — | KEEP | none (honest demo) |
| contact metadata | SERP | — | **IMPROVE** | thin (81 chars) |
| for-business body | B2B lead | business travel eSIM | **IMPROVE** | thin/generic |
| for-business title/metadata | SERP | — | **IMPROVE** | thin (97 chars); title duplicates brand |
| affiliates body | partner lead | eSIM affiliate/partner | **IMPROVE** | thin/generic |
| affiliates metadata | SERP | — | **IMPROVE** | thin (99 chars) |
| nav/footer labels, chrome | navigation | — | KEEP | none |
| config/nav.js, footer.js | dead config (unused) | — | KEEP | none (drift noted if ever wired) |
| legal privacy/refund/cookies | noindex boilerplate | — | KEEP | none material (confirm entity/jurisdiction at legal review) |
| **legal terms "Always On service" §** | noindex boilerplate | — | **REMOVE (legal)** | **unsupported/copied — contradicts data-only model** |
