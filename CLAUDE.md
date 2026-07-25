# CLAUDE.md — Autonomous Engineering Operating Manual

> The operating manual for the agent building the **eSIMFlys** frontend. Loaded as persistent context. It governs *how* I work. The *what* lives in [`esim_frontend_design.md`](./esim_frontend_design.md) (authoritative spec).
> **Target: an exact visual + structural clone of https://www.esim70.com/**, rebranded eSIMFlys, on our real catalogue. Last updated: 2026-07-18.

## 0. Source-of-truth hierarchy (read in this order on every resume)
1. **[`esim_frontend_design.md`](./esim_frontend_design.md)** — authoritative product + technical spec (v3.0, esim70-exact). Code must trace to it. If code and spec disagree, the spec wins; if the spec is wrong, fix the spec first.
2. **[`how_reference_platfrom_build.md`](./how_reference_platfrom_build.md)** — the verified esim70.com teardown. The **live site is the final visual authority**; re-verify against it when unsure.
3. **[`RULES.md`](./RULES.md)** — non-negotiable engineering rules.
4. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** + **[`UI_GUIDELINES.md`](./UI_GUIDELINES.md)** — operating detail.
5. **[`TASKS.md`](./TASKS.md)** — the live task tree.
6. **[`MEMORY.md`](./MEMORY.md)** — decisions/lessons log + session handoff.
7. **[`SKILLS.md`](./SKILLS.md)** — reusable procedures.
8. **[`data/catalog.json`](./data/catalog.json)** — the real catalogue (68 countries, 385 plans).

**On resume after any interruption:** re-read §0, then the last "Session handoff" in MEMORY.md, then continue from the first unchecked task in TASKS.md. Reconstruct context from these files — never assume it's intact.

## 1. Mission
Build a **production-grade, SEO-first, accessible, fast** eSIMFlys frontend that is **visually indistinguishable from esim70.com**, rendering our real catalogue, while never fabricating data, trust signals, or ranking guarantees.

## 2. Objectives
- Clone esim70's design system, components, section structure, routing, and interactions **exactly** (via shadcn/ui + Oswald/Poppins + our tokens).
- Hit the gates: **Lighthouse SEO 100, Best-Practices 100, Accessibility 100, Performance ≥95**; CWV lab green (LCP ≤2.5s, CLS ≤0.1, TBT ≤200ms); WCAG 2.2 AA.
- Keep the codebase **simple, JSON-driven, duplication-free, beginner-readable**.
- Run standalone today (mocked backend), swap to real `:8000` with no rewrite.

## 3. Agent behavior
- **Plan → act → verify → record.** No blind edits.
- **Verify against the running app + the live esim70 reference**, not intuition. Correctness is proven by the dev server + tests + SEO auditor + a visual-parity screenshot.
- **One change, one concern.** Small, reviewable increments.
- **Compose from shadcn; never re-hand-roll** what it provides.
- **All copy lives in `content/*.json`** — never hardcode marketing text.
- **Keep it simple.** Least code that fully works; no over-engineering; no speculative abstraction; **no code comments/docstrings** (names + structure carry meaning).
- **Ask only when genuinely blocked** on a business decision. Otherwise proceed on documented defaults and record them.
- **Never fabricate** prices, savings, reviews, ratings, counts, carriers, coverage, or SEO claims.
- **Never copy esim70's real trust data** (its testimonials, 4.3★/109 reviews, "250K+ travelers") onto eSIMFlys — build the identical components with clearly-placeholder data until eSIMFlys has real numbers.
- **Never guarantee rankings.** Technical SEO is eligibility, not ranking.

## 4. Engineering philosophy
Correctness > speed. Simplicity > cleverness. Determinism > shortcuts. Match esim70 exactly; minimize debt; eliminate duplication; keep docs synced with code. Prefer server-rendered HTML + the smallest client bundle.

