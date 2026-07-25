# eSIMFlys Platform Analysis

**Scope:** `frontend/`, `eSIM_DB_Catalogue_Launch.xlsx`, and `esim_frontend_design.md`  
**Analysis date:** 2026-07-20  
**Method:** recursive source review, workbook inspection of every used worksheet/range, data-quality profiling, cross-source comparison, dependency/configuration review, and frontend lint/test/build checks.

## 1. Executive summary

eSIMFlys is a direct-to-consumer travel-connectivity storefront for prepaid, data-only eSIM plans. The intended journey is: discover a destination, compare a real plan catalogue, select a plan, check out, pay, receive a QR code, install the eSIM, and connect on arrival while retaining the user's primary SIM/number. This definition is explicit in `esim_frontend_design.md` §§1, 5, 6, and 8 and is reflected in the implemented routes and components.

The frontend is a substantial, coherent Next.js 16 / React 19 prototype. It implements the main discovery pages, country plan selection, a persistent single-item cart, a three-step checkout demonstration, auth demonstrations, support/content pages, responsive navigation, currency display, SEO metadata/JSON-LD, and accessibility foundations. Lint passes; the only unit test passes. A production build could not complete in the analysis environment because `next/font` could not download Oswald and Poppins from Google Fonts—not because of a reported compilation error in application code.

It is **not launch-ready**. The most important blockers are:

1. All 385 catalogue plans have `status="paused"`; production filtering would expose zero purchasable plans. Development defaults currently show paused plans (`frontend/.env.example`; `frontend/src/config/flags.js:15-24`; `frontend/src/server/catalog/repository.js:38-52`).
2. Authentication, checkout identity, payment, order persistence, eSIM provisioning, QR generation, account data, and contact submission are demonstrations without backend calls (`frontend/src/features/auth/`, `frontend/src/features/checkout/`, `frontend/src/features/support/components/contact-form.client.jsx`).
3. The design document's honesty constraints are violated in rendered content: hotspot support is unknown for every plan but the ticker says “Hotspot ready”; regional plans do not exist but marketing claims them; sample testimonials are rendered as “real trips,” several are marked “Verified,” and one claims hotspot/regional use (`frontend/src/content/site.json:4-10`; `frontend/src/content/reviews.json:2-14`; `frontend/src/features/home/components/testimonials.client.jsx:16-51`).
4. Country editorial content is generated from templates in components, not authored/approved per-country content. Every country has `content.approved=false`, so every `/esim/[slug]` page remains `noindex` and absent from the sitemap (`scripts/generate_catalog.py`; `frontend/src/config/indexing.js`; `frontend/src/app/sitemap.js`).
5. Several target features are partial or absent: local-time widget, unlimited-duration selector, true plan filtering from the quiz, regional products/pages, blog, responsive footer accordions, real app links, language selection, backend exchange-rate refresh, error boundary, and robust test coverage.

## 2. Platform definition

| Dimension | Finding | Confidence / evidence |
|---|---|---|
| Product | Branded travel-eSIM storefront selling prepaid, data-only connectivity | Confirmed: design §§1, 5; homepage/country/checkout code |
| Primary purpose | Let travellers buy connectivity before travel and activate via QR without swapping their main SIM | Confirmed: design §1; `frontend/src/content/home.json`; checkout confirmation copy |
| Target users | Leisure travellers, business travellers, remote workers, backpackers, families, and short-stop travellers | Confirmed as intended segments: `frontend/src/content/quiz.json` |
| Value proposition | Fast online purchase, transparent country-specific plans, local partner networks, no physical SIM/kiosk, and retention of the main number | Confirmed as product messaging; operational delivery is not yet connected |
| Revenue model | Retail resale/markup of supplier eSIM packages | **Inference**, strongly supported by supplier package codes plus wholesale and retail USD prices in `Catalogue!A1:X386` |
| Catalogue size | 68 countries, 385 plans, 6 regions | Confirmed by workbook and generated JSON metadata |
| Commercial status | Prototype/demo; no active catalogue inventory or real transactional backend | Confirmed by `status`, flags, and demo component comments/behavior |

### Complete intended user journey

