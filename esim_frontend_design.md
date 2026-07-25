# eSIMFlys — Frontend Design & Rebuild Spec (esim70-exact target)

> Single source of truth for the frontend. The goal is an **exact visual + structural clone of https://www.esim70.com/** (design system, component library, section structure, routing, interactions), rebranded as **eSIMFlys** and rendering **our own real catalogue data**.
> Reference teardown: [`how_reference_platfrom_build.md`](./how_reference_platfrom_build.md) (verified live from esim70.com).
> Version 3.0 · 2026-07-18 · Replaces the prior "Kinetic Horizon" spec (v2.2) — see §15 for what changes and why.

---

## 0. How to use this document

- **Target = esim70.com, cloned exactly** in look, layout, components, sections, motion, and routing. Where this spec and the reference teardown disagree, the **live reference teardown wins** (re-verify against it).
- We keep **our real catalogue** (`data/catalog.json` — 68 countries, 385 plans) and our **verified SEO/currency/cart foundation**; we replace the *design layer and page structure* on top.
- **Honesty line (non-negotiable, §14):** replicate esim70's design/components/sections exactly, but **never copy esim70's real reviews, its 4.3★/109-reviews rating, or its "250K+ travelers connected"** onto eSIMFlys. Those components are built with clearly-labelled placeholder data until eSIMFlys has its own real numbers.
- **Content is JSON-driven (§4).** No marketing copy hardcoded in components.
- **Keep it simple (§ RULES).** Only build what esim70 has and what we need. No over-engineering.

---

## 1. Target & Product

**Product:** eSIMFlys — a direct-to-consumer travel-eSIM storefront. Prepaid data-only eSIM plans; buy online → scan QR → data on arrival; keep your number; skip roaming/kiosks. Framed on **per-day pricing** ("from $X/day").

**Design lineage:** esim70.com is the exact design reference. eSIMFlys uses esim70's design language with our own brand mark/name and our real catalogue.

**Brand:** name/logo = **eSIMFlys** (paper-airplane mark + wordmark). Everything else (type, color, layout, components, motion) matches esim70.

---

## 2. Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router) · React 19 | current; RSC-first; already scaffolded |
| Language | **JavaScript / JSX** + `jsconfig checkJs` + **zod** at boundaries + JSDoc | user decision; zero SEO/perf cost |
| Styling | **Tailwind CSS v4** (`@theme`) | matches esim70 |
| **Component library** | **shadcn/ui** (Radix primitives + CVA + `cn`) | esim70 uses it; the earlier hand-rolled build did not — this is the #1 correction |
| Motion | **IntersectionObserver + CSS** (scroll-reveal, no-JS-safe), **embla-carousel** (testimonial carousel), CSS keyframes (trust ticker) | matches esim70's reveal + running carousels; framer-motion dropped for SSR/no-JS safety |
| Fonts | **Oswald** (display, uppercase) + **Poppins** (body), via `next/font` | matches esim70 exactly |
| Data | build-time `data/catalog.json` (from the spreadsheet generator); backend later at `:8000` | keep the working data layer |
| State | RSC + URL params + Zustand (cart) + cookie (currency) | keep |

Add exactly these deps: `@radix-ui/*` (via shadcn), `class-variance-authority`, `framer-motion`, `embla-carousel-react`. Nothing more.

---

## 3. Design System (esim70 — verified values)

### 3.1 Tokens (`globals.css @theme`, shadcn set)
```
--radius: .625rem;              /* 10px base */
--background: #ffffff;  --foreground: #0a0a0a;
--card: #ffffff;  --card-foreground: #0a0a0a;
--primary: #615de5;            /* indigo — brand */
--primary-foreground: #ffffff;
--secondary/--muted/--accent: #f5f5f5;  --muted-foreground: #737373;
--destructive: #e40014;
--border/--input: #e5e5e5;  --ring: #615de5;
--chart-1..5: #f05100, #009588, #104e64, #fcbb00, #f99c00;
```
### 3.2 Brand accents (used surgically, beyond the shadcn tokens)
- **Electric blue `#3535ff`** — primary CTA + active tab fill ("Continue to checkout", "All" tab).
- **Lime `#c6f135`** — exactly one emphasized hero word ("150+ countries").
- **Indigo/purple gradient** — hero + marketing bands (built on `--primary #615de5`).
- **Red/coral** (chart-1/destructive family) — trust ticker strip, mobile "Sign in" CTA, logo accent.
- Neutrals: text `#0a0a0a` on white; muted `#737373`; borders `#e5e5e5`/`#ececf2`; fills `#f5f5f5`/`#fafafa`.

