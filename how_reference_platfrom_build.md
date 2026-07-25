# How the Reference Platform Is Built — esim70.com

> A content + visual/UX teardown of **https://www.esim70.com/**, produced for UI/UX planning and implementation reference.
> Method: live inspection in Chrome (in-app browser) — screenshots, accessibility-tree reads, `getComputedStyle`/CSS-variable extraction, and interaction/ARIA-state probing across desktop (1280px) and mobile (375px). Read-only analysis; no forms submitted, no account created, no payment entered.
> Compiled 2026-07-18. Every value below (colors, fonts, radii, routes, copy) was read from the live DOM/computed styles, not assumed.

---

## 1. Website Overview

**What it is.** esim70.com ("Esim70") is a **direct-to-consumer travel-eSIM storefront** — prepaid, data-only eSIM plans for **150+ countries** (165 destinations live in the catalogue). The pitch: buy a plan online, scan a QR code, land with data already working; keep your regular SIM/number active; skip roaming fees and airport SIM kiosks. Price framing is **per-day** ("from $1.36/day"), and there is a companion mobile app (iOS App Store + Google Play).

**Positioning & tone.** Confident, benefit-led, traveler-native. Headlines are short, punchy, uppercase ("INSTANT TRAVEL eSIM DATA. 150+ COUNTRIES. ZERO HASSLE."). Copy repeatedly removes friction ("no kiosk needed", "zero hassle", "buy it, scan it, land online").

**Tech stack (inferred, high confidence).** Next.js (App Router) + **Tailwind CSS v4** + **shadcn/ui** — the `:root` design tokens are the exact shadcn set (`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar-*`) and `--radius`. Fonts wired via `next/font`: **Poppins** (body) + **Oswald** (display), with Geist Mono as a mono token and Inter/system fallbacks. Cookie/consent uses a custom "Privacy choices" modal; **Microsoft Clarity** analytics is referenced as always-on. Client-side scroll-reveal animations (framer-motion-style inline `opacity/transform`).

**Trust signals used (real, not fabricated).** "Rated 4.3 on Google Play · 109 reviews", named testimonials with trip context and "Verified" badges, App Store/Google Play badges, per-plan "network partner" disclosure, and a "Purchase confidence" block ("Instant QR delivery after payment", "Transparent total before checkout").

---

## 2. Information Architecture

Single primary domain, shallow hierarchy, one long marketing homepage + focused sub-pages. Discovered routes:

**Top-level / marketing**
- `/` — Homepage (long, ~10 sections)
- `/destinations` — full country/region directory (165 entries)
- `/esim/[country]` — country plan detail (e.g. `/esim/japan`, `/esim/united-states`, `/esim/thailand`, `/esim/united-arab-emirates`, `/esim/turkey`, `/esim/france`, `/esim/united-kingdom`)
- `/esim/[region]` — **regional bundles** share the same route pattern (e.g. `/esim/asia` — "Coverage built for dense city hops and longer Asia itineraries")
- `/supported-devices` — device compatibility checker
- `/how-it-works` → anchor `/#how-it-works`
- `/what-is-esim` — explainer
- `/glossary` — terminology
- `/blog` — content/guides

**Conversion / account**
- `/auth` — sign in / create account / guest
- `/account/esims` — "My eSIMs" (authenticated)
- (checkout reached via "Continue to checkout" from a plan page)

**Company / support**
- `/about`, `/contact`, `/help`

**Legal**
- `/terms`, `/terms#refunds` (refund policy), `/privacy`

**In-page anchors (homepage):** `/#how-it-works`, `/#faq`, `/#testimonials`.

**External:** App Store, Google Play, Facebook, Instagram (`@esim.70`).

**Hierarchy depth:** Home → Destinations → Country/Region → Checkout is the core spine (≤3 clicks to any plan). Everything else is one hop from the header or footer.

---

## 3. Navigation Structure

### Header (global, sticky, "floating pill" bar)
A rounded, floating top bar (rounded container, subtle border, translucent) that **adapts its color to the section behind it**: white text on the purple hero; dark text on white pages.
- **Left:** logo — a rounded-square app-icon mark ("eSIM" over "70", blue tile with red "70").
- **Center:** primary nav — **Home · Destinations · Supported devices · How it works · FAQ**.
- **Right:** **Language/region selector** (pill showing "US EN", a flag-circle + locale; opens a chooser) and **Sign in** (translucent outlined pill).
- On sub-pages the header can also show a **"← Back"** control (seen on `/auth`).

