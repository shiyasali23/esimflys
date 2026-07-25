# ARCHITECTURE.md — eSIMFlys Frontend Architecture (esim70-exact)

> How the frontend is structured. Operationalizes [`esim_frontend_design.md`](./esim_frontend_design.md) §2/§6/§9. Keep synchronized with the code. Target = exact esim70.com structure + shadcn/ui. Last updated: 2026-07-18.

## 1. Stack & principles
Next.js 16 (App Router) · React 19 · **JS/JSX** · Tailwind v4 · **shadcn/ui** (Radix+CVA) · **framer-motion** · **embla-carousel** · zod · `next/font` (Oswald+Poppins) · `next/image`.
Principles: RSC-default; server-first; physical server-only boundary; feature-first modules; single-source config; **JSON-driven content**; static-first rendering; build-time catalogue; zod-typed boundaries; compose-don't-hand-roll (shadcn). Keep it simple — only what esim70 has and we need.

## 2. Folder structure (`frontend/src/`)
```
app/                              # ROUTING LAYER only (layouts, pages, metadata)
  layout.js  globals.css  sitemap.js  robots.js  not-found.js  (error.js)
  (marketing)/
    layout.js  page.js            # homepage = compose section components (JSON content)
    destinations/page.js          # All/Country/Regional tabs + search
    esim/[slug]/page.js           # country + region plan detail (unified)  ← was destinations/[country]
    supported-devices/page.js     # model checker + 6 categories
    what-is-esim/page.js  glossary/page.js  about/page.js  contact/page.js
    blog/page.js  blog/[slug]/page.js
  (support)/ help/page.js  help/[category]/page.js    # hub + per-category; every tile links to real content
  (shop)/ checkout/{page,payment/page,confirmation/page}.js
  (auth)/ auth/page.js            # bento sign-in + guest (single page)
  (account)/ account/esims/page.js  (protected)
  (legal)/ legal/[doc]/page.js
  api/ …/route.js                 # BFF proxy → :8000 (later)
components/
  ui/                             # shadcn components (button, card, tabs, accordion, dialog, sheet, select, input, badge, carousel, skeleton, separator, sonner) + cn
  layout/ header.client.jsx  mobile-menu.client.jsx  footer.jsx  trust-ticker.jsx  skip-link.jsx
  currency/ price.jsx  currency-selector.client.jsx  no-flash-script.jsx  language-selector.client.jsx
  motion/ reveal.client.jsx       # framer scroll-reveal wrapper (reduced-motion aware)
  media/ country-flag.jsx
  seo/ json-ld.jsx
  feedback/ empty-state.jsx
features/
  catalog/ components/ destination-card.jsx  country-directory.client.jsx  plan-selector.client.jsx  purchase-panel.client.jsx  local-time.client.jsx  recently-viewed.client.jsx
           lib/ to-client-plan.js  per-day.js
  home/ components/ hero.jsx  what-is-esim.jsx  where-travelers-go.client.jsx  trip-quiz.client.jsx  how-it-works.jsx  why-pick.jsx  testimonials.client.jsx  cta-band.jsx  stats-band.jsx  faq.jsx  app-cta.jsx
  devices/ components/ device-checker.client.jsx  category-tabs.client.jsx
  quiz/ lib/ filter.js
  checkout/ components/ checkout-view.client.jsx  payment-view.client.jsx  confirmation-view.client.jsx
  auth/ components/ auth-card.client.jsx
  cart/ use-cart.client.js
server/                           # import 'server-only'
  catalog/ repository.js          # reads catalog.json (→ :8000 later); computes per-day, from-price
  api/ client.js                  # single :8000 caller + zod (later)
config/ site.js nav.js footer.js routes.js currencies.js flags.js rates.js indexing.js
content/                          # JSON-DRIVEN COPY (no marketing text in components)
  site.json nav.json home.json quiz.json faq.json reviews.json glossary.json devices.json what-is-esim.json help.json
  countries/{slug}.json           # per-country editorial (drives index gate)
  legal/*.mdx
lib/ cn.js  format/money.js  seo/{metadata,jsonld}.js
data/ catalog.json                # generated (spreadsheet → generator)
proxy.js                          # edge-geo currency default + redirects
```

## 3. Routing decisions
- **Country + region unified at `/esim/[slug]`** (`generateStaticParams` from catalog + region config; `notFound()` on miss). Region slugs (`europe`, `asia`, …) and country slugs share the route; the page branches on slug type.
- **308 redirects** in `next.config`/proxy: `/destinations/[country]` → `/esim/[country]`; `/plans*` → `/esim/*`.
- Homepage anchors: `/how-it-works`,`/faq`,`/testimonials` → `/#...` sections.
- Index policy per route in §6 of the spec; enforced by `config/indexing.js` + sitemap.

## 4. Rendering
- Marketing/catalog/content = **SSG/ISR**; primary content in server HTML (no client fetch for indexable content).
- Client islands (`.client.jsx`) only for: header scroll/adapt, mobile menu, tabs, accordion, carousel, quiz, plan-selector + purchase-panel, local-time, recently-viewed, currency/language, forms, reveal wrapper. Kept small, low in the tree.
- shadcn/Radix components are client where interactive; wrap in server pages.

## 5. Content model (JSON)
- `content/*.json` imported by server components; typed by zod (`content/schema.js`) so shape is guaranteed at build.
- Per-country editorial in `content/countries/{slug}.json`; `indexing.js` reads `contentApproved` to gate index/sitemap.
- No marketing string literals in `app/**` or section components — all from JSON.

## 6. Data & pricing
- `server/catalog/repository.js`: loads `catalog.json`, validates (zod), strips server-only fields via `toClientPlan()`, computes **per-day** (`retail/validity`) and country **from-price** (`min perDay`). `features/catalog/lib/per-day.js` holds the pure math.
- Server-only fields (`wholesale_price_usd`, `competitor_ref_*`) never cross to client. Savings only from a real list price (else omitted).

## 7. State & currency
- URL params (tabs, quiz, selection) · Zustand (`use-cart`) · cookie (`cur` currency, set by `proxy.js` edge-geo). Recently-viewed in `localStorage`.
- **Currency no-flash:** all variants server-rendered; `no-flash-script` sets `<html data-currency>` pre-paint; language/region selector updates cookie + attribute. `<html suppressHydrationWarning>`.

## 8. Server-only boundary
`src/server/**` starts with `import 'server-only'`; holds data access, secrets, wholesale/competitor prices, the `:8000` client. Client code cannot import it. Enforced by review + lint.

## 9. Motion architecture
`components/motion/reveal.client.jsx` wraps framer `whileInView`; a `useReducedMotion` guard disables transforms. Ticker = pure CSS marquee. Carousels = embla with an autoplay effect that pauses on hover/focus and halts under reduced-motion.

## 10. SEO infrastructure (kept)
`lib/seo/metadata.js` (per-route metadata), `lib/seo/jsonld.js` (Organization/WebSite/Product-AggregateOffer/Breadcrumb/DefinedTermSet — no fabricated reviews), `app/robots.js`, `app/sitemap.js` (gate-passing URLs only), `config/indexing.js` (index gate). USD canonical in markup.

## 11. Periodic coherence review
After each rebuild phase (spec §16): no dup components/tokens/config; all copy in JSON; shadcn used (no re-hand-rolled primitives); routing = `/esim/[slug]`; per-day pricing consistent; server-only boundary intact; docs synced.
