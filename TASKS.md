# TASKS.md — Executable Task Tree (esim70-exact rebuild)

> Atomic, dependency-aware. Status: `[ ]` todo · `[~]` in-progress · `[x]` done · `[!]` blocked. Check off only after CLAUDE.md §8 verification (incl. **visual parity vs esim70**). IDs `R<phase>.<n>`; deps in parentheses. Last updated: 2026-07-18.

---

## Kept from the prior build (verified — do NOT rebuild)
- [x] Real data layer: `data/catalog.json` (68 countries, 385 plans) + `scripts/generate_catalog.py` + `server/catalog/repository.js` + `toClientPlan()`.
- [x] SEO infra: `lib/seo/{metadata,jsonld}.js`, `app/robots.js`, `app/sitemap.js`, `config/indexing.js` (index gate), `components/seo/json-ld.jsx`.
- [x] Currency no-flash system: `components/currency/{price,no-flash-script,currency-selector}`, `config/{currencies,rates,flags}.js`, `proxy.js` edge-geo default.
- [x] Cart + checkout funnel (`features/cart`, `features/checkout/*`) — logic kept, re-skinned in R6.
- [x] Config single-sources: `config/{site,nav,footer,routes}.js` — kept, values updated in R1/R2.

## To retire/replace (prior "Kinetic Horizon" design)
- [ ] X.1 Remove Hanken/Inter fonts + Kinetic tokens from `globals.css` (R0.3).
- [ ] X.2 Replace hand-rolled `components/ui/{button,badge,section,container}` with shadcn (R0.2).
- [ ] X.3 Replace `mobile-nav-drawer.client.jsx` with full-screen `mobile-menu` (R2.2).
- [ ] X.4 Move `destinations/[country]` → `esim/[slug]` + 308 redirect (R4.3).
- [ ] X.5 Delete hardcoded copy arrays in `(marketing)/page.js` + support pages → JSON (R1).

---

## Phase R0 — Theme swap  (exit: app builds; fonts/tokens/deps = esim70)  ✅ core done
- [x] R0.1 Deps installed: `class-variance-authority`, `framer-motion`, `embla-carousel-react`, `@radix-ui/{react-slot,react-tabs,react-accordion,react-dialog}`.
- [~] R0.2 Base components in `components/ui`: button, card, badge, input, tabs, accordion done (+ dialog via radix in mobile-menu). Pending: select, sheet, carousel, skeleton, separator, sonner (add when consumed). (R0.1)
- [x] R0.3 `globals.css`: esim70 `@theme` tokens + brand aliases (indigo `#615de5`, cta `#3535ff`, highlight `#c6f135`, ticker `#e40014`, `--radius-card:22px`) + marquee keyframe; legacy token names kept temporarily so existing pages build during migration. (R0.1)
- [x] R0.4 `layout.js`: `next/font` Oswald (`--font-oswald`) + Poppins (`--font-poppins`); `suppressHydrationWarning` kept. (R0.3)
- [x] R0.5 Button variants (`primary`/`cta`/`secondary`/`accent`/`outline`/`ghost`/`destructive`, pill, cva). (R0.2)
- [x] R0.6 `components/motion/reveal.client.jsx` (framer `whileInView` + reduced-motion guard). (R0.1)
- [x] R0.7 Verified: `next build` green — 89 pages incl. all 68 country pages; new chrome + tokens render.
- [ ] R0.8 (cleanup, R7) Remove legacy token aliases once all pages migrated.

## Phase R1 — JSON content model  (exit: zero hardcoded marketing copy)
- [ ] R1.1 `content/schema.js` (zod for each content file).
- [ ] R1.2 `content/site.json` (brand, socials, app URLs, ticker items, stats — placeholders labelled).
- [ ] R1.3 `content/nav.json` (header nav + 4 footer columns).
- [ ] R1.4 `content/home.json` (hero, what-is-esim, section eyebrows/headings, why-pick 5, how-it-works 3, CTA band).
- [ ] R1.5 `content/quiz.json` (3 steps, options).
- [ ] R1.6 `content/faq.json` (7 Q&A verbatim from reference).
- [ ] R1.7 `content/reviews.json` (**placeholder** testimonials, clearly sample).
- [ ] R1.8 `content/devices.json` (6 categories + manual-check steps), `content/what-is-esim.json`, `content/glossary.json`, `content/help.json` (8 categories → real Q&A/guides per category).
- [ ] R1.9 Content loader (validated import) + replace all literals in existing pages/components. (R1.1–R1.8)

## Phase R2 — Chrome  (exit: header/footer/menu/ticker match esim70)  ✅ built (parity pending)
- [x] R2.1 `header.jsx` (client): floating pill, scroll-solidify state; nav from `content/nav.json`; currency selector + Sign-in. Rewritten in place → all 5 layouts inherit it. (Section-adaptive color refined with the hero in R3.)
- [x] R2.2 `mobile-menu.client.jsx`: full-screen overlay (Radix Dialog), uppercase Oswald links, bottom red Sign-in, ✕.
- [x] R2.3 `footer.jsx`: 4 columns from `content/nav.json` + app-badge placeholders + © year (social omitted until real — no dead links).
- [x] R2.4 `trust-ticker.jsx`: red CSS marquee, ⚡ separators, pause-on-hover, reduced-motion. (Mounted on homepage in R3.)
- [ ] R2.5 Consent modal (Radix Dialog, Accept/Deny) gating analytics.
- [ ] R2.6 Verify parity: header/footer/menu/ticker desktop + mobile vs esim70 (screenshot).

