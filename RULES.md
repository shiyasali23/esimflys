# RULES.md — Strict Engineering Rules (esim70-exact rebuild)

> Non-negotiable rules. Enforced in review + CI. "MUST" = blocking; "SHOULD" = strong default (deviations recorded in MEMORY.md). Derived from [`esim_frontend_design.md`](./esim_frontend_design.md). Last updated: 2026-07-18.

## 1. Language & type-safety
- **MUST** write JavaScript/JSX (no TypeScript). JSX files → `.jsx`; utils/config/server/schemas → `.js`; specials → `route.js`/`sitemap.js`/`robots.js`/`proxy.js`.
- **MUST** keep `jsconfig.json` `checkJs:true` + aliases; zero editor type errors.
- **MUST** validate every boundary input with **zod** (catalogue, `:8000` responses, forms, promo, auth, FX, **`content/*.json`**). Parse at the boundary.
- **MUST** JSDoc `@typedef` domain models from the zod schemas.

## 2. Design & components
- **MUST** build the UI to **exactly match esim70.com** (UI_GUIDELINES.md) — tokens, Oswald/Poppins, section structure, motion.
- **MUST** compose from **shadcn/ui**; **MUST NOT** hand-roll a primitive shadcn provides (button, card, tabs, accordion, dialog, sheet, select, input, badge, carousel, skeleton). Add only components used.
- **MUST** use `@theme` tokens + semantic aliases; **MUST NOT** paste raw mockup Tailwind numbers or hex literals in components.
- **MUST** gate all motion on `prefers-reduced-motion`.

## 3. Content (JSON-driven)
- **MUST** store all static/marketing copy in `content/*.json` (hero, sections, quiz, FAQ, reviews, stats, nav, footer, devices, glossary, per-country editorial). **MUST NOT** hardcode marketing strings in components or pages.
- **MUST** validate content JSON with zod at import.
- **MUST** keep per-country editorial in `content/countries/{slug}.json`; a country page is indexable only when its content exists + `contentApproved:true`.

## 4. Rendering
- **MUST** default to RSC; `'use client'` only for state/effects/events; islands small + low; file `*.client.jsx`.
- **MUST NOT** render indexable/primary content only on the client.
- **MUST** keep the server-only boundary physical: data access, secrets, `wholesale_price_usd`, `competitor_ref_*`, the `:8000` client live in `src/server/**` with `import 'server-only'`. Client code MUST NOT import them.
- **MUST** project to a client-safe shape (`toClientPlan()`) before any client component receives a plan.

## 5. Routing
- **MUST** use `/esim/[slug]` for country + region pages; **MUST** 308-redirect legacy `/destinations/[country]` → `/esim/[country]`.
- **MUST NOT** use magic route strings — use `config/routes.js`.

## 6. Pricing & data honesty
- **MUST** derive **per-day** price as `retail_price_usd / validity_days`; country "from" = min per-day. Compute server-side.
- **MUST NOT** show a strikethrough/"was" price without a real list price; **MUST NOT** invent "Trending"/savings.
- **MUST** keep USD canonical in all markup/JSON-LD; local currency is display-only.

## 7. Trust honesty (hard stop)
- **MUST NOT** copy esim70's real testimonials, its 4.3★/109-review rating, or its "250K+ travelers" onto eSIMFlys.
- **MUST** fill review/stats components with **clearly-placeholder** data (in `reviews.json`/`site.json`) until eSIMFlys has real numbers; **MUST NOT** emit Review/AggregateRating JSON-LD until real.
- **MUST NOT** fabricate carriers, coverage, counts, ratings, or SEO/ranking claims. Technical SEO = eligibility, not ranking.

## 8. Naming & organization
- Files/dirs `kebab-case`; components `PascalCase` (export) in `kebab-case.jsx`; funcs/vars `camelCase`; constants `UPPER_SNAKE`; schemas `xxxSchema`; typedef `Xxx`; booleans as predicates; handlers `handleX`/`onX`.
- `app/` = routing only; `components/` presentational; `features/*` domain; `server/*` server-only; `lib/*` pure; `config/*` single-source; `content/*` JSON/MDX; `data/*` generated.
- One source of truth per concept. No deep relative imports — use aliases. Barrels only for `components/ui` + feature public surface.

## 9. Simplicity (no over-engineering)
- **MUST** keep code minimal and beginner-readable: least code that fully does the job, clear names, no premature abstraction, no speculative config, no unused deps/components.
- **MUST NOT** add layers, wrappers, or generalization "for later". Rule of three before extracting.
- **MUST NOT** write code comments, docstrings, or explanatory prose inside source files — names + structure carry meaning. (Docs live in the `.md` files.)

## 10. Accessibility (WCAG 2.2 AA)
- One H1/page; ordered headings; skip link; keyboard-operable; visible focus (`--ring`); labelled inputs + `aria-live` errors; `aria-live` price/total; ≥24px targets; real `alt`; contrast ≥4.5:1 (dark text on lime, white on blue/indigo). axe 0 serious/critical; Lighthouse A11y 100.

## 11. Performance
- SSG/ISR; `next/font`; `next/image`; no CDN Tailwind/fonts. Keep marketing initial JS lean despite shadcn/framer/embla (import per-component, no barrel bloat). CWV lab green; Lighthouse Perf ≥95.

## 12. No non-functional UI
- **MUST NOT** ship dead controls: every tile/card/button/link routes to real content or performs a real action. No dead `<div>` tiles, `href="#"`/`href=""` placeholders, `onClick` no-ops, or links to nonexistent routes.
- A control with no real destination yet is **not rendered** (or clearly a disabled/coming-soon state) — never a clickable-looking element that does nothing. (E.g. the current `/help` hub renders 6 non-clickable category `<div>`s — that is a defect.)

## 13. Verification before "done" (CLAUDE.md §8)
- `lint` + checkJs clean · builds · route renders with primary content in server HTML · SEO auditor 0 blockers on touched routes · index gate correct · axe clean · **every interactive element links to real content (no dead tiles/links)** · **visual parity check vs esim70** (screenshot) · no regressions. Never mark done what isn't verified; report failures with real output.