### Mobile header + menu
- Collapses to: logo · language pill · **hamburger ("Open menu", `aria-expanded`)**.
- Tapping the hamburger opens a **full-screen white overlay**: large uppercase Oswald links stacked left-aligned (**HOME, DESTINATIONS, SUPPORTED DEVICES, HOW IT WORKS, FAQ**), a circular **✕** close top-right, and a **full-width red/coral "Sign in"** pill pinned to the bottom.

### Footer (global, 4 columns + app + social)
- **About Esim70:** About Us, Browse Plans, Reviews, Contact Us, Help center, How It Works, Sign in.
- **Top destinations:** eSIM Japan, Thailand, United States, UAE, United Kingdom, France, Turkey, All destinations.
- **Resources:** What is an eSIM, Supported Devices, Blog, Glossary, FAQ, My eSIMs.
- **Legal:** Terms and Conditions, Privacy Policy, Refund policy.
- **App badges:** Download on the App Store · Get it on Google Play.
- **Social:** Facebook, Instagram.
- **On mobile the four columns become collapsible accordions** (each heading is a button with `aria-expanded`).

### Contextual navigation
- **Breadcrumb-like anchors** and in-page jump links (`#how-it-works`, `#faq`, `#testimonials`, `#refunds`).
- **"Recently viewed"** floating chip (bottom-right) tracking last-viewed country pages (badge count).
- **"Continue your trip" / "Show all eSIM cards"** cross-links between country pages and the catalogue.

---

## 4. Complete Content Breakdown

