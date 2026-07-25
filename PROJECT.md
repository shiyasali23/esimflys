# PROJECT.md — eSIMFlys Frontend

> Product framing. Full detail: [`esim_frontend_design.md`](./esim_frontend_design.md). Design reference: [`how_reference_platfrom_build.md`](./how_reference_platfrom_build.md). Last updated: 2026-07-18.

## 1. Vision
A **fast, trustworthy, SEO-first travel-eSIM storefront** — an **exact clone of esim70.com's design and structure**, rebranded as eSIMFlys, rendering our own real catalogue. A traveler finds a plan for their destination, understands it, and buys it in minutes — activation QR by email, data on arrival, no physical SIM, keeps their own number. Every controllable technical/UX/SEO factor is maximized; no fabricated data or ranking promises.

## 2. Goals
- **Business:** sell prepaid data-only eSIM plans; acquire via organic search; frame value as **per-day pricing** ("from $X/day"); lift AOV via longer/higher-GB plans; retain via account.
- **User:** find my destination fast; trust it works; check device compatibility; buy with minimal friction (guest allowed); get my QR quickly; get help.
- **Technical:** maintainable, accessible, static-first storefront scoring 100 SEO/Best-Practices/Accessibility, ≥95 Performance, green CWV; scales to the catalogue without thin-content risk; ships zero fabricated trust signals; visually indistinguishable from esim70.

## 3. What we're building (exact-clone scope)
- **Homepage** with esim70's full section set: hero, red trust ticker, what-is-an-eSIM, where-travelers-go (Country/Regional tabs + per-day cards), 3-step plan quiz, how-it-works (01/02/03), why-travelers-pick (5), running testimonial carousel, CTA band, stats band, FAQ (7), app CTA, 4-column footer.
- **Destinations** (`/destinations`): All/Country/Regional tabs + search + crawlable directory.
- **Plan detail** (`/esim/[slug]`, country + region): plan grid + sticky purchase panel + live local-time + per-country editorial + country FAQ + recently-viewed.
- **Supported devices**: model checker (instant Yes/No) + 6 categories.
- **Checkout funnel**: cart → checkout → Stripe payment → confirmation (QR + install).
- **Auth** (bento sign-in + guest), **account** (my eSIMs), **content** (what-is-esim, glossary, blog), **company** (about, contact, help), **legal**.
- Cross-cutting: multi-currency (USD canonical), JSON-driven content, SEO/perf/a11y infrastructure, mock→real backend layer.

## 4. Data (real)
- **68 countries, 385 plans** from `data/catalog.json` (spreadsheet → `scripts/generate_catalog.py`). Fixed 1–50 GB + daily "Unlimited X GB/day". Real networks, USD prices, validity. Per-day derived (`retail/validity`).
- Blockers: all plans `status="paused"` (dev flag renders; activate before launch); `hotspot="Unknown"` (don't claim). Server-only wholesale/competitor prices never reach the client.

## 5. Out of scope
Backend services (FastAPI/Django `:8000`), Stripe internals, eSIM provisioning, auth logic, CMS — integrated at their API boundary only.

## 6. Non-functional
- **SEO:** unique metadata/canonicals, supported structured data (no fabricated markup), crawlable directory, real 404, index gate for `/esim/[slug]` pages.
- **Performance:** SSG/ISR, lean initial JS (shadcn/framer/embla imported per-component), CWV green, self-hosted fonts.
- **Accessibility:** WCAG 2.2 AA, Lighthouse A11y 100 (shadcn/Radix baseline + our enforcement).
- **Honesty:** exact clone of *design*, never of esim70's *trust facts* — placeholders until eSIMFlys has real reviews/ratings/counts.

## 7. Definition of success
Discover → `/esim/[slug]` → checkout → payment → confirmation works E2E against the mocked backend (swaps to `:8000` cleanly); each page is visually indistinguishable from esim70's equivalent (desktop + mobile); all copy is JSON-driven; SEO/a11y/perf gates pass; no fabricated trust signals; code is simple and maintainable.

## 8. Current status
Foundation built in the prior ("Kinetic Horizon") design — funnel + SEO + currency + data layer verified and **kept**. The visual/structural layer is being **rebuilt to esim70-exact** (see [`TASKS.md`](./TASKS.md) Phase R, [`MEMORY.md`](./MEMORY.md)).