1. Land on `/`; understand the offer, browse featured destinations, use a three-question quiz, or open the directory.
2. Search/filter `/destinations` by country name or ISO code.
3. Open `/esim/[slug]`; review data allowance, validity, total price, network partners, and explanatory content.
4. Select a radio-card plan; selection is projected into a client-safe cart object and persisted in local storage.
5. Continue to `/checkout`; review the order and supply an email or choose Google identity.
6. Continue to `/checkout/payment`; intended production behavior is Stripe Payment Element, but current behavior simulates a 900 ms payment.
7. Reach `/checkout/confirmation`; current code fabricates a transient order number and decorative QR placeholder, clears the cart, and displays installation steps.
8. Intended post-purchase behavior is email delivery and account management at `/account/esims`; neither is connected.

## 3. Frontend architecture

### 3.1 Stack and dependencies

| Area | Implementation |
|---|---|
| Framework | Next.js `16.2.10`, App Router; React/React DOM `19.2.4` |
| Language | JavaScript/JSX, path alias `@/*`, `checkJs=true`, `strict=false` |
| Rendering | Server Components by default; client components for stateful UI; catalogue imported at build/server time |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss`; design tokens in `src/app/globals.css` |
| UI primitives | Radix Accordion/Dialog/Tabs/Slot; CVA, `clsx`, `tailwind-merge`; custom shadcn-style wrappers |
| Icons/motion | `lucide-react`; CSS marquee/reveal; IntersectionObserver; Embla carousel |
| Forms | Native form validation in most forms; `react-hook-form` and `zod` are installed but unused |
| State | React local state; Zustand persisted single-item cart; cookies + `<html data-currency>` for currency; localStorage for recently viewed |
| Testing | Vitest; one unit test for removal of server-only plan fields |
| Quality | ESLint with Next core web vitals; Lighthouse CI config for four routes |

The design calls for Framer Motion, but it is neither installed nor used. The implementation instead uses IntersectionObserver/CSS, which also appears in the design's stack table; the document is internally inconsistent because §2 says CSS/IntersectionObserver while §10 says Framer `whileInView`.

### 3.2 Structure and data flow

```text
XLSX Catalogue!A1:X386
  -> scripts/generate_catalog.py
  -> data/catalog.json == frontend/src/data/catalog.json
  -> server/catalog/repository.js (server-only raw data access/filter/sort)
  -> to-client-plan.js (removes wholesale/competitor/supplier fields)
  -> server-rendered pages + client selectors
  -> Zustand/localStorage cart
  -> demo checkout/payment/confirmation