### 3.3 Type
- **Oswald** (display): all big headings + section H2s + mobile nav links, **uppercase**, weight up to 900. Hero H1 ≈ 50/60px, 900, uppercase. `next/font` var `--font-oswald`.
- **Poppins** (body): paragraphs, labels, buttons, UI. 16px base. `next/font` var `--font-poppins`.
- Eyebrows = small uppercase letter-spaced labels ("NO KIOSK NEEDED", "STEP 1 OF 3").

### 3.4 Shape / elevation / motion
- Radius: cards **~22px**, buttons **pill** (fully rounded) or 18px (checkout CTA), inputs rounded, base token 10px.
- Elevation: **flat, border-led** (1–2px borders `#e5e5e5`/`#ececf2`); shadows subtle-to-none.
- Motion: scroll-reveal (opacity/translate on in-view), infinite marquee (trust ticker), auto-scrolling testimonial carousels, tab/accordion transitions, header color adapts to section, live local-time widget. Respect `prefers-reduced-motion`.

---

## 4. Content Model (JSON-driven — mandatory)

All static/marketing copy lives in **`src/content/*.json`** and is imported by server components. No hardcoded marketing text in components (the earlier build hardcoded arrays in page files — corrected).

| File | Holds |
|---|---|
| `content/site.json` | brand name, tagline, socials, app-store URLs, stats band, ticker items |
| `content/nav.json` | header nav, footer columns/links |
| `content/home.json` | hero, "what is an eSIM", "where travelers go" heading, "why travelers pick" (5), "how it works" (3 steps + badges), CTA band, section eyebrows/headings |
| `content/quiz.json` | 3 steps: purpose (6 options), needs, duration — labels + descriptions |
| `content/faq.json` | 7 Q&A (verbatim from reference), "still curious" links |
| `content/reviews.json` | **placeholder** testimonials (name/initials/trip/rating/verified) — clearly sample data, not esim70's |
| `content/glossary.json` | terms |
| `content/devices.json` | device categories + manual-check steps |
| `content/what-is-esim.json` | explainer sections |
| `content/help.json` | help hub: 8 categories → each with real Q&A/guide articles (drives `/help/[category]`); every tile links to real content |
| `content/legal/*.mdx` | terms/privacy/refund (placeholder pending approval) |

Per-country editorial content (When to activate / Network partners / Connection details / Country context / Why eSIM here / country FAQ) lives per-country in `content/countries/{slug}.json` (or MDX) — required before a country page is indexable (§11 index gate).

---

## 5. Data Model & Pricing (our real catalogue)

