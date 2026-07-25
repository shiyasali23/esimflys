# UI_GUIDELINES.md — eSIMFlys Design System (esim70-exact)

> Operating detail for the visual layer. Derived from [`esim_frontend_design.md`](./esim_frontend_design.md) §3/§9/§10 and the live teardown [`how_reference_platfrom_build.md`](./how_reference_platfrom_build.md). Target = **exact esim70.com look**. When in doubt, re-verify against the live reference. Replaces the "Kinetic Horizon" system. Last updated: 2026-07-18.

## 1. Foundation
- **Component library: shadcn/ui** (Radix + CVA + `cn`). Compose UI from shadcn; do not hand-roll primitives shadcn provides. Add only the components we use.
- **Tailwind v4** with `@theme` tokens (below). Never paste raw mockup Tailwind numbers — use tokens.
- **Motion:** framer-motion (scroll-reveal), embla-carousel (running carousels), CSS keyframes (ticker). All gated by `prefers-reduced-motion`.

## 2. Tokens (`src/app/globals.css`)
shadcn light theme (esim70 values):
```
--radius:.625rem;
--background:#fff; --foreground:#0a0a0a;
--card:#fff; --card-foreground:#0a0a0a; --popover:#fff;
--primary:#615de5; --primary-foreground:#fff;
--secondary:#f5f5f5; --secondary-foreground:#171717;
--muted:#f5f5f5; --muted-foreground:#737373;
--accent:#f5f5f5; --accent-foreground:#171717;
--destructive:#e40014; --border:#e5e5e5; --input:#e5e5e5; --ring:#615de5;
--chart-1:#f05100; --chart-2:#009588; --chart-3:#104e64; --chart-4:#fcbb00; --chart-5:#f99c00;
```
Brand accents (semantic aliases, sparing use):
```
--brand-cta:#3535ff;       /* electric blue: primary CTA + active tab */
--brand-highlight:#c6f135; /* lime: ONE hero word only */
--brand-ticker:#e40014;    /* red trust strip + mobile Sign-in */
--radius-card:22px;        /* destination/plan cards */
```

## 3. Type
- **Oswald** → `--font-oswald` → utility `font-display`. All headings + section H2 + mobile-nav links. **UPPERCASE**, weight 500–900 (hero 900). Tight leading, slight negative tracking at large sizes.
- **Poppins** → `--font-poppins` → `font-body` (default `<body>`). Paragraphs, labels, buttons, UI. 16px base, 400/500/600.
- Scale: hero H1 `clamp(2.4rem,6vw,3.75rem)`; H2 ~2rem; eyebrow .75rem uppercase tracked; body 1rem; small .875rem.
- Eyebrows: small uppercase, letter-spaced, muted or accent ("NO KIOSK NEEDED", "STEP 1 OF 3").

## 4. Color usage
- Text `--foreground` on white; `--muted-foreground` secondary; white text on purple/indigo bands.
- **Indigo `#615de5`**: brand fills, gradients, links, focus.
- **Electric blue `#3535ff`**: the main action ("Continue to checkout", hero search submit) and **active** tab pill. White text.
- **Lime `#c6f135`**: exactly one hero highlight word — **dark text on lime**, never light.
- **Red `#e40014`**: trust ticker, mobile "Sign in", logo accent, `--destructive`.
- Surfaces: white cards with 1px `--border`; sections alternate white / `#fafafa` / indigo band.

## 5. Shape & elevation
- Cards **22px** (`--radius-card`); buttons **pill** (`rounded-full`) or 18px on checkout; inputs `--radius`.
- **Flat, border-led.** Prefer 1–2px borders over shadow. Shadows subtle, only on hover/sticky panels.
- Roomy padding; section rhythm py-16/24.

## 6. Components (shadcn base → our composition)
- **Button** (`variant`): `default`(indigo) · `cta`(electric-blue pill) · `outline` · `ghost` · `destructive`. Pill by default.
- **Card** (22px, border, subtle hover lift): DestinationCard, PlanCard, BenefitCard, review card.
- **Tabs** (Radix): destinations All/Country/Regional; device categories. Active = electric-blue pill.
- **Accordion** (Radix): FAQ (one open), mobile footer columns.
- **Dialog/Sheet**: mobile full-screen menu, consent modal.
- **Select/DropdownMenu**: language/region (→ currency), Unlimited-plan duration.
- **Carousel** (embla): testimonials (auto-scroll, pause on hover).
- **Badge**: Popular / Best value (from data). No fabricated "Trending".
- **Input**: hero search, quiz, forms; labelled.
- **Skeleton / Separator / Toast(Sonner)** as needed.

## 7. Signature elements
- **Header**: floating rounded pill, section-adaptive text color (white on hero/bands → dark on white), blur/opacity on scroll. Mobile: logo + language pill + hamburger.
- **Mobile menu**: full-screen white overlay, big uppercase Oswald links, bottom-pinned **red "Sign in"** pill, ✕.
- **Trust ticker**: full-width **red** strip, infinite CSS marquee, ⚡ separators.
- **Destination card**: flag, name (Oswald), **badge**, **"from $X/day"** (Poppins semibold), optional honest savings, hover → indigo accent.
- **Plan card**: radio-select, "BEST VALUE" banner, GB · validity · price; Unlimited → duration Select; selection updates sticky **Purchase panel** (plan, validity, network partner, price, electric-blue "Continue to checkout", purchase-confidence bullets).
- **Quiz**: stepper "STEP n OF 3", option cards (icon+label+desc), Back/Next, progress.
- **Stats band**: 4 stats, indigo band, big Oswald numbers. **Placeholder numbers labelled** (§ honesty).
- **Footer**: 4 columns + app badges + social + © year; mobile = accordions.

## 8. Motion spec
- Scroll-reveal: `opacity 0→1`, `translateY(16px)→0`, staggered ~60ms, once, on in-view (framer `whileInView`).
- Ticker: linear infinite marquee (~30s), pause on hover.
- Carousel: embla auto-scroll (~1 slide/2.5s), pause on hover/focus, drag.
- Tabs/accordion: 150–200ms ease.
- Header: color/opacity transition on scroll + section.
- Local-time widget: ticks each minute.
- **All disabled/reduced** under `prefers-reduced-motion` (no marquee, no auto-scroll, instant reveal).

## 9. Accessibility (built-in)
- One H1/page; logical headings. Skip link. Focus-visible via `--ring`. Radix gives roles/keyboard for tabs/accordion/dialog/select.
- Inputs labelled; errors `aria-live`. Price/total `aria-live="polite"`.
- Contrast: dark text on lime; white on electric-blue/indigo; verify muted text ≥4.5:1. Targets ≥24px. Real `alt`.

## 10. Do / Don't
- ✅ Compose from shadcn; JSON-driven copy; per-day pricing; exact esim70 section order + look.
- ❌ Hand-roll shadcn-provided primitives; hardcode marketing copy; fabricate reviews/ratings/counts/savings; use lime for more than one hero word; light text on lime; skip reduced-motion.