## Phase R3 — Homepage  (exit: all 12 sections, exact order + look)  ✅ built + screenshot-verified
- [x] R3.1 hero.jsx (Oswald H1 + lime word + CTA + real country chips → /esim/slug).
- [x] R3.2 what-is-esim.jsx.
- [x] R3.3 where-travelers-go.client.jsx (Country/Regional tabs + destination cards w/ real per-day + selective Best-value/Popular badges).
- [x] R3.4 trip-quiz.client.jsx (3-step stepper, Back/Next). (filter→plans is R4 follow-up)
- [x] R3.5 how-it-works.jsx (01/02/03 + feature chips).
- [x] R3.6 why-pick.jsx (5 benefit cards).
- [x] R3.7 testimonials.client.jsx (embla auto-scroll, **SAMPLE** data, labelled).
- [x] R3.8 cta-band.jsx + stats-band.jsx (honest stats: 60+ / 385 / 4G-5G / 2min).
- [x] R3.9 faq.jsx (Radix accordion, 7 items, exact copy).
- [x] R3.10 app-cta.jsx (store-badge placeholders).
- [x] R3.11 `(marketing)/page.js` composes all 12 in order.
- [x] R3.12 Verified desktop via browser screenshot. (mobile + Reveal wrappers + section-adaptive header = follow-up)

## Phase R4 — Catalog  (exit: destinations + `/esim/[slug]` match, redirects live)
- [x] R4.1 Per-day pricing in `repository.js` (`getPerDayFrom` = min retail/validity, `getHomeDestinations`). (per-day.js lib = optional refactor)
- [~] R4.2 destination-card: homepage DestCard done (flag, name, badge, from $X/day); shared `/destinations` card = follow-up.
- [x] R4.3 Route moved → `app/(marketing)/esim/[slug]/page.js` (`generateStaticParams` + `notFound`); `routes.country`→`/esim/`; 308 redirect `/destinations/:slug`→`/esim/:slug` + `/plans/:slug`; old folder deleted. Verified `/esim/japan`.
- [x] R4.4 `/destinations`: `destinations-browser.client` (All/Country/Regional tabs + search + full alphabetical 68-country list w/ region tag + per-day; SSR-crawlable). Verified vs esim70.
- [ ] R4.5 `plan-selector.client.jsx` + `purchase-panel.client.jsx` re-skin (radio grid, BEST VALUE, Unlimited duration Select, sticky panel, network partner, purchase-confidence, Continue→cart). (R0.2)
- [ ] R4.6 `local-time.client.jsx` + `recently-viewed.client.jsx`.
- [ ] R4.7 Per-country content sections on `/esim/[slug]` from `content/countries/{slug}.json` + country FAQ + related. (R1.1)
- [ ] R4.8 Region config + region pages share `/esim/[slug]`.
- [ ] R4.9 Verify parity + index gate (unapproved countries noindex/out of sitemap).

## Phase R5 — Devices + content pages  ✅ core done
- [x] R5.1 `device-checker.client.jsx` (model search → Yes/Unknown, honest — no false No) + `*#06#`/EID note.
- [x] R5.2 `category-tabs.client.jsx` (6 categories from `content/devices.json`; honest example models, no fabricated counts).
- [x] R5.3 `/what-is-esim` (new page, `content/what-is-esim.json`). Glossary/about/contact render on new tokens (deeper re-skin = follow-up); `/blog` still needs real articles (deferred D.5).
- [x] R5.4 `/help` hub: **all 8 tiles clickable** → `/help/[category]` (real Q&A from `content/help.json`). No dead tiles. Verified 200 on all category routes.
- [x] R5.5 Verified: routes 200, sitemap includes `/what-is-esim` + help categories, country pages gated out. (parity screenshots: devices ✓)

## Phase R6 — Auth + checkout re-skin
- [x] R6.1 `/auth` single bento page (`auth-bento.client`: Google + email/password w/ show-hide + guest email; honest demo stubs). Header + mobile menu Sign-in → `/auth`.
- [x] R6.x Header section-adaptive (transparent + white nav/logo/hamburger over homepage hero, solid pill elsewhere/scrolled) — R2.1 completed here.
- [ ] R6.2 `/account/esims` (stub until backend).
- [ ] R6.3 Checkout/payment/confirmation re-skin (keep logic). 
- [ ] R6.4 Verify funnel E2E + parity.

## Phase R7 — Hardening & launch
- [ ] R7.1 a11y sweep (axe 0 serious/critical; Lighthouse A11y 100; reduced-motion verified).
- [ ] R7.2 SEO auditor + Lighthouse on `/`, `/destinations`, an `/esim/[slug]`, `/supported-devices`; fix blockers.
- [ ] R7.3 Perf: initial JS budget with shadcn/framer/embla; per-component imports; CWV lab green.
- [ ] R7.4 Honesty audit: no esim70 real trust data; placeholders labelled; no fabricated savings; USD canonical.
- [ ] R7.5 Zod schema + `server/api/client.js` for the `:8000` swap (`USE_MOCKS`).
- [ ] R7.6 CI gates (lint, checkJs, build, size-limit, lighthouserc).
- [ ] R7.7 Dead-UI sweep: crawl every rendered route; assert **no dead tiles/links** (`href="#"`, empty href, non-clickable card, 404 target). Covers help hub, footer, nav, all cards. (RULES §12)

---

## Deferred (blocked on business input)
- [!] D.1 Real testimonials/ratings/customer-counts (need eSIMFlys's own) — components ready, placeholder until then.
- [!] D.2 Activate plans (`status="paused"` → live) + confirm hotspot support (`"Unknown"`).
- [!] D.3 Real Stripe keys + backend auth/orders/eSIMs at `:8000`.
- [!] D.4 Legal copy approval (terms/privacy/refund).
- [!] D.5 Blog articles (real content before index).

## Discovered (append as found)
- (none yet)