- Source: `data/catalog.json` (68 countries, 385 plans; generator `scripts/generate_catalog.py`). Fields per plan: `product_id, countrySlug, iso2, plan_type(fixed|daily), data_gb, perDayGb, validity_days, retail_price_usd, isUnlimited, badge(popular|value|null), default_selected, tier, status, isLive, network, topup_supported` (+ server-only `wholesale_price_usd`, `competitor_ref_*`).
- **Per-day pricing (esim70's headline unit):** `pricePerDay = retail_price_usd / validity_days`. A country's **"from $X/day"** = `min(pricePerDay)` across its plans. Compute in the repository; expose on `Country` and plan cards.
- **Badges:** map from data — `badge:"popular"` → **Popular**, `badge:"value"` → **Best value**. **"Trending"** is not in our data → **omit** unless the business adds a real flag (no fabrication).
- **Savings/strikethrough:** esim70 shows a discounted per-day. We have no real "list/original" price → **do not fabricate a strikethrough.** Options: (a) omit savings, or (b) if `competitor_ref_price` is present, show an honest "vs $X elsewhere" comparison. Default: omit until a real discount model exists.
- **Data blockers (unchanged):** all plans `status="paused"` (dev flag renders them; activate before launch); `hotspot="Unknown"` (don't claim). Server-only fields never reach the client (`toClientPlan()`).

---

## 6. Route Map (esim70 pattern)

| Route | Purpose | Render / Index |
|---|---|---|
| `/` | Homepage (all sections §8.1) | SSG/ISR · index |
| `/destinations` | Directory: All/Country/Regional tabs + search | SSG/ISR · index |
| **`/esim/[slug]`** | Country **and region** plan detail (unified) | SSG(`generateStaticParams`)+ISR · **index-gated §11** |
| `/supported-devices` | Model checker + 6 device categories | SSG/ISR · index |
| `/what-is-esim` | Explainer | SSG · index |
| `/glossary` | Terms | SSG · index |
| `/blog` `/blog/[slug]` | Guides (needs real content) | SSG/ISR · index |
| `/how-it-works` → `/#how-it-works` · `/#faq` · `/#testimonials` | homepage anchors | — |
| `/auth` | Sign in / create / guest (bento) | dynamic · noindex |
| `/account/esims` (+ account area) | My eSIMs (auth) | dynamic · noindex |
| `/checkout` `/checkout/payment` `/checkout/confirmation` | funnel | dynamic · noindex |
| `/help` (+ `/help/[category]`) | help hub — **every category tile links to real content** + per-category pages | SSG/ISR · index |
| `/about` `/contact` | company/support | SSG · index |
| `/terms` `/terms#refunds` `/privacy` | legal | SSG · noindex placeholder |
| `not-found` (404) · `error` | utility | — |

**Redirects (308):** `/destinations/[country]` → `/esim/[country]`; keep the old `/plans*` → `/esim/*` too. This is the routing correction (was `/destinations/[country]`).

---

## 7. Navigation

- **Header:** floating rounded pill bar, **section-adaptive color** (white text on hero/purple bands, dark on white). Left: eSIMFlys logo. Center: **Home · Destinations · Supported devices · How it works · FAQ**. Right: **language/region selector** (drives currency) + **Sign in** (translucent outlined pill). "← Back" variant on `/auth`.
- **Mobile:** logo · language pill · **hamburger** → **full-screen white overlay** with large uppercase Oswald links + **bottom-pinned red "Sign in"** pill + ✕ close.
- **Footer:** 4 columns — **About Esim70→About eSIMFlys** (About, Browse Plans, Reviews, Contact, Help center, How It Works, Sign in), **Top destinations** (7 + All), **Resources** (What is an eSIM, Supported Devices, Blog, Glossary, FAQ, My eSIMs), **Legal** (Terms, Privacy, Refund) + **App Store/Google Play badges** + **social** + "© {year} eSIMFlys". On mobile, columns collapse to accordions.

---

## 8. Page Specs

### 8.1 Homepage — exact esim70 section order
1. **Hero** — Oswald H1 "Instant travel eSIM data." / "**150+ countries.**" (lime) / "Zero hassle." · sub · big rounded **"Choose a destination"** search + quick country chips (real popular countries) · traveler + "70"-style brand graphic on purple gradient.
2. **Trust ticker** — **red** infinite marquee: "Best value routes · Hotspot ready · Fast 4G / 5G worldwide · Regional and country plans" (⚡).
3. **What is an eSIM?** — explainer paragraph (JSON), links to `/what-is-esim`.
4. **Where travelers go** — "Compare per-day pricing…" · **Country / Regional tabs** · destination cards (flag, name, **badge** Popular/Best-value, **from $X/day**, [optional honest savings]) · **"Show all eSIM cards"** → `/destinations`.
5. **Find your perfect plan** — **3-step quiz** (purpose/needs/duration → filtered plans); "STEP n OF 3", option cards + Back/Next.
6. **How it works** — eyebrow "No kiosk needed" · "Buy it. Scan it. Land online." · feature chips (Country+region, Instant QR, Main SIM stays active) · **01/02/03** numbered steps · "Explore travel plans".
7. **Why travelers pick eSIMFlys** — 5 benefit cards.
8. **Real reviews** — **running testimonial carousel(s)** (embla, auto-scroll) + rating eyebrow. **Placeholder data** (§14).
9. **CTA band** — "Leave home planned. Land already online." + 3 assurances.
10. **Stats band** — 4 stats (150+ countries, travelers, rating, avg activation). **Placeholder numbers** except the real ones (countries = real).
11. **FAQ** — accordion, 7 items (verbatim Q&A from `faq.json`), "still curious" links.
12. **App CTA** — "Take eSIMFlys with you" + store badges.
13. **Footer.**

### 8.2 `/destinations`
H1 "Stay online in {N} countries" · **All / Country / Regional** tabs · search ("Search by country or country code (e.g. JP)") · alphabetical directory of all destinations (flag, name, region tag, some with "· from $X"), regional bundles inline with intro text. Fully crawlable `<a>` links.

### 8.3 `/esim/[slug]` (country + region)
- H1 "eSIM for {Country}" (flag) · "Plans from $X per day" · **live local-time widget** ("It's HH:MM in {Country}").
- **"Choose your plan"** — selectable plan grid (radio; BEST VALUE banner; GB/validity/price; Unlimited has a validity dropdown) → updates **sticky purchase panel** (plan, validity, **network partner**, price, **Continue to checkout**, **Purchase confidence** bullets).
- **Per-country content sections** (JSON per slug; drives the index gate): When to activate · Network partners · Connection details · Country context · Why eSIM here, not a local SIM · **4-step** how-it-works · **country-specific FAQ** · **Continue your trip** (related) · **Recently viewed** chip.

### 8.4 `/supported-devices`
H1 "Devices that support eSIM." · **model search → instant Yes/No** · "dial `*#06#` … EID" manual check · **6 category tabs** (Smartphones, Smartwatches, Tablets, Laptops, Wi-Fi Routers, Cars) with per-brand counts/models.

### 8.5 `/auth`
Bento: "Sign in fast" (Continue with Google · email/password w/ show-hide · "Need an account? Create one") + "Prefer not to create an account yet?" (Guest email → Continue as guest). Backend-owned; demo stubs.

### 8.6 Checkout funnel
`/checkout` (order from cart, identity, promo) → `/checkout/payment` (Stripe hosted element; demo) → `/checkout/confirmation` (order #, QR panel, install steps). Keep current flow; re-skin to esim70.

### 8.7 Help hub (`/help` + `/help/[category]`)
H1 "We've got answers" + 8 category tiles (Installation, Activation, Devices, Billing & Refunds, Travel & Coverage, Data Usage, Account & Security, Troubleshooting). **Every tile is clickable** — each links to `/help/[category]` (real Q&A/guides from `content/help.json`) or a mapped existing page (Devices → `/supported-devices`, Billing & Refunds → `/terms#refunds`). **No non-clickable tiles.** Below: "Common questions" accordion + "Still need help?" → contact/glossary.
> Current build links only Devices + Billing & Refunds; the other 6 render as dead `<div>`s — R5.4 fixes this (every tile routes to real content, else the tile is not shown).

### 8.8 Content/company/legal
`/what-is-esim`, `/glossary`, `/blog(/[slug])`, `/about`, `/contact`, `/account/esims`, `/terms(#refunds)`, `/privacy`.

---

## 9. Component Inventory (shadcn + custom)

**shadcn/ui (add only what's used):** Button, Card, Badge, Tabs, Accordion, Dialog/Sheet (mobile menu, consent), Input, Select/DropdownMenu (language, plan duration), Carousel (embla), Skeleton, Separator, Sonner/Toast.

**Custom (composed on shadcn + tokens):** `Header` (section-adaptive), `MobileMenu` (full-screen), `Footer` (accordion on mobile), `TrustTicker` (marquee), `HeroSearch`, `CountryChip`, `DestinationCard` (per-day + badge + savings), `PlanCard`+`PlanSelector`, `PurchasePanel`, `TripQuiz`, `HowItWorksSteps`, `BenefitCard`, `TestimonialCarousel`, `StatsBand`, `FaqAccordion`, `AppBadges`, `LocalTimeWidget`, `RecentlyViewed`, `DeviceChecker`, `CategoryTabs`, `Price` (multi-currency, keep), `CurrencySelector`, `LanguageSelector`, `NoFlashCurrencyScript`, `JsonLd`, `EmptyState`.

**Removed vs current:** hand-rolled `button/badge/section/container` become shadcn-based; `mobile-nav-drawer` → full-screen `MobileMenu`.

---

## 10. Interaction & Motion

Scroll-reveal (framer `whileInView`, staggered) · trust ticker (CSS marquee) · testimonial carousel (embla auto-scroll, pause on hover) · tabs (instant filter, active = electric-blue pill) · accordion (one-open FAQ, chevron rotate) · quiz (stepper, Back/Next, progress) · plan select → sticky panel update + Unlimited duration dropdown · language → currency switch · consent modal (Accept/Deny) · recently-viewed persistence · local-time tick · header color adapt on scroll · hover/press states. All gated by `prefers-reduced-motion`.

---

## 11. SEO (keep our foundation, re-targeted)

- Static-first (SSG/ISR); RSC HTML; unique title/description/canonical per route; `next/font`; `next/image`.
- **`/esim/[slug]` index gate (unchanged principle):** a country/region page is `noindex` + excluded from sitemap until its `content/countries/{slug}.json` editorial content is authored + approved (`contentApproved`). Prevents thin/scaled-content penalty across 68+ pages. esim70's country pages are content-rich — we match that depth per §8.3.
- JSON-LD: Organization, WebSite(SearchAction), Product/AggregateOffer (USD, string prices, **no fabricated reviews/aggregateRating**), BreadcrumbList, DefinedTermSet (glossary). No FAQ/HowTo rich-result markup (deprecated) — keep as visible content.
- robots (allow /, disallow /api,/search; never disallow noindex routes), sitemap (gate-passing URLs only), 308 redirects, real 404.
- Per-day price in `Offer`? Keep `price/priceCurrency:"USD"` = the real plan totals; per-day is display only.

---

## 12. Currency & i18n

Keep the **USD-canonical, no-flash multi-currency** system (§ prior): all currency variants rendered, revealed by `<html data-currency>` set pre-paint; language/region selector switches currency via cookie; edge-geo default. Per-day prices convert the same way.

---

## 13. Accessibility (WCAG 2.2 AA)

shadcn/Radix gives correct roles/focus for tabs/accordion/dialog/select. Enforce: one H1/page, skip link, keyboard operability, visible focus (`--ring`), labelled inputs + live errors, `aria-live` on price/total, reduced-motion, ≥24px targets, real `alt`, contrast ≥4.5:1 (note: lime `#c6f135` and electric-blue text on light need contrast checks — use dark text on lime, white on blue). axe = 0 serious/critical; Lighthouse A11y 100.

---

## 14. Honesty Constraints (non-negotiable)

- **Never copy esim70's real trust data** — its testimonials (Marcus K., Priya…), "4.3★ / 109 Google Play reviews", "250K+ travelers connected". Build the identical carousel + stats components; fill with **clearly-placeholder sample data** in `reviews.json` / `site.json` until eSIMFlys has real numbers. No `aggregateRating`/`Review` JSON-LD until real.
- **No fabricated prices/savings** — per-day computed from real plan data; strikethrough only with a real list price.
- **Marketing copy** may match esim70's phrasing (industry-standard microcopy), but trust *facts* must be true for eSIMFlys.
- Country pages index only after real per-country content + approval (§11).

---

## 15. Gap Analysis — current build vs esim70 target (what changes & why)

| Area | Current (v2.2 build) | Target (esim70) | Action |
|---|---|---|---|
| Component lib | none (hand-rolled) | **shadcn/ui** | add shadcn; refactor primitives |
| Fonts | Hanken Grotesk + Inter | **Oswald + Poppins** | swap `next/font` + tokens |
| Colors | `#0053d5` blue + yellow | `#615de5` indigo + `#3535ff` + lime + red | replace `@theme` tokens |
| Motion | none (CSS only) | scroll-reveal + carousel + marquee | add framer-motion + embla |
| Country route | `/destinations/[country]` | **`/esim/[slug]`** (country+region) | move route + 308 redirect |
| Pricing unit | total price (USD) | **per-day** ("from $X/day") + badges | compute per-day; badge mapping |
| Home sections | ~4 (hero, popular, how, FAQ×3) | **~12** | add: What-is-eSIM, Where-travelers-go tabs, **quiz**, Why-pick(5), **reviews carousel**, CTA band, **stats band**, app CTA; FAQ 3→7 |
| Content storage | hardcoded arrays in pages | **JSON** (`content/*.json`) | externalize all copy |
| Destinations | plain directory | **All/Country/Regional tabs** + per-day + region intros | add tabs + pricing |
| Plan page | plans + sticky summary | + local-time, network partner, **per-country content**, country FAQ, recently-viewed, purchase-confidence | enrich |
| Devices | 8 sample + 4 categories | **model checker (Yes/No)** + **6 categories** | rebuild |
| Missing pages | — | `/what-is-esim`, `/blog`, `/account/esims` | add |
| Footer | 3 columns | **4 columns** + app + social | restructure |
| Trust | placeholder testimonials (omitted) | carousel + stats (placeholder, honest) | build components, honest data |

**Kept (correct, do not rebuild):** SEO infra (metadata/JSON-LD/robots/sitemap/index-gate), currency no-flash system, cart + checkout flow, catalog data layer + generator, honesty rules, a11y baseline.

---

## 16. Rebuild Phases

- **R0 — Theme swap:** add shadcn/ui + framer-motion + embla; `next/font` Oswald+Poppins; replace `@theme` tokens; `components.json`; base shadcn components. *Exit: app builds, tokens/fonts are esim70's.*
- **R1 — Content model:** create `content/*.json`; move all hardcoded copy in; content loaders.
- **R2 — Chrome:** section-adaptive Header, full-screen MobileMenu, 4-col Footer, TrustTicker, consent modal (shadcn Dialog).
- **R3 — Homepage:** all 12 sections (hero, what-is-eSIM, where-travelers-go tabs, quiz, how-it-works, why-pick, reviews carousel, CTA, stats, FAQ, app CTA).
- **R4 — Catalog:** `/destinations` (tabs+search+per-day) and `/esim/[slug]` (plan grid + sticky panel + per-country content + country FAQ + local-time + recently-viewed) + 308 redirects.
- **R5 — Devices + content pages:** device checker (6 cats), `/what-is-esim`, `/glossary`, `/blog`, `/about`, `/contact`, `/help`, `/account/esims`, legal.
- **R6 — Auth + checkout re-skin.**
- **R7 — Hardening:** a11y, SEO auditor, Lighthouse, per-country content gate, honest trust placeholders, `prefers-reduced-motion`.

Each phase: build → run → screenshot vs esim70 → record in MEMORY/TASKS.

---

## 17. Validation & Definition of Done

- **Visual parity:** side-by-side screenshot vs esim70 per page/section (desktop + mobile) — layout, type, color, spacing, motion match.
- **Structure:** exact section order + all sections present; `/esim/[slug]` routing; 4-col footer; full-screen mobile menu.
- **Content:** all copy from JSON; FAQ 7 items; per-country content per slug.
- **Honesty:** no esim70 real reviews/ratings/counts; placeholders labelled; no fabricated savings.
- **SEO:** auditor 0 blockers; index gate holds; unique metadata; valid JSON-LD (no fake reviews).
- **A11y:** axe 0 serious/critical; Lighthouse A11y 100; reduced-motion respected.
- **Perf:** Lighthouse ≥95; CWV lab green; shadcn/framer/embla within JS budget.
- **Code quality:** simple, JSON-driven, shadcn-composed, no over-engineering; every file has a clear purpose.
- **Funnel:** discover → `/esim/[slug]` → checkout → payment → confirmation works E2E.