## 5. Coding standards (full rules: RULES.md)
- **Stack:** Next.js 16 (App Router) · React 19 · **JS/JSX** · Tailwind v4 · **shadcn/ui** · **framer-motion** · **embla-carousel** · zod · JSDoc typedefs · `jsconfig checkJs`.
- **Fonts:** Oswald (display, uppercase) + Poppins (body) via `next/font`. **Tokens:** shadcn set (indigo `#615de5`) + accents (electric-blue `#3535ff`, lime `#c6f135`, red `#e40014`), radius `.625rem`, cards 22px, pill buttons.
- **Routing:** country + region at `/esim/[slug]`; 308-redirect legacy `/destinations/[country]`.
- **Pricing:** per-day (`retail/validity`); USD canonical, local display-only; no fabricated savings.
- **RSC by default;** `.client.jsx` islands small + low. Server-only boundary physical (`src/server/**` + `import 'server-only'`).
- **Accessibility** baked into shadcn/Radix primitives + our enforcement.

## 6. The execution loop (per task)
1. **Read** the spec section + the reference teardown for the area + prior MEMORY notes.
2. **Plan** the atomic change against TASKS.md + deps.
3. **Implement** the minimal change (shadcn, JSON content, tokens).
4. **Verify** (§8) — build/test/audit + **visual-parity screenshot vs esim70**.
5. **Record** — check off TASKS.md; append a decision/lesson to MEMORY.md if non-obvious.
6. **Sync** — update ARCHITECTURE/UI_GUIDELINES/the spec if the change alters them.

## 7. Rebuild phases (spec §16)
Build strictly phase-by-phase; don't start a phase until the previous one's exit is verified.
- **R0** theme swap (shadcn + Oswald/Poppins + tokens + framer/embla) · **R1** JSON content model · **R2** chrome (adaptive header, full-screen mobile menu, 4-col footer, trust ticker) · **R3** homepage (all 12 sections) · **R4** `/destinations` + `/esim/[slug]` + redirects · **R5** devices + content pages · **R6** auth + checkout re-skin · **R7** hardening (a11y/SEO/perf/parity).
A checkpoint (run + verify + record + parity) ends every phase; review whole-project coherence between phases.

## 8. Validation policy (never assume correctness)
Before marking any task done, verify what applies: correctness, consistency, architecture fit, naming, imports, deps, UI parity, accessibility, responsiveness, performance, build integrity, **no regressions**. Concretely:
- `npm run lint` + checkJs clean · tests green · `next build` succeeds.
- Route renders in the server; primary content is in **server HTML** (view-source).
- **Visual-parity screenshot vs esim70** for the touched page/section (desktop + mobile).
- SEO auditor 0 blockers on touched routes; Lighthouse within thresholds.
- `/esim/[slug]` index gate correctly `noindex`s unapproved/thin pages.

## 9. Context management
- Treat §0 files as external memory; keep them synced after every meaningful change.
- On compaction, **don't panic** — re-read §0 + latest MEMORY "Session handoff". The plan is in the files.
- When summarizing, preserve: decisions + rationale, blockers, current phase/task, deviations. Discard transient chatter.

## 10. Recovery (resume after interruption)
1. Read §0. 2. Read latest MEMORY "Session handoff". 3. `next build`/run for real state. 4. Reconcile TASKS.md with reality. 5. Resume at first genuinely-incomplete task. 6. Finish or revert any partial/broken change first.

## 11. Completion criteria
Complete when every route is visually indistinguishable from its esim70 equivalent (desktop + mobile), all copy is JSON-driven, CI gates pass, SEO auditor + Lighthouse are green on representative routes, WCAG 2.2 AA verified, the funnel works E2E on the mocked backend (and swaps to `:8000`), and TASKS.md shows all non-deferred tasks done. Deferred = only items blocked on business input (real trust data, backend, legal copy).

## 12. Standing honesty constraints
- No fabricated data/trust/claims; no Review/AggregateRating markup until real; no FAQ/HowTo rich-result markup.
- **Never present esim70's real reviews/ratings/customer-counts as eSIMFlys's** — placeholders, clearly labelled, until real.
- USD canonical in all markup; local currency display-only.
- Country pages index only after real, approved content.
- Report failures faithfully with actual output; never mark unverified work done.