### 4.1 Homepage (top → bottom)
1. **Hero.** H1 (uppercase, Oswald 900): "INSTANT TRAVEL eSIM DATA." (white) / "150+ COUNTRIES." (**lime green #c6f135**) / "ZERO HASSLE." (white). Sub: "Pick a single country or a whole region, compare rates clearly, and land with your data already ready." A large rounded **search field** ("Choose a destination") with quick **country chips** (Japan, USA, Thailand, UAE → `/esim/…`). Right side: a **large "70" brand graphic** with a photographic cut-out of a smiling traveler (hat + backpack + phone). Purple/indigo gradient background.
2. **Trust ticker (marquee).** A **red** full-width scrolling strip repeating: "Best value routes · Hotspot ready · Fast 4G / 5G worldwide · Regional and country plans" (⚡ icons, uppercase, infinite loop).
3. **"WHAT IS AN eSIM?"** Explainer paragraph: digital SIM built into the phone, buy online, scan QR, connect to a local network, skip roaming/kiosks. Key line: "prepaid travel eSIM data plans in 150+ countries **from $1.36/day**, activated in minutes."
4. **"WHERE TRAVELERS GO WITH eSIM70"** — destination comparison. Sub: "Compare per-day pricing across the top destinations. Tap any country to see plans, coverage, and validity in seconds." **Country / Regional tabs.** Cards for **Thailand (POPULAR, from $1.52/day, ~~$1.85~~ Save $0.33)**, UAE (from $3.04/day), **Turkey (TRENDING, from $1.72/day, Save $0.33)**, Egypt (from $2.32/day), China (from $2.24/day), **United States (BEST VALUE, from $1.36/day, Save $0.29)**, Germany (from $1.88/day), **Vietnam (TRENDING, from $2.00/day)**. Each card: flag, country, badge, from-price/day, struck original price + savings. **"Show all eSIM cards"** button.
5. **"FIND YOUR PERFECT PLAN"** — a **3-step quiz** ("Three quick questions on your trip purpose, needs, and duration…"). Step 1 of 3, "What's your trip purpose?" with 6 selectable option cards (each with a sub-description): Vacation & sightseeing, Business trip, Remote work, Backpacking, Family vacation, Quick stop or layover. **Back / Next** controls + step indicator.
6. **"HOW IT WORKS"** (eyebrow "NO KIOSK NEEDED"). H2 "BUY IT. SCAN IT. LAND ONLINE." Three numbered steps: **01 START WITH THE ROUTE — "Pick the right plan"** (filter by country/region, compare data/validity/cost); **02 BUY ONCE — "Check out, get QR fast"** (secure payment → instant QR + activation instructions); **03 SWITCH ON ABROAD — "Scan, install, go online"** (install, activate on arrival, main SIM stays active). Feature chips: "Country + region plans", "Instant qr installation", "Main SIM stays active". CTA: **"Explore travel plans"**.
7. **"WHY TRAVELERS PICK eSIM70"** — 5 benefit cards: "Keep your number. Add travel data.", "Pick a plan that matches the trip", "Support that actually helps", "Buy fast. Activate faster.", "Clear coverage. No roaming guesswork." (each with a supporting paragraph).
8. **"REAL REVIEWS FROM REAL TRIPS."** Eyebrow: "Rated 4.3 on Google Play · 109 reviews". A **testimonial carousel** (multi-row, auto-scrolling) of named reviews with avatars (initials), trip context, star ratings, and **"Verified"** badges — e.g. Marcus K. (9 days in Japan, 5/5), Priya (Lisbon, 4/5), Daniel Otieno (Madrid, business), A. Bello (city-hop weekends), @hiroko.travels (Croatia family), Tomás R. (India), Elena (SE Asia backpacking), Owen M. (Greek Islands cruise).
9. **CTA band — "Leave home planned. Land already online."** (conversion prompt).
10. **"FREQUENTLY ASKED QUESTIONS"** — accordion (7 items, first open by default):
    1. When should I buy my eSIM, and does it activate right away?
    2. How do I install my Esim70 eSIM, and how long does setup take?
    3. Can I keep using my regular SIM card and phone number?
    4. What happens if I run out of data before my trip ends?
    5. How do I know if my phone is compatible with an eSIM?
    6. Do you offer support if my eSIM is not working abroad?
    7. Is there a refund policy if I bought the wrong plan?
11. **"TAKE eSIM70 WITH YOU"** — app promo (App Store + Google Play).
12. **Footer** (see §3).

### 4.2 `/destinations`
- H1 "STAY ONLINE IN 150+ COUNTRIES". Sub: "Every supported destination, alphabetical and searchable. Tap a country to see plans, activation rules, and what to expect on arrival."
- **Filter tabs:** All (default) / Country / Regional.
- **Search:** "Search by country or country code (e.g. JP)".
- **Directory:** **165** alphabetical entries as cards → `/esim/[slug]`; each card shows a flag circle, country **name**, **region** label (Asia, Europe, Africa, Americas, Oceania, Middle East, "Other"), and a chevron. **Regional bundles** appear inline (e.g. "Asia — Coverage built for dense city hops and longer Asia itineraries").

### 4.3 `/esim/[country]` (e.g. Japan)
- H1 "eSIM for Japan" (flag chip). "Plans from $2.49 per day". **Live local-time widget** ("It's 01:02 in Japan", clock icon).
- **"Choose your plan"** — selectable plan grid (radio). Real Japan tiers: **Unlimited** (duration dropdown 7/15/30 days) €30.99 with **BEST VALUE** banner; 1 GB/7d €3.99; 3 GB/7d €6.99; 5 GB/15d €10.99; 10 GB/30d €18.99; 15 GB/30d €24.99; 20 GB/30d €32.99; 30 GB/30d €47.99.
- **Sticky purchase panel** (right): selected plan + validity, "1 network partner" (expandable), large price, **"Continue to checkout →"** (electric-blue), and a **"PURCHASE CONFIDENCE"** block ("Instant QR delivery after payment", "Transparent total before checkout").
- **Rich unique per-country content** (this is the SEO backbone): a **"Japan"** section with sub-sections **When to activate**, **Network partners**, **Connection details**, **Country context**, **Why eSIM here, not a local SIM**; a **"From order to online in 4 steps"** mini how-it-works; a country-specific FAQ **"Common questions about Japan"**; and **"Continue your trip"** (related destinations). Plus the "Recently viewed" chip.

### 4.4 `/supported-devices`
- H1 "Devices that support eSIM." Sub: "Type your phone model and get an instant Yes / No answer. We've covered the most common iPhones, Galaxies, and Pixels." **Model search field** ("Your phone model").
- "Don't see your phone? … dial **`*#06#`** on your phone — if you see an **EID** number, your device supports eSIM."
- **Device category tabs/sections:** **Smartphones, Smartwatches, Tablets, Laptops, Wi-Fi Routers, Cars** (6 categories), each listing supported models (iPhone, Samsung Galaxy, Google Pixel, …).

### 4.5 `/auth`
- Header variant with "← Back". **Bento (2-column):**
  - Left "**Sign in fast**": "Use your account to manage eSIMs, orders, and installation details." → **Continue with Google** (Google G) → "OR USE EMAIL" divider → **Email address** (`name@example.com`) → **Password** (show/hide) → **Sign in** (blue) → "Need an account? **Create one**".
  - Right "**Prefer not to create an account yet?**": "You can still continue as a guest…" → **Guest email** (`you@example.com`) → **Continue as guest** (icon).

### 4.6 Other pages (existence + purpose; footer-linked)
`/what-is-esim` (explainer), `/glossary` (terminology), `/blog` (guides), `/about`, `/contact`, `/help` (help center), `/account/esims` (My eSIMs — auth), `/terms`, `/terms#refunds`, `/privacy`. The **cookie/consent modal** ("PRIVACY CHOICES — Choose what we can measure", Accept/Deny, Privacy/Terms) appears on entry and re-appears on navigation until a choice persists.

## 5. Complete Visual Design Analysis

**Overall aesthetic.** Bold, high-energy, "travel-tech" — heavy uppercase condensed display type, a saturated indigo/purple hero, a lime-green accent, a red trust strip, generous rounding, and clean white content pages. It reads modern and confident rather than minimal.

**Signature visual moves:**
- **Section-adaptive floating header** — a rounded pill bar that visually detaches from the page and flips text color light/dark per section background.
- **Hero split composition** — oversized uppercase headline (left) vs. a die-cut traveler photo layered over a giant translucent "70" mark (right) on a purple radial/linear gradient.
- **One color used surgically per role** — indigo = brand/primary surfaces; electric blue = active/CTA; lime = a single highlighted headline word; red/coral = the trust ticker + mobile primary CTA + logo accent; near-black text on white content.
- **Rounded everything** — cards ~22px, buttons full-pill or 18px, base token radius `.625rem` (10px). Borders are thin, low-contrast (`#e5e5e5`/`#ececf2`); shadows are subtle-to-none (flat, border-led elevation).
- **Data-forward cards** — destination/plan cards foreground price-per-day, savings (strikethrough + "Save $X"), and status badges (POPULAR / TRENDING / BEST VALUE).

**Imagery/illustration.** Photographic traveler cut-outs (transparent PNG people) layered on brand shapes; flag chips (circular) for countries; the "70" numeral as a recurring brand graphic; app-store badges; avatar initials for reviews. Icons are line-style (lightning, clock, shield, signal bars, chevrons, Google G).

**Backgrounds.** Purple gradient on hero/marketing bands; white/near-white (`#fff`, `#fafafa`) on content and plan pages; light gradient wash on the plan-page top.

---

## 6. UI Component Inventory

| Component | Where | Notes |
|---|---|---|
| Floating header bar | global | rounded pill, section-adaptive color, sticky |
| Logo mark | global | rounded app-icon "eSIM/70" (blue tile, red 70) |
| Primary nav links | header | text links; uppercase in mobile overlay |
| Language/region selector | header | pill ("US EN" + flag), opens chooser; also switches currency (saw EUR) |
| Sign-in button | header | translucent outlined pill (desktop); red full-width pill (mobile menu) |
| Hamburger + full-screen menu | mobile | `aria-expanded`, ✕ close, large Oswald links, bottom CTA |
| Hero search field | home | large rounded input "Choose a destination" + quick chips |
| Country/region chips | home hero | small pill links to `/esim/…` |
| Marquee trust ticker | home | red infinite-scroll strip with icons |
| Destination card | home + `/destinations` | 22px radius, 2px border, flag, name, region, badge, price/day, savings, chevron |
| Filter tabs (segmented) | destinations, home dest section, devices | pill segmented control; active = filled electric-blue pill |
| Search input (icon-left) | destinations, devices | rounded, placeholder with example |
| Quiz stepper | home | multi-step, option cards, Back/Next, "STEP n OF 3" |
| Numbered process steps | home + plan page | "01/02/03", eyebrow + title + body |
| Benefit cards | home | title + paragraph grid |
| Testimonial carousel | home | multi-row auto-scroll, avatar initials, rating, Verified badge |
| Accordion (FAQ) | home + plan page | `aria-expanded`, first open, chevron rotate |
| Plan card (selectable) | plan page | radio, BEST VALUE banner, GB/validity/price, validity dropdown on Unlimited |
| Sticky purchase panel | plan page | selected plan, network partner (expandable), price, checkout CTA, confidence bullets |
| Local-time widget | plan page | live "It's HH:MM in {country}" with clock icon |
| "Recently viewed" chip | plan/auth | floating bottom-right, badge count |
| Auth cards (bento) | `/auth` | sign-in card + guest card; Google button, show/hide password |
| Device model checker | `/supported-devices` | search → instant Yes/No; category tabs |
| App-store badges | footer/home | App Store + Google Play |
| Consent modal | global | "Privacy choices", Accept/Deny, Privacy/Terms, shield icon |
| Footer (4-col → accordion) | global | columns collapse on mobile |
| Badges/labels | cards | POPULAR, TRENDING, BEST VALUE, Verified, region tags |

---

## 7. Layout System

- **Container:** centered, max content width roughly ~1200–1280px, comfortable side gutters; the header is a floating rounded bar inset from the edges.
- **Grid:** responsive CSS grid / flex. Destination + plan + benefit grids run **1 → 2 → 3/4 columns** by breakpoint. Plan page uses an **asymmetric two-column** layout: plan grid (wide, left) + **sticky summary rail** (right).
- **Section rhythm:** tall, clearly separated marketing bands with generous vertical padding; alternating background (purple bands vs white) to segment the long homepage.
- **Alignment:** left-aligned headings and copy dominate; centered treatment for a few band headers. Content is airy with strong whitespace.

---

## 8. Typography System

- **Display font: Oswald** (condensed, heavy) — token `--font-display: var(--font-oswald), Impact, "Arial Narrow Bold", …`. Used for all big headings, **uppercase**, weights up to **900**. Hero H1 measured **50px / 60px line-height, weight 900, `text-transform: uppercase`**, white. Section H2s and mobile nav links also use this condensed uppercase display voice.
- **Body font: Poppins** — token `--font-body: var(--font-poppins), "Avenir Next", Avenir, "Segoe UI", …`. Used for paragraphs, labels, buttons, UI text. Base body **16px**. (Inter + Geist Mono are also loaded — Geist Mono is the `--font-geist-mono` token; Inter serves as a fallback family.)
- **Hierarchy:** Eyebrows = small uppercase tracked labels (e.g. "NO KIOSK NEEDED", "STEP 1 OF 3", "PURCHASE CONFIDENCE"). Display H1/H2 = condensed uppercase. Body = sentence-case Poppins. Prices/numerals rendered prominently (large weight) on cards and the purchase panel.
- **Case:** Headlines uppercase; body/UI sentence case; eyebrows uppercase + letter-spacing.

---

## 9. Color System (verified from CSS variables)

Design tokens are the **shadcn/ui** set on `:root`:

| Token | Value | Role |
|---|---|---|
| `--primary` | `#615de5` | indigo — brand/primary surfaces, `--ring` |
| `--primary-foreground` | `#fff` | text on primary |
| `--background` | `#fff` | page background |
| `--foreground` | `#0a0a0a` | primary text (near-black) |
| `--secondary` / `--muted` / `--accent` | `#f5f5f5` | soft fills |
| `--secondary/muted/accent-foreground` | `#171717` / `#737373` (muted) | text/labels |
| `--destructive` | `#e40014` | errors / destructive |
| `--border` / `--input` | `#e5e5e5` | hairlines, field borders |
| `--chart-1..5` | `#f05100`, `#009588`, `#104e64`, `#fcbb00`, `#f99c00` | data/accent palette (orange/teal/dark-teal/yellow/amber) |
| `--sidebar-*` | grays (`#fafafa`, `#171717`, …) | app/sidebar surfaces |
| `--radius` | `.625rem` (10px) | base radius |

**Brand colors observed beyond the tokens (used surgically):**
- **Indigo/purple gradient** — hero + marketing bands (built around `--primary #615de5`).
- **Electric blue `#3535ff`** — active tab fill + primary CTA (e.g. "Continue to checkout"). (Distinct from the softer `#615de5`.)
- **Lime green `#c6f135`** (rgb 198,241,53) — a single emphasized headline word ("150+ COUNTRIES").
- **Red / coral** — the trust ticker strip, the mobile "Sign in" CTA, and the logo "70". (In the `--chart-1 #f05100` / `--destructive #e40014` warm family.)
- **Neutrals** — near-black `#0a0a0a` text on white; grays `#737373` (muted text), `#e5e5e5`/`#ececf2` borders, `#f5f5f5`/`#fafafa` fills.

**Usage discipline:** color is role-assigned — brand purple for identity, electric blue for the single most important action, lime for one hero highlight, red for the attention strip/mobile CTA, and restrained grays everywhere else.

## 10. Spacing System

- **Base radius token** `.625rem` (10px); applied radii scale up for larger surfaces — **buttons** full-pill (fully rounded) or 18px (checkout), **cards** ~22px, **inputs** rounded (pill-ish), **modal** large-radius.
- **Borders:** consistently thin — 1px (`#e5e5e5`) to 2px (`#ececf2` on destination cards). Elevation is **border-led and flat**; box-shadows are subtle or none (cards read via border, not shadow).
- **Whitespace:** generous. Tall section padding, roomy card padding (destination card measured `16px 20px`), clear separation between marketing bands. Follows a standard Tailwind spacing rhythm (4/8px base).
- **Field padding:** buttons `0 20px` horizontal with pill height; inputs comfortably padded with left icon affordance.

---

## 11. Responsive Behavior

- **Breakpoints:** standard Tailwind (sm 640 / md 768 / lg 1024 / xl 1280). Verified at **1280px (desktop)** and **375px (mobile)**.
- **Header → mobile:** full nav collapses behind a **hamburger ("Open menu")**; language pill stays; opens a **full-screen white overlay** with large uppercase Oswald links and a **bottom-pinned red "Sign in"** pill; ✕ closes.
- **Hero:** desktop = two-column (headline + photo/"70"); mobile = single column, headline stacks, image sits behind, search + chips stack.
- **Grids:** destination/plan/benefit grids reflow 4→2→1; the plan page's sticky summary rail drops below the plan grid on small screens.
- **Footer:** desktop 4-column; **mobile → collapsible accordions** (each column heading is an `aria-expanded` toggle).
- **Type:** display headlines scale down on mobile but stay uppercase/condensed; the marquee ticker persists.
- **Touch:** large tap targets (pill buttons, full-width CTAs, big nav links).

---

## 12. Interaction Patterns

- **Segmented tabs (All/Country/Regional; device categories):** click switches the active filter; active tab = filled **electric-blue pill**, inactive = plain text; the list below filters instantly.
- **Search (destinations, devices):** type-to-filter; devices returns an **instant Yes/No** compatibility verdict per model.
- **Quiz (3-step):** select an option card → **Next**; **Back** returns; a "STEP n OF 3" indicator tracks progress; result narrows the catalogue to matching plans.
- **Plan selection:** radio-style cards; selecting updates the **sticky purchase panel** (plan name, validity, network partner, price). The Unlimited plan exposes a **validity dropdown** (7/15/30 days) that changes price.
- **Accordions (FAQ, per-country FAQ, mobile footer):** click a header toggles `aria-expanded`; one-open pattern on FAQ (first open by default); chevron rotates.
- **Language/region selector:** opens a chooser; also drives **currency** (observed prices switch to EUR).
- **Consent modal:** blocking overlay on entry; **Accept** / **Deny**; dims the page behind; re-appears on navigation until persisted; links to Privacy/Terms.
- **Recently viewed:** persists last-viewed country pages into a floating chip with a count.
- **Header color adaptation:** nav text flips light/dark based on the section scrolled behind it.
- **Hover/focus:** buttons lift/darken on hover; links underline/shift color; visible focus rings (`--ring #615de5`). (States present but not exhaustively frame-captured.)

---

## 13. Animation & Motion Analysis

- **Scroll-reveal:** most below-the-fold sections start at `opacity: 0` (+ transform) and animate in on scroll (framer-motion-style `whileInView` — inline `opacity/transform` observed on ~72 elements in one section). This makes the page feel alive but means content is intentionally hidden until scrolled into view.
- **Marquee:** the red trust ticker scrolls infinitely (CSS keyframe translate loop), duplicated content for seamless looping.
- **Carousel:** testimonials auto-scroll horizontally across multiple rows (continuous marquee-style motion).
- **Micro-interactions:** pill buttons scale/darken on press/hover; accordion chevrons rotate; tab active-state transitions; header color transitions on scroll.
- **Live data motion:** the plan-page **local-time widget** updates ("It's 01:02 in {country}").
- **Motion character:** smooth, medium-duration ease transitions; energetic but not distracting. (No explicit `prefers-reduced-motion` verification was performed.)

---

## 14. User Journey

**Primary purchase spine (≤3 clicks to a plan):**
`Home` → (hero search / country chip / "Where travelers go" card / quiz result) → `/destinations` **or** directly `/esim/[country]` → select a plan (updates sticky panel) → **Continue to checkout** → checkout → QR delivery.

**Assisted discovery:** the **3-step quiz** (purpose → needs → duration) funnels undecided users to a filtered plan set; the **destinations directory** (search + All/Country/Regional tabs) serves decided users; **Top destinations** cards + footer links serve SEO/returning users.

**Trust-building loop:** "What is an eSIM?" (educate) → "How it works" (de-risk) → "Why travelers pick eSIM70" (differentiate) → "Real reviews" (social proof, 4.3★/109) → FAQ (objection-handling) → app promo (retention).

**Account/guest fork:** `/auth` offers Google, email/password, **or guest checkout** ("come back to create an account later") — reducing friction at the conversion moment. Post-purchase → `/account/esims` ("My eSIMs").

**Support paths:** Help center, Contact, per-country FAQ, and global FAQ; refund policy under Terms.

---

## 15. Reusable Design Patterns

- **Section-adaptive floating header** (single component, color-flips per background).
- **Data card with badge + savings** (destination/plan cards: badge, price/day, strikethrough + "Save $X", chevron).
- **Segmented pill tabs** (All/Country/Regional; device categories) — same control reused.
- **Eyebrow → uppercase display heading → body** section header pattern (repeated across every band).
- **Numbered process trio** (01/02/03) reused on home + plan page ("From order to online in 4 steps").
- **Accordion** (FAQ, per-country FAQ, mobile footer) — one control, multiple contexts.
- **Sticky summary rail** (plan page) mirroring the selected item.
- **Bento two-card** layout (auth: primary action + alternative).
- **Marquee** (trust ticker + testimonials) — same motion primitive.
- **"Confidence" microcopy blocks** (Instant QR, transparent total) reused at decision points.
- **Region tagging** on every country entity.

---

## 16. Content Organization

- **Homepage as a funnel:** ordered hero → educate → compare → guide (quiz) → process → differentiators → proof → CTA → FAQ → app. Each band answers the next likely question.
- **Per-day pricing as the comparison unit** everywhere ("from $X/day"), with savings framing (strikethrough + "Save").
- **Country pages are content-rich, not thin:** every `/esim/[country]` carries unique editorial (when to activate, network partners, connection details, country context, "why eSIM here not a local SIM", country-specific FAQ) around the plan grid — a deliberate, SEO-strong programmatic pattern.
- **Consistent taxonomy:** countries always tagged with a region; regional bundles share the `/esim/` namespace with descriptive intros.
- **Microcopy voice:** short, reassuring, traveler-native; removes friction and names objections directly.

---

## 17. Key Design Principles

1. **Reduce friction relentlessly** — "no kiosk", "zero hassle", guest checkout, instant QR, one-tap chips.
2. **Make the value legible at a glance** — per-day pricing, savings, badges, "network partner", "transparent total".
3. **Bold, confident brand voice** — heavy uppercase condensed display, saturated hero, single surgical accent per role.
4. **Educate to convert** — dedicated explainer + how-it-works + glossary + per-country context lower the eSIM-newcomer barrier.
5. **Earn trust honestly** — real Google Play rating, named/verified reviews, transparent pricing, purchase-confidence blocks.
6. **Flat, rounded, modern system** — border-led elevation, generous rounding, restrained shadows, clean white content.
7. **Systematized reuse** — a small set of components (cards, tabs, accordions, numbered steps, marquees) recomposed everywhere for consistency.

---

## 18. Notable UX Decisions

- **Guided quiz** to convert undecided buyers (purpose/needs/duration → filtered plans).
- **Live local-time widget** on country pages — subtle relevance/credibility cue for travelers.
- **"Recently viewed"** persistence — smooths comparison shopping across countries.
- **Guest checkout** front-and-center in auth — lowers conversion friction.
- **Section-adaptive header** — keeps nav legible over both the purple hero and white pages without a second header.
- **Per-country editorial depth** — differentiates from thin template competitors and supports search.
- **Currency/locale coupling** — the language selector also switches displayed currency (USD ↔ EUR observed).
- **Consent-first** — a blocking privacy modal with clear Accept/Deny and honest analytics disclosure (names Microsoft Clarity).
- **App cross-promotion** — repeated App Store/Play badges push retention beyond the web funnel.
- **Savings framing** — strikethrough + "Save $X" nudges perceived value on comparison cards.

---

## 19. Screenshots Reference

Screenshots captured live during analysis (fresh above-the-fold loads render reliably; deeper sections were verified via DOM/computed-style extraction because scroll-reveal keeps them `opacity:0` until in view):

1. **Homepage hero (desktop)** — purple gradient, uppercase Oswald H1 with lime "150+ COUNTRIES", search + country chips, traveler+"70" graphic, red ticker, consent modal.
2. **`/destinations` (desktop)** — "STAY ONLINE IN 150+ COUNTRIES", All/Country/Regional tabs, search, alphabetical country cards with region tags.
3. **`/esim/japan` (desktop)** — "eSIM for Japan", local-time widget, plan grid (BEST VALUE Unlimited + GB tiers), sticky purchase panel with "Continue to checkout" + purchase-confidence.
4. **`/auth` (desktop)** — bento: "Sign in fast" (Google + email/password) + "Prefer not to create an account yet?" guest card.
5. **Homepage hero (mobile 375px)** — stacked, hamburger + language pill, mobile consent card.
6. **Mobile menu overlay** — full-screen white, large uppercase links, red bottom "Sign in".

(Screenshots live in the browser session; re-capture from the routes above as needed. Design values in this doc were read from computed styles and are reproducible without the images.)

---

## 20. Complete Observations and Findings

**Confirmed facts (read from the live site):**
- 165 destinations in the catalogue; "150+ countries" marketing figure; per-day pricing from ~$1.36/day.
- Real plan tiers (Japan): 1/3/5/10/15/20/30 GB + Unlimited (7/15/30-day), €3.99–€47.99.
- Tech: Next.js + Tailwind v4 + shadcn/ui tokens; Oswald (display) + Poppins (body) + Geist Mono; framer-style scroll-reveal; Microsoft Clarity.
- Design tokens verified (`--primary #615de5`, `--destructive #e40014`, `--border #e5e5e5`, `--radius .625rem`, chart palette). Brand accents: electric-blue `#3535ff` (CTA/active), lime `#c6f135` (hero highlight), red/coral (ticker + mobile CTA + logo).
- Full route map, footer IA, FAQ set, and interaction/ARIA states documented above.
- Trust is **real and specific** (4.3★ / 109 Google Play reviews; named, context-rich, "Verified" testimonials) — a model of honest social proof.

**Standout strengths to emulate:**
- Content-rich programmatic country pages (unique per-country editorial + FAQ) — the correct way to do 150+ pages.
- Clear per-day/savings comparison model and a sticky, low-anxiety purchase panel ("transparent total", "instant QR").
- Friction-reducing conversion design (guest checkout, quiz, recently-viewed, chips).
- Disciplined, role-based color and a small, heavily-reused component set.

**Caveats / not fully verified (would need deeper passes):**
- The actual **checkout/payment** screens and **`/account/*`** (authenticated) were not walked (no purchase/login performed).
- Word-for-word content of `/what-is-esim`, `/glossary`, `/blog`, `/about`, `/contact`, `/help`, `/terms`, `/privacy` was not transcribed (existence + purpose + shared design confirmed).
- `prefers-reduced-motion`, exact keyframe timings, and every hover/focus micro-state were observed structurally but not frame-by-frame.
- Some deeper below-fold section **screenshots** were blocked by scroll-reveal (`opacity:0`); their **content and structure** were fully captured via DOM extraction instead.

**Relevance to the eSIMFlys build (this repo):** esim70.com is clearly the design lineage of the eSIMFlys Stitch mockups — near-identical hero copy, the same funnel spine (home → destinations → country plan → checkout → confirmation/QR), the same content sections, and the shared lime `#c6f135` accent. The two meaningful things esim70 does that our blueprint already flagged as critical: (1) **content-rich per-country pages** (their SEO moat — matches our §26 index-gate/unique-content requirement), and (2) **honest, specific trust signals** (real ratings/reviews — matches our no-fabrication rule). Its `--radius`/shadcn/Tailwind-v4 foundation and Oswald/Poppins pairing are directly reusable design references.

*End of reference document.*