```

The root and frontend catalogue JSON files are byte-identical at analysis time (same SHA-1). The generator preserves all spreadsheet fields, normalizes ISO codes, derives country aggregates/flags/slugs/live status, and injects blank editorial approval placeholders. The repository is the intended abstraction point for a future backend but does not use `API_BASE_URL` or `FLAGS.USE_MOCKS` to fetch anything today.

### 3.3 Configuration, build, and deployment

- `.env.example` defines `NEXT_PUBLIC_SITE_URL`, server-only `API_BASE_URL`, `USE_MOCKS`, `SHOW_PAUSED_PLANS`, optional Stripe publishable key, and optional analytics ID.
- `next.config.mjs` adds permanent redirects from `/plans`, `/plans/:slug`, and `/destinations/:slug`; image remote hosts are empty.
- Scripts: `next dev`, `next build`, `next start`, ESLint, and Vitest.
- README is still the generic create-next-app document and does not document this architecture, catalogue generation, flags, or launch blockers.
- No container, CI workflow, Vercel configuration, backend proxy routes, or explicit deployment manifest exists in `frontend/`.
- The production build requires network access on a clean build because `next/font/google` fetches fonts; the analysis build failed at this fetch.

## 4. Page and route inventory

| Public URL | Source | Status and behavior |
|---|---|---|
| `/` | `(marketing)/page.js` | Implemented; 12 intended homepage sections plus shared footer |
| `/destinations` | `(marketing)/destinations/page.js` | Implemented country search/tabs; All and Country are identical; Regional is an empty message |
| `/esim/[slug]` | `(marketing)/esim/[slug]/page.js` | Implemented static params, metadata/index gate, plans, templated content/FAQ, related/recently viewed; country only in actual data |
| `/supported-devices` | `(support)/supported-devices/page.js` | Implemented quick compatibility substring checker and six category tabs |
| `/what-is-esim` | `(marketing)/what-is-esim/page.js` | Implemented JSON-driven explainer |
| `/glossary` | `(support)/glossary/page.js` | Implemented glossary and DefinedTermSet JSON-LD |
| `/how-it-works` | `(marketing)/how-it-works/page.js` | Implemented, but contains hardcoded marketing content contrary to §4 |
| `/help`, `/help/[category]` | `(support)/help/` | Implemented; all eight tiles link and each has article accordions |
| `/about`, `/contact` | `(marketing)` | Implemented; copy is hardcoded and contact submission is local demo |
| `/for-business`, `/affiliates` | `(marketing)` | Extra versus core route table; lead-generation placeholders |
| `/auth` | `(auth)/auth/page.js` | Bento auth demo; no submissions wired |
| `/auth/signin`, `/auth/signup` | `(auth)/auth/*` | Duplicate/alternative auth UI demos |
| `/auth/forgot-password`, `/auth/reset-password` | `(auth)/auth/*` | Timer-based demo states only |
| `/account/esims` | `(marketing)/account/esims/page.js` | Static empty state; no authorization guard or account data |
| `/checkout` | `(shop)/checkout/page.js` | Reads local cart; identity controls are not submitted/required |
| `/checkout/payment` | `(shop)/checkout/payment/page.js` | Simulated purchase only |
| `/checkout/confirmation` | `(shop)/checkout/confirmation/page.js` | Random client-only order number and decorative QR; no persistence |
| `/legal/[doc]` | `(legal)/legal/[doc]/page.js` | Four placeholder legal pages under `/legal/*`, noindexed |
| `/robots.txt`, `/sitemap.xml` | `robots.js`, `sitemap.js` | Implemented; sitemap applies country index gate |
| 404 | `not-found.js` | Implemented full-chrome empty state |
| `/blog`, `/blog/[slug]` | — | Missing although specified |
| `/terms`, `/privacy` | — | Missing at specified canonical paths; implementation uses `/legal/terms` and `/legal/privacy` |
| Error boundary | — | Missing `error.js`/`global-error.js` |

Layouts separate marketing, support, shop, legal, and auth shells. Route groups do not alter URLs. Marketing/support/shop/legal use global header/footer; auth uses a minimal shell.

## 5. Component inventory

| Group | Components and responsibilities |
|---|---|
| Layout | `Header` (scroll/path-adaptive floating pill), `MobileMenu` (Radix full-screen dialog), `Footer`, `TrustTicker`, `ConsentBanner`, `SkipLink` |
| Currency | `CurrencySelector`, pre-paint `NoFlashCurrencyScript`, multi-variant `Price`; USD is canonical and eight display currencies are static conversions |
| UI primitives | `Button`, `Card`, `Badge`, `Tabs`, `Accordion`, `Input`, `Container`, `Section`, `Breadcrumbs` |
| Catalog | `DestinationsBrowser`, `PlanSelector`, `CountryContent`, `CountryFaq`, `RelatedCountries`, `RecentlyViewed`, `CountryFlag` |
| Home | Hero, explainer, destination cards, quiz, steps, benefits, Embla testimonials, CTA, stats, FAQ, app CTA |
| Auth | Bento, sign-in/sign-up card, forgot/reset password forms; all demonstrations |
| Checkout | Checkout summary/identity, payment simulation, confirmation/QR placeholder |
| Support/devices | Contact demo, device checker, category tabs |
| Feedback/SEO/motion | Empty state, JSON-LD script, IntersectionObserver reveal |

Potentially redundant/unused code:

- `src/config/footer.js` and `src/config/nav.js` have no imports; active header/footer data comes from `src/content/nav.json`.
- `FLAGS.USE_MOCKS`, `reviewsEnabled`, `regionsEnabled`, and `showHotspotClaim` are declared but not enforced where the corresponding content renders.
- `getCountriesByRegion()` is unused.
- `Card` and `SectionHeading` appear to have no consumers; most pages reproduce card/section classes directly.
- `react-hook-form` and `zod` are installed but unused.
- There are two overlapping auth presentations (`/auth` Bento and `/auth/signin`/`signup` cards).

## 6. User-flow analysis

### Discovery and comparison

- Homepage destination cards use eight editorially “popular” countries and calculate `perDayFrom` from fixed plans only. The design says minimum across plans, so excluding daily/unlimited plans is an implementation deviation (`repository.js:55-59`).
- Homepage “Best value” is dynamically assigned to the cheapest per-day destination in the displayed set, not mapped from the spreadsheet's `badge="value"`; this changes the business meaning of a catalogue badge.
- `/destinations` filters client-side by country name or ISO-2 code. Search has an accessible label and an explicit empty state.
- “All” and “Country” tabs show the same list; no alphabet grouping or region bundle data is shown.
- The quiz records purpose/need/duration but produces only a text recommendation and links to the unfiltered destination directory. It does not filter catalogue records despite the explicit requirement.

### Selection

- `/esim/[slug]` is statically parameterized from all 68 country slugs.
- Plan cards are keyboard-operable hidden radio controls; the default comes from `default_selected="yes"` (exactly one exists per country).
- Selection updates a sticky summary and writes a client-safe subset to Zustand/localStorage before routing to checkout.
- Unlimited plans are shown as a separate row per duration; the required duration dropdown is missing.
- The purchase summary omits the selected network partner and per-day price.
- If paused plans are hidden, `PlanSelector` returns nothing and the page still renders surrounding confidence/content without a plan-specific empty state.

### Purchase and activation

- The cart survives reloads but accepts only one plan and trusts client-local price/plan values.
- Checkout does not validate or persist email, promo code is absent, and Google does nothing.
- Payment is an explicit simulation; no Stripe dependency or API call exists.
- Confirmation produces `ESF-` plus random client text, clears the cart, and loses the order on refresh. The QR is decorative.
- Account, email delivery, top-up, download, usage tracking, and support processes are copy-only.

## 7. Spreadsheet schema and catalogue analysis

### 7.1 Workbook structure

The workbook has one worksheet, **`Catalogue`**, with used range **`A1:X386`**: one header row, 385 product rows, and 24 columns. There are no formulas or additional lookup/admin sheets identified.

| Field | Type/completeness | Meaning / frontend mapping |
|---|---|---|
| `product_id` | Text; 385/385; unique | Plan identifier, radio key, cart `planId` |
| `supplier_package_code` | Text; complete; 374 unique | Supplier fulfillment mapping; server-only in intended model |
| `plan_type` | Text; `fixed` 364, `daily` 21 | Determines unlimited/daily treatment |
| `day_count` | Numeric; 21 populated | Daily-plan duration; equals `validity_days` for all daily rows |
| `country_code` | Text; 68 unique | Country identity; 377 rows are 2-char, 8 Turkey rows use `TUR` and are normalized to `TR` |
| `country_name` | Text; 68 unique | Display name and slug source |
| `region` | Text; 6 values | Directory grouping/filtering potential |
| `display_name` | Text; 385 unique | Human-readable plan label; frontend reconstructs labels instead |
| `data_gb` | Numeric; complete; 1/2/3/5/10/20/50 | Fixed allowance or full-speed GB/day for daily plans |
| `validity_days` | Numeric; complete; 3/5/7/10/15/30 | Cards, cart, checkout |
| `traffic_policy` | Text; complete; 12 patterns | Critical FUP/top-up disclosure; currently unused in UI |
| `hotspot` | Text; complete, all `Unknown` | Must not support a hotspot claim |
| `network` | Text; complete; 67 strings | Split into country-level network list and displayed |
| `topup_supported` | Text; `yes` 364 / `no` 21 | Intended account/product detail; currently not shown |
| `wholesale_price_usd` | Numeric; complete | Cost/margin/admin field; stripped before client |
| `retail_price_usd` | Numeric; complete; $2.99-$129.99 | Canonical price, cards/cart/checkout/JSON-LD |
| `competitor_ref_price` | Numeric; 355 populated, 30 missing | Benchmark/admin field; stripped before client |
| `competitor_ref_brand` | Text; same 355 populated | Benchmark source; stripped before client |
| `wsp_verified_date` | Text/date-like; complete, all `2026-07-16` | Catalogue governance; not used by frontend |
| `status` | Text; complete, all `paused` | Live availability gate |
| `sort_order` | Numeric; complete; 1-8 | Plan merchandising order |
| `badge` | Text; 135 populated: 68 `popular`, 67 `value` | Plan merchandising badge |
| `default_selected` | Text; complete | Exactly one `yes` per country; selector default |
| `tier` | Text; 161 `A`, 224 `B` | Business/admin segmentation; unused by UI |

### 7.2 Catalogue organization and quality

- Countries: Europe 25/139 plans; Asia 23/127; Middle East & N.Africa 12/72; Americas 4/26; Oceania 2/11; Africa 2/10.
- Each country has 4-8 plans: 34 countries have 5, 21 have 6, 7 have 8, and 3 each have 4 or 7.
- Daily/unlimited plans occur in 10 countries (21 rows). Their `data_gb` is the full-speed daily allowance and traffic policy describes reduced speed after the threshold.
- Product IDs and display names are unique; there are no duplicate logical offers by country/type/data/validity.
- Ten supplier package codes are reused across different unlimited durations (one is reused for three Saudi durations). This may be valid supplier packaging, but fulfillment must prove that duration is sent separately; using package code alone would select ambiguously.
- Every retail price ends in `.99`; wholesale never exceeds retail. Implied gross margin ranges from 19.9% to 93.4%, median 67.1%. These large differences merit pricing review but are not inherently invalid.
- Competitor references are absent in 30 fixed-plan rows and present in 355 rows. The workbook does not define whether `competitor_ref_price` is total, per-GB, or per-day, so it cannot safely power customer-facing savings comparisons.
- Country name/code/region mappings are internally consistent. `TUR` is the sole non-ISO-2 code and is explicitly normalized by the generator.
- `wsp_verified_date` is stored as a string in the workbook import, not a typed Excel date.
- Naming is mostly snake_case, but generated fields switch to camelCase (`countrySlug`, `isLive`, `perDayGb`, `isUnlimited`), creating an intentional boundary mismatch that should be documented in a schema.

### 7.3 Data needed but missing

- Regional bundle identity, covered-country lists, and regional plan rows.
- Approved per-country editorial content, activation exceptions, network-specific notes, time zone, and localized FAQ.
- Verified hotspot/tethering support.
- Explicit list/original price or discount model.
- Defined semantics/unit/source URL for competitor reference prices.
- Currency-specific charge prices or a live/dated FX source.
- Provider/supplier display name (only package code and local network are present).
- Activation policy structured field; it exists only inside prose `traffic_policy`.
- APN, speed/FUP structured fields, voice/SMS support, eKYC requirements, coverage country list, refund constraints, and stock/provisioning availability.
- Product images/icons are not catalogue fields; flags are derived from ISO code.

## 8. Design-document requirements

### Explicit requirements

The design document explicitly requires:

- An exact visual/structural clone of esim70.com rebranded as eSIMFlys, subject to the reference teardown winning conflicts.
- Next.js 16, React 19, JS/JSX, Tailwind v4, shadcn/Radix primitives, Oswald/Poppins, JSON-driven content, static-first rendering, and build-time catalogue data.
- Twelve homepage sections in a fixed order.
- Unified `/esim/[slug]` country/region route; redirects from older paths.
- Per-day display prices computed from real plan totals and no fabricated discounts.
- Destination directory tabs/search; plan selector plus sticky purchase panel; local time, partner/network, rich country content, country FAQ, related/recent views.
- Checkout/auth/account/help/content/legal routes and responsive global navigation/footer.
- USD canonical pricing with pre-paint currency switching.
- SEO metadata, Product/AggregateOffer JSON-LD, sitemap/index gate, robots rules, redirects, and 404.
- WCAG 2.2 AA, keyboard operability, visible focus, reduced motion, labelled forms/live errors, and Lighthouse/axe thresholds.
- Strict honesty: no copied/false reviews, ratings, traveller counts, hotspot claims, or savings.

### Assumptions and recommendations, not confirmed business facts

- esim70.com visual parity is an aspiration; this audit did not browse/re-verify the external site, and the user asked to analyze local sources.
- The “popular” country set is provisional editorial data in the generator, not evidence of sales/popularity.
- App stores, social profiles, analytics, backend at `:8000`, Stripe, daily FX refresh, and per-country editorial authoring are future expectations.
- The design's “150+ countries” sample target conflicts with the confirmed 68-country catalogue; implemented copy uses “60+,” which is truthful but imprecise.
- Marketing statements about instant delivery, activation time, support quality, 4G/5G availability, and refunds require operational/legal verification before launch.

## 9. Cross-reference matrix

| Capability | Design requirement | Catalogue support | Frontend status |
|---|---|---|---|
| Country discovery | Search, All/Country/Regional | Country, ISO, region available | **Partial:** search works; no grouping/bundles; duplicate All/Country tabs |
| Per-day pricing | Minimum total/validity | Price + validity available | **Partial/deviation:** fixed plans only; cards hardcode `$` rather than `Price` |
| Plan cards | Allowance, validity, price, badge | Fully supported | **Implemented**, but raw badge label shows `value`, not “Best value” |
| Unlimited duration | Dropdown | Multiple daily rows/durations | **Partial:** separate cards, no dropdown |
| Network partner | Show in purchase summary | `network` populated | **Partial:** separate network list, omitted from sticky summary/cart |
| Hotspot | Only if verified | All `Unknown` | **Conflict:** UI ticker/review claim hotspot |
| Regional products | Tabs/pages/products | No regional rows | **Missing**, but marketing claims them |
| Quiz filtering | Return matching plans | Data/validity/type support filtering | **Partial:** static recommendation only |
| Checkout | Identity, promo, Stripe | Catalogue gives plan/price | **Demo:** no validation/API/promo/payment |
| Activation | Real order/QR/email | Supplier package code available | **Missing:** random order/decorative QR only |
| Account/top-up | Manage purchases/top-ups | 364 rows say top-up yes | **Missing:** static empty state |
| Country SEO content | Approved unique per country | No editorial data in XLSX; generated placeholders | **Missing:** all country pages noindex |
| Currency | USD + display variants | USD prices only | **Partial:** static indicative rates; no geo default implementation/backend refresh |
| Reviews/stats | Placeholder only, clearly labelled | Not catalogue-driven | **Conflict:** visible “real/Verified” samples and unsupported stats |
| Devices/help | Checker + six categories; eight linked help areas | Independent of catalogue | **Implemented/partial:** simple compatibility matching; help claims unavailable account features |

## 10. Implemented, partial, and missing features

### Implemented

- Target font/color/radius system, responsive Tailwind layouts, floating header, full-screen mobile dialog, ticker, reveal, carousel, tabs, accordions.
- Homepage section order and reusable content/component split for most homepage content.
- Country catalogue generation, server-only repository, client-safe plan projection, plan sorting/defaulting.
- Country and code search, plan selection, persisted cart, empty/loading states.
- Currency cookie/no-flash display and USD-canonical structured data.
- Metadata, canonicals, Organization/WebSite/Product/Breadcrumb/DefinedTermSet JSON-LD, robots, sitemap gating, redirects, and 404.
- Eight linked help categories, explainer, glossary, device categories, contact UI.
- Skip link, semantic fieldset/radios, focus styles, reduced-motion CSS, Radix keyboard behavior, and several `aria-live`/status/loading signals.

### Partial

- JSON-driven content: homepage/help/devices are data files; about, how-it-works page, country content/FAQ, confidence bullets, auth, checkout, and legal copy remain hardcoded.
- Header adapts only to home-at-top versus all other states, not arbitrary page sections.
- Footer has four data columns but no mobile accordion behavior, real store links, or complete specified links.
- Destination tabs and regional experience are presentation placeholders.
- Plan details omit traffic policy, top-up, hotspot unknown state, selected partner, per-day price, and unlimited duration dropdown.
- Device checker returns “yes” or “unknown,” not reliable Yes/No, and substring matching can create false positives.
- Consent records a choice, but no analytics exists to gate.
- Accessibility baseline is good, but no evidence of axe/Lighthouse results; carousel autoplay does not pause on hover/focus and code does not explicitly check reduced motion.

### Missing

- Real auth/authorization/session and account route protection.
- Backend/BFF calls, inventory checks, secure server price validation, payment, webhook/order lifecycle, provisioning, real QR, email, top-up, and usage tracking.
- Blog routes/content; canonical `/terms` and `/privacy`; runtime error boundaries.
- Regional catalogue model and route handling.
- Local-time widget and country-specific approved editorial store.
- Form error model, zod/react-hook-form boundary validation, toast system, skeleton components, select/dropdown component.
- Automated coverage beyond one projection test; E2E, integration, accessibility, and catalogue validation tests.

## 11. Data and integration gaps

1. **No active inventory:** changing `SHOW_PAUSED_PLANS=false` makes the store non-commercial.
2. **No runtime source:** `API_BASE_URL` and `USE_MOCKS` do not alter repository behavior.
3. **Client-trusted commerce:** localStorage contains the price and plan; a real backend must reload the product and calculate totals server-side.
4. **Fulfillment ambiguity:** repeated supplier package codes across unlimited durations require a documented supplier request contract.
5. **Data disclosure loss:** traffic/FUP and top-up fields are not presented to buyers.
6. **Static FX:** displayed amounts are indicative and potentially stale; checkout says USD charging, so local displays must remain clearly non-binding.
7. **Content/source mismatch:** content claims 60+ while exact catalogue count is 68; exact dynamic values should replace duplicated strings where practical.
8. **Two catalogue copies:** they are identical now but manual copying creates drift risk; the generator/build should produce or validate the frontend copy.
9. **No schema validation:** zod is installed but neither generated JSON nor backend boundaries are validated at runtime/build time.

## 12. Bugs, risks, and inconsistencies

| Priority | Finding | Evidence / impact |
|---|---|---|
| P0 | Paused plans are buyable in default development configuration | `.env.example`, flags and repository; can misrepresent availability |
| P0 | Checkout simulates payment/order/QR | Payment and confirmation components; no commercial fulfillment |
| P0 | False/unsupported hotspot and regional claims | Workbook all `Unknown`; no regional products; `content/site.json` and reviews |
| P0 | Sample testimonials are presented as real/verified | `reviews.json:2-14`, testimonial rendering; violates design §14 |
| P1 | JSON-LD says `InStock` for paused plans and uses all rendered paused offers | `lib/seo/jsonld.js`; misleading structured data in dev-like production config |
| P1 | `reviewsEnabled=false` and other flags are dead controls | Flags declared but not consumed in homepage/content paths |
| P1 | Country metadata uses `country.priceFrom` total minimum while copy says “from $X” and design emphasizes per-day | Country page metadata versus repository per-day method |
| P1 | Country content claims activation starts on network connection, but this rule is not a structured catalogue field and may vary by supplier | `CountryContent` and `CountryFaq`; operational risk |
| P1 | Country content claims 4G/5G generically although some network strings contain only 4G and availability is conditional | Product page copy and Product JSON-LD |
| P1 | Help/FAQ promises account download, data tracking, notifications, top-ups, support, and refund behaviors not implemented | `content/help.json`, `content/faq.json` |
| P1 | No authorization on `/account/esims` | Route is publicly renderable static empty state |
| P2 | `Best value` homepage badge is derived from displayed per-day minimum, not catalogue badge | `where-travelers-go.client.jsx` |
| P2 | Per-day calculation excludes daily plans despite broad design wording | `repository.js:55-59` |
| P2 | Static USD symbols on destination cards bypass multi-currency component | destination/home catalogue components |
| P2 | Carousel autoplay lacks explicit pause-on-hover/focus and reduced-motion logic | testimonials component |
| P2 | Header component ignores passed `activeNav` prop from support layout | support layout versus Header signature |
| P2 | `JsonLd` serializes unescaped JSON directly; values currently controlled, but future content containing `</script>` needs safe escaping | `components/seo/json-ld.jsx` |
| P2 | `wsp_verified_date` is a text string and competitor price unit is undefined | Workbook schema/governance ambiguity |
| P3 | Generic README, unused configs/dependencies, duplicated auth UI, and direct style repetition increase maintenance cost | Frontend inventory |
| Environmental | Production build failed fetching Google Fonts in the restricted analysis environment | Consider self-hosting fonts for deterministic/offline builds |

## 13. Recommended next actions

1. **Enforce a launch-safe mode:** default `SHOW_PAUSED_PLANS=false`; fail production builds when any paused plan is exposed, when zero active plans exist, or when unsupported claims are present.
2. **Remove honesty violations immediately:** suppress testimonials through `reviewsEnabled`; remove “Hotspot ready,” regional claims, “Verified” sample labels, fake activation metrics, and unavailable-feature promises until supported.
3. **Define and implement the backend contract:** product lookup, availability, authoritative pricing, identity/session, Stripe PaymentIntent/webhook, idempotent orders, supplier fulfillment, QR/email delivery, refunds, top-up, and account APIs.
4. **Add catalogue validation:** zod/JSON schema and CI checks for uniqueness, ISO codes, allowed enums, one default/country, positive prices/validity, wholesale ≤ retail, active inventory, badge rules, supplier-duration mapping, and typed verification dates.
5. **Make the XLSX-to-frontend path single-source:** generate one canonical artifact during CI/build or verify both JSON copies by hash.
6. **Finish product disclosure:** render traffic/FUP, top-up eligibility, activation rule, network, and verified hotspot state; add missing structured catalogue fields.
7. **Build authored country content:** time zone, activation/network notes, context, FAQ, approval metadata; only then open the existing index gate.
8. **Complete discovery:** real regional data or hide Regional UI; make quiz produce encoded filters/results; alphabetize/group directory; unify multi-currency per-day rendering.
9. **Close route/design gaps:** blog or remove links/spec, canonical legal routes/redirects, local-time widget, mobile footer accordions, error boundaries, and real app/social states.
10. **Expand verification:** repository/generator tests, plan-selector/cart integration tests, checkout E2E with payment test mode, sitemap/metadata snapshots, accessibility automation, and Lighthouse runs. Self-host fonts or guarantee build-time network access.

## 14. File-level evidence and references

### Primary sources

- `eSIM_DB_Catalogue_Launch.xlsx` — `Catalogue!A1:X386`; 24-column source catalogue profiled without modification.
- `esim_frontend_design.md` — complete v3.0 product/design specification; especially §§0-17.
- `scripts/generate_catalog.py` — catalogue normalization, derived fields, warnings, popular-country set, editorial placeholders.
- `data/catalog.json` and `frontend/src/data/catalog.json` — identical generated catalogue copies; metadata plus countries and plans.

### Frontend evidence map

| Topic | Files |
|---|---|
| Dependencies/build | `frontend/package.json`, `package-lock.json`, `next.config.mjs`, `jsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.js`, `lighthouserc.json`, `.env.example` |
| Route/layout inventory | `frontend/src/app/**/page.js`, all `layout.js`, `not-found.js`, `robots.js`, `sitemap.js` |
| Theme/responsive/motion | `frontend/src/app/globals.css`, `components/layout/*`, `components/motion/reveal.client.jsx`, UI primitives |
| Catalogue data flow | `frontend/src/server/catalog/repository.js`, `features/catalog/lib/to-client-plan.js`, its test, catalog components |
| Cart/checkout | `features/cart/use-cart.client.js`, `features/checkout/components/*` |
| Auth/account | `features/auth/components/*`, auth routes, `account/esims/page.js` |
| Currency | `config/currencies.js`, `config/rates.js`, `components/currency/*`, `proxy.js` |
| SEO | `config/indexing.js`, `lib/seo/*`, `components/seo/json-ld.jsx`, robots/sitemap/redirects |
| Content and honesty | `frontend/src/content/*.json`, `content/glossary.js`, homepage components, `config/flags.js` |

### Verification results

- `npm test`: **passed**, 1 file / 1 test (`toClientPlan` field stripping).
- `npm run lint`: **passed** with no reported issues.
- `npm run build`: **not completed**; Next.js/Turbopack reported failure fetching Oswald and Poppins from `fonts.googleapis.com` in the network-restricted environment. No application compile error was reached/reported.
- Spreadsheet: inspected read-only; one sheet, used range `A1:X386`; no workbook modification or export performed.

### Limits of certainty

- No backend source is present in scope, so operational behavior mentioned only in copy/comments is not treated as implemented.
- The external esim70.com reference was not re-browsed; findings compare the three requested local sources.
- Visual parity and live-browser accessibility/Lighthouse scores were not claimed because the production build could not start without font access.
- “Likely business model” and margin observations are inferences from wholesale/retail fields, not confirmed commercial policy.
