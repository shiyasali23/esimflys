# Frontend Content & SEO Analysis — eSIMFlys

Our frontend's content + technical-SEO layer, matched to source files. Reflects the **current (post-rewrite) state**. Verbatim content extraction lives in `../seo-content/current-content.md`; this doc is the SEO-structural analysis used for cross-validation.

## 1. IA / routes / URL structure
Source: `src/config/routes.js`, `src/app/**`.
- `/` (`app/(marketing)/page.js`) · `/destinations` · `/esim/[slug]` (country) · `/what-is-esim` · `/how-it-works` · `/supported-devices` · `/help` + `/help/[category]` · `/glossary` · `/about` · `/contact` · `/for-business` · `/affiliates` · `/auth` (+ `/auth/signin|signup|forgot-password|reset-password`) · `/checkout` → `/checkout/payment` → `/checkout/confirmation` · `/account/esims` · `/legal/[doc]` (privacy/terms/refund/cookies).
- **URL parity with esim70** on the core spine (`/esim/[slug]`, `/destinations`, `/supported-devices`, `/what-is-esim`, `/glossary`, `/help`, `/about`, `/contact`) — intentional clone.
- **Divergences:** legal at `/legal/[doc]` (esim70: `/terms`,`/privacy`); `routes.blog()`/`blogPost()` exist in `routes.js` but **there is no `/blog` route** (dead builder, not linked); **no `/esim/[region]`** regional pages.

## 2. Content → source-file map (SEO-relevant)
| Page | Source file(s) | H1 | Content type |
|---|---|---|---|
| Home | `content/home.json` + `features/home/components/*` | "Instant travel eSIM data. / 60+ countries. / Online when you land." | 12-section marketing funnel |
| Country | `app/(marketing)/esim/[slug]/page.js` + `features/catalog/components/country-content.jsx`, `country-faq.jsx` | "eSIM {country.name}" | **templated** editorial + FAQ (see §5) |
| Destinations | `app/(marketing)/destinations/page.js` + `destinations-browser.client.jsx` | "Stay online in {68} countries" | directory + search |
| What is an eSIM | `content/what-is-esim.json` + page | "What is an eSIM?" | explainer (H2s: how it works, vs SIM, why, install) |
| How it works | `app/(marketing)/how-it-works/page.js` | "How eSIMFlys works" | 4-step |
| Supported devices | `content/devices.json` + page | "Devices that support eSIM." | checker + 6 categories |
| Help | `content/help.json` + `/help`, `/help/[category]` | "We've got answers" | 8 categories, Q&As |
| Glossary | `content/glossary.js` + page | "eSIM terms, demystified" | 11 terms (now original) |
| About/Contact/For-business/Affiliates | respective `page.js` | brand H1s | short marketing |
| Legal | `content/legal/*.js` + `/legal/[doc]` | doc titles | placeholder boilerplate |
| Reviews / stats / ticker | `content/reviews.json`, `content/site.json` | — | placeholder (sample-labelled) trust |

## 3. Technical SEO layer (source-verified)
- **Metadata:** `lib/seo/metadata.js` `buildMetadata()` → self-referential `alternates.canonical`, per-route `robots` (index or noindex+follow), full OpenGraph + `twitter:summary_large_image`. Root defaults in `app/layout.js`: title `default: "eSIMFlys | Instant Travel eSIM Data"` (**brand-first**), `template: "%s | eSIMFlys"`, `metadataBase` set.
- **robots.txt** (`app/robots.js`): `allow: /`, `disallow: [/api/, /search]`, sitemap linked. Correctly does **not** block `/checkout`,`/auth`,`/account` (kept crawlable + noindex).
- **Sitemap** (`app/sitemap.js`): static + help paths **+ only `isCountryIndexable` countries**. **Current indexable country count = 0** (0 `content.approved`, 0 with live plans) → **the sitemap ships ~21 URLs and zero of the 68 country pages.**
- **JSON-LD** (`lib/seo/jsonld.js`, emitted via `<JsonLd>`):
  - Global (`app/layout.js:51`): **Organization** + **WebSite** (SearchAction).
  - Country (`esim/[slug]/page.js:62`): **BreadcrumbList** + **Product** (AggregateOffer, USD, lowPrice/highPrice).
  - Glossary (`glossary/page.js:20`): **DefinedTermSet**.
  - **No FAQPage. No Review/AggregateRating** (policy: `config/flags.js` — never render until real). **No `logo`/`sameAs`** on Organization (omitted until real assets).
- **i18n / hreflang:** **none** (English only; no `alternates.languages`, no next-intl). Note: the backend `country_content` model has a `locale` column, but the frontend renders `en` only.
- **Index gate** (`config/indexing.js`): a `/esim/[slug]` page is indexable only when `country.content.approved === true` AND it has plans. This deliberately `noindex`s all 68 templated country pages today — the correct guard against scaled/thin-content, but it also means **0 country pages are currently eligible to rank.**

## 4. Keyword targeting (current)
- Home: travel eSIM, international eSIM data, buy eSIM online, no roaming, keep your number.
- Country: "[Country] eSIM", "eSIM for [Country]", "[Country] travel data plan" (title now leads with country name).
- Standalone: what is an eSIM / how an eSIM works; set up/install eSIM; eSIM compatible phones; eSIM glossary/terms.
- **Gaps vs esim70:** no non-English keyword targeting (no hreflang); no regional-bundle keywords ("Asia eSIM"); no blog/informational long-tail.

## 5. Country-page templating (the key structural fact)
`country-content.jsx` and `country-faq.jsx` render on all 68 `/esim/[slug]` pages with only `${country.name}` (+ `${networks}` and plan-derived data/validity in the content block) interpolated. The four content blocks and four FAQ answers are otherwise identical page-to-page. Post-rewrite they are original wording and more useful, but still **near-duplicate across destinations** → held at `noindex` by the gate. This mirrors esim70's *page structure* but not its *unique-per-country editorial depth*.

## 6. Honesty state (post-implementation)
Removed/kept clean: no hotspot claims, no non-live "regional plan" promises (hero/ticker/CTA/quiz/help all fixed), sample reviews now `verified:false` + labelled samples, "Average activation" → "Typical setup", glossary definitions original, all metadata 140–155 chars. **Outstanding content risk:** the `content/legal/terms.js` "Always On service" block (copied-looking competitor boilerplate) is still live — removal diff prepared in `../seo-content/terms-alwayson-removal.md`, awaiting legal sign-off.
