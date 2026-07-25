# SKILLS.md — Reusable Engineering Procedures (esim70-exact)

> Step-by-step workflows. Each is a checklist — follow it fully. Cross-refs → [`esim_frontend_design.md`](./esim_frontend_design.md), [`how_reference_platfrom_build.md`](./how_reference_platfrom_build.md). Last updated: 2026-07-18.

## S0. Add a shadcn component
1. Confirm esim70 actually uses it and we need it (no speculative adds).
2. Add via shadcn CLI into `components/ui`; keep the generated file, adapt tokens to our `@theme` (indigo/electric-blue/pill/22px).
3. Add our `variant`s only if the design needs them (e.g. Button `cta`). No unused variants.
4. Verify: renders, keyboard/roles (Radix), tokens applied, reduced-motion where animated.

## S1. Build a section/component (match esim70)
1. Open the reference teardown for that section; note exact layout, type, color, spacing, motion. If unsure, re-verify against the live site.
2. Place it: `components/*` (shared), `features/<feature>/components` (domain). Search first — no duplication.
3. RSC by default; `.client.jsx` only if interactive (kept small).
4. **Pull all copy from `content/*.json`** — never hardcode. Add the JSON keys + zod shape.
5. Compose from shadcn + tokens; a11y-first (roles, labels, focus); implement all states.
6. Wrap in `motion/reveal` if it scroll-reveals; gate on reduced-motion.
7. Verify: lint, checkJs, renders in app, **screenshot vs esim70** (desktop + mobile), axe clean.
8. Record: check the task; note new shared component in ARCHITECTURE.md.

## S2. Build a page/route
1. Read the spec page section (§8) + route row (§6) for render mode + index policy.
2. Create under the right group; keep the page thin (metadata + compose sections). Country/region → `/esim/[slug]` with `generateStaticParams` + `notFound()`.
3. SSG/ISR; primary content in server HTML (no client fetch for indexable content).
4. `generateMetadata`: unique title/description, self-canonical, OG/Twitter.
5. JSON-LD via `lib/seo/jsonld` (supported types only; no fabricated reviews).
6. Implement loading/empty/error states. For `/esim/[slug]`: enforce the index gate (content + `contentApproved`).
7. Verify: build, render, SEO auditor 0 blockers, Lighthouse thresholds, axe, responsive 375/768/1024/1440, **visual parity vs esim70**.

## S3. Move content into JSON
1. Find every hardcoded marketing string in the target component/page.
2. Add keys to the right `content/*.json`; define/extend the zod shape in `content/schema.js`.
3. Import validated content in the server component; replace literals with references.
4. Verify: build passes zod validation; UI unchanged; grep shows no leftover literals.

## S4. Per-day pricing
1. In `features/catalog/lib/per-day.js`: `perDay(plan)=retail_price_usd/validity_days`; `fromPrice(plans)=min(perDay)`.
2. Repository computes + attaches `pricePerDay` to client plans and `fromPerDay` to countries.
3. Cards render "from $X/day"; plan cards keep total + validity. Savings only if a real list price exists (else omit). USD canonical; convert for display via the currency system.
4. Verify: numbers match `retail/validity`; no fabricated savings; multi-currency correct.

## S5. API integration (BFF → :8000)
1. zod schema for request + response in the feature's `schema.js`.
2. Extend `src/server/api/client.js` (the only `:8000` caller); validate response; strip server-only fields.
3. Expose via Server Action (our mutations) or `app/api/**/route.js` (webhooks/external).
4. Until backend exists: mock behind the same zod contract, toggled by `USE_MOCKS`. Swap = one line.
5. Errors: `{ok,data?,error?}`; retry idempotent GETs; graceful UI state.

## S6. Add/approve a country page for indexing
1. Author `content/countries/{slug}.json` (when-to-activate, network partners, connection details, country context, why-eSIM-here, country FAQ) — real, non-templated.
2. Set `contentApproved:true` in `config/indexing.js` (or the content flag) only after human review.
3. Verify: page now `index,follow`, appears in sitemap; unapproved pages stay `noindex` + out of sitemap.

## S7. Verify visual parity
1. Run the app; open the page at desktop (1440) + mobile (375).
2. Open esim70's equivalent; compare layout, type (Oswald/Poppins), color (indigo/electric-blue/lime/red), radius (22px/pill), spacing, section order, motion.
3. Fix drift; re-screenshot. Record parity in MEMORY.md.

## S8. Session resume (after interruption/compaction)
1. Re-read CLAUDE.md §0 files. 2. Read latest MEMORY.md "Session handoff". 3. `next build`/run to see real state. 4. Reconcile TASKS.md with reality. 5. Resume at first genuinely-incomplete task. 6. Finish or revert any partial change first.
