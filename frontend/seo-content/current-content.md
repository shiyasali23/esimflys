# eSIMFlys — Current Frontend Content (verbatim extraction)

**Purpose:** every user-facing / SEO-relevant text block currently in the frontend, quoted as-is, matched to its source file and section. Basis for `content-analysis.md`, `rewritten-content.md`, and `validation-report.md`.
**Scope reviewed:** `content/*.json`, `content/legal/*.js`, page components under `features/**` and `app/**`, metadata builders, `config/site.js`, image alt text, nav/footer/chrome.
**Method:** three file-by-file passes (Homepage+chrome · Catalog+commerce · Standalone+nav/footer/legal), verbatim quotes only. Repo root: `frontend/src`.

---

## 1. Homepage + global chrome

### `content/home.json`
- **hero** — titleLines: `"Instant travel eSIM data."` / `"60+ countries."` / `"Zero hassle."`; highlightLine: `"60+ countries."`; subtitle: `"Pick a single country or a whole region, compare rates clearly, and land with your data already ready."`; cta.label: `"Choose a destination"` → `/destinations`
- **whatIsEsim** — title: `"What is an eSIM?"`; body: `"An eSIM is a digital SIM built into your phone — no plastic card to insert. Buy a data plan online, scan a QR code, and your device connects to a local network, skipping roaming fees and airport SIM kiosks. Prepaid travel eSIM data in 60+ countries, activated in minutes."`
- **whereTravelersGo** — title: `"Where travelers go with eSIMFlys"`; subtitle: `"Compare per-day pricing across the top destinations. Tap any country to see plans, coverage, and validity in seconds."`; cta.label: `"Show all eSIM cards"`
- **howItWorks** — eyebrow: `"No kiosk needed"`; title: `"Buy it. Scan it. Land online."`; subtitle: `"The whole setup is built to stay obvious under travel pressure: choose a plan, pay once, scan the QR, and keep moving without hunting for a plastic SIM on arrival."`; features: `["Country + region plans", "Instant QR installation", "Main SIM stays active"]`; cta.label: `"Explore travel plans"`; steps: `01 "Start with the route" / "Pick the right plan" / "Filter by country or region, then compare data amount, validity, and cost in seconds. See coverage, validity, and price before you commit."` · `02 "Buy once" / "Check out, get QR fast" / "Complete your secure payment to instantly receive your QR code and easy activation instructions. Delivery is instant, so setup can happen before the flight."` · `03 "Switch on abroad" / "Scan, install, go online" / "Install on your phone and activate when needed, while your regular SIM remains active. Use travel data while your main number stays reachable."`
- **whyPick** — title: `"Why travelers pick eSIMFlys"`; subtitle: `"The experience is built to remove friction: faster setup, clearer plan choices, and coverage details you can understand at a glance."`; benefits (5): `"Keep your number. Add travel data." / "Go online abroad without removing your regular SIM, visiting kiosks, or dealing with tiny trays at the airport."` · `"Pick a plan that matches the trip" / "Choose lighter data for short stays or larger bundles for work, maps, uploads, and nonstop travel days."` · `"Support that actually helps" / "If setup gets stuck or your route changes mid-trip, you can get answers quickly instead of troubleshooting alone."` · `"Buy fast. Activate faster." / "Purchase online, scan the QR code, and finish activation in a few taps before departure or right after landing."` · `"Clear coverage. No roaming guesswork." / "See where each plan works and connect through trusted local networks with pricing shown upfront."`
- **ctaBand** — title: `"Leave home planned. Land already online."`; subtitle: `"Compare country and regional plans in minutes, activate before your flight, and skip the airport SIM scramble entirely."`; cta.label: `"Explore travel plans"`; assurances: `["Instant QR delivery", "Coverage in 60+ destinations", "No roaming surprises"]`
- **appCta** — title: `"Take eSIMFlys with you"`; subtitle: `"Manage plans, top up mid-trip, and reach support from your phone. Works on iOS and Android."`

### `content/reviews.json`
- **header** — eyebrow: `"What travelers say"`; title: `"Reviews from real trips."`; subtitle: `"Travelers across business trips, family weeks and city hops, sharing what worked and what didn't."`; note: `"Sample reviews shown for layout — replace with your own verified customer reviews before launch."`
- **items** (8, sample-labelled) — Amara N. · 9 days in Japan; Leo P. · Long weekend in Lisbon; Sofia R. · Business trip · Madrid; Diego B. · Three city-hop weekends; **Hiroko T. · Family trip · Croatia**: `"Two kids, one ferry with no Wi-Fi, and a lot of 'can I see the map again'. One plan covered all of us through a single hotspot for the week."`; Ravi K. · 3 weeks · India; **Elena M. · Backpacking SE Asia**: `"Bought a regional plan once, used it across four countries. Didn't have to think about it again."`; Owen S. · Cruise stops · Greek Islands.

### `content/faq.json`
- **header** — title: `"Frequently asked questions"`; subtitle: `"Fast answers on activating your prepaid travel eSIM — compatibility, delivery timing, and international data usage before you checkout."`; stillCurious links: `"What is an eSIM?"` / `"Supported devices"` / `"Help center"`
- **items** (7 Q&As) — buy timing/activation; install time (2–3 min); keep SIM+number; run out of data (buy another / top up if supported); phone compatibility; support; refund policy. *(All honest, conditional, no hotspot claim.)*

### `content/quiz.json` + `trip-quiz.client.jsx`
- intro title: `"Find your perfect plan"`; subtitle: `"Three quick questions on your trip purpose, needs, and duration and we'll filter the catalog down to the plan that actually fits."`
- purpose options (6) incl. **"Business trip" / "Email, calls, light hotspot for laptop"**, **"Remote work" / "Daily video calls, heavy hotspot, weeks of use"**, **"Family vacation" / "Multiple devices, kids' tablets, hotspot"**
- needs options (4) incl. **"Heavy" / "Video calls, hotspot, uploads"**, "Unlimited"; duration options (4); cta.label: `"See matching plans"`
- recommend(): `"Based on your answers, we suggest around {data} for {duration}. Pick your destination to see matching plans."`; DATA_BY_NEED: Light "3–5 GB" / Medium "10 GB" / Heavy "20 GB" / Unlimited "an Unlimited daily plan"

### `content/site.json`
- tagline: `"Instant travel eSIM data — no roaming, no kiosks."`
- ticker: `["Best-value routes", "Hotspot ready", "Fast 4G / 5G worldwide", "Country and regional plans", "Keep your own number"]`
- stats: `Countries covered "60+"` / `Data plans "385"` / `Networks "4G / 5G"` / `Average activation "2 min"`
- appStores: App Store / Google Play (rendered "· soon")

### `config/site.js`
- SITE.tagline: `"Instant Travel eSIM Data"` (feeds default `<title>` + OG)
- SITE.description: `"Prepaid data-only travel eSIMs for 60+ countries. Buy online, scan a QR code, and get connected on arrival — no physical SIM, keep your number."`

### Image alt text
- `hero.jsx`: `"Circular travel scene with a mountain, city skyline, beach and high-speed train, plus a smartphone and suitcase — worldwide travel eSIM connectivity."`
- `what-is-esim.jsx` desktop: `"Travel eSIM journey — a suitcase and phone at departure linked by a flight path to a city skyline and a connected phone on arrival."`; mobile: `"A smartphone showing a Wi-Fi signal in front of a city skyline with an airplane overhead — travel eSIM data on arrival."`

### `app/layout.js` (default metadata)
- title.default: `"eSIMFlys | Instant Travel eSIM Data"`; title.template: `"%s | eSIMFlys"`; description = SITE.description; OG mirrors. `app/(marketing)/page.js`: `metadata = { alternates: { canonical: "/" } }`.

### Micro-labels (functional, KEEP)
hero cta "Choose a destination"; hero-search "Search a country…"/"Search"/"No countries match …"; tabs "Country"/"Regional"; badges "Popular"/"Best value"; "from $X / day"; "STEP {n}"; "Still curious?"; quiz nav ("Next"/"Back"/"Step X of Y"/"See my recommendation"/"Start over"); store labels.

---

## 2. Catalog + commerce

### `app/(marketing)/esim/[slug]/page.js`
- **metadata** — title: `` `eSIM ${country.name} — Travel Data Plans` ``; description: `` `Prepaid travel eSIM for ${country.name}${priceLine}. Fast 4G/5G data, install by QR code, keep your number.` `` (priceLine = `` ` from $${perDay.toFixed(2)}/day` `` or empty)
- **H1** — `eSIM {country.name}`
- **intro** — `High-speed 4G/5G data across {country.name}. Install by QR code, keep your number — no physical SIM.`
- **CONFIDENCE** — `"Instant QR delivery by email"` / `"Keep your number — data only"` / `"Trusted local 4G / 5G networks"` / `"No contract, no deposit"`
- **empty state** — H2 `Plans coming soon`; p `eSIM plans for {country.name} aren't available right now. Browse other destinations or check back shortly.`; link `Browse destinations`

### `features/catalog/components/country-content.jsx` (templated across 68 countries)
- **When to activate** — `Install your eSIM before you fly while you're on Wi-Fi, then turn it on when you land in ${country.name}. Most plans start once you connect to a local network — not at purchase.`
- **Network partners** — `In ${country.name}, eSIMFlys connects through trusted local networks — ${networks.join(", ")} — and your device selects the strongest available signal.`
- **Connection details** — `Plans run on 4G/5G where available${minGb ? \`, with data from ${minGb} GB to ${maxGb} GB\` : ""}${maxValidity ? \` and validity up to ${maxValidity} days\` : ""}. Use it for browsing, maps, messaging, and calls over the internet.`
- **Why an eSIM for {country.name}?** — `Skip roaming charges and airport SIM kiosks. Keep your regular number active for calls and texts while your eSIMFlys plan handles data — no plastic SIM, no deposit, no contract.`

### `features/catalog/components/country-faq.jsx` (templated — only `${country.name}` varies)
- Heading — `{country.name} eSIM — FAQ`
- Q1 `Will my phone work with an eSIM in ${country.name}?` / A1 `If your device supports eSIM (most iPhone XS and newer, Pixel 3+, and Galaxy S20+ models do) and is carrier-unlocked, it will work in ${country.name}. Dial *#06# to check for an EID.`
- Q2 `When does my ${country.name} plan start?` / A2 `Your plan activates when you install the eSIM and connect to a network in ${country.name} — not at purchase. Install on Wi-Fi before you travel and switch it on when you land.`
- Q3 `Can I keep my number while using data in ${country.name}?` / A3 `Yes. Your eSIMFlys plan is data-only, so your regular SIM stays active for calls and texts while the eSIM handles data.`
- Q4 `What if I need more data in ${country.name}?` / A4 `Buy another plan any time, or top up if your plan supports it. You can extend your connection without starting over.`

### `features/catalog/components/plan-selector.client.jsx`
H2 "Choose your plan"; sr-only legend "Choose a data plan for {country.name}"; plan sub-labels "Unlimited"/"{data_gb} GB", "{perDayGb} GB/day · {validity_days} days", "Valid for {validity_days} days"; H2 "Networks in {country.name}"; H2 "Purchase summary" (Plan/Validity/Total); button "Continue to checkout"; caption "Secure checkout".

### `features/catalog/components/destinations-browser.client.jsx`
Tabs "All"/"Country"/"Regional"; placeholder "Search by country or code (e.g. JP)"; aria "Search destinations"; empty "No destinations match your search."; regional "Regional bundles are on the way — for now, browse by country."

### `related-countries.jsx` / `recently-viewed.client.jsx`
Headings "Continue your trip" / "Recently viewed".

### `app/(marketing)/destinations/page.js`
title "Travel eSIM Plans by Country"; description `Browse prepaid travel eSIM data plans for ${SITE.countryCount} countries. High-speed data at local rates — install by QR, keep your number.`; H1 "Stay online in {SITE.countryCount} countries"; intro "Every supported destination, alphabetical and searchable. Tap a country to see plans, activation rules, and what to expect on arrival."

### Checkout / auth (noindex funnel)
- **checkout-view** — empty "Your cart is empty" / "Choose a destination and a data plan to get started."; H1 "Secure checkout"; badge "Secure SSL"; H2 "Your plan" (+ "Change plan"); H2 "1. Your identity" ("Continue with Google", "Email address", "Guest checkout — we'll email your eSIM QR code."); H2 "Order summary" ("eSIM activation → FREE", "Charged in USD. Prices shown in your currency are indicative.", "Proceed to payment")
- **payment-view** — H1 "Payment"; notice "Demo mode — Stripe's hosted Payment Element is wired to the backend in production. No real payment is taken and no card data is collected here."; button "Complete purchase (demo)"; "Charged in USD · SSL secured"
- **confirmation-view** — H1 "Order confirmed"; INSTALL_STEPS (4); H2 "Your eSIM QR" ("Demo QR — the real activation code is issued by the eSIM provider."); H2 "Install in 4 steps"; "Browse more destinations →"
- **auth-bento** — H1 "Sign in fast" / "Access your eSIMs, orders, and top-ups."; "Continue with Google"; "Sign in"; "Need an account? Create one"; H2 "Prefer not to create an account yet?" / "Check out as a guest — we'll email your QR code and order details."; note "Demo — authentication is handled by the backend once connected."

---

## 3. Standalone pages + nav/footer/legal/chrome

### `content/what-is-esim.json` + `app/(marketing)/what-is-esim/page.js`
- metadata — title "What is an eSIM?"; description "An eSIM is a digital SIM built into your device — buy a data plan online, scan a QR code, and connect abroad without roaming fees or a physical SIM."
- H1 "What is an eSIM?"; intro (embedded-SIM definition); H2 "How an eSIM works"; H2 "eSIM vs physical SIM"; H2 "Why travelers use eSIMs"; H2 "How to install an eSIM" (2–3 min); CTA "Browse travel plans" → /destinations

### `app/(marketing)/how-it-works/page.js`
- metadata — title "How it Works"; description "A travel eSIM installs by scanning a QR code — no physical SIM, no roaming bills. Here's the whole process, step by step."
- H1 "How eSIMFlys works"; intro; 4 steps (Choose your plan / Receive your QR code / Scan & install / Connect on arrival); CTA "Browse destinations"

### `content/devices.json` + `app/(support)/supported-devices/page.js`
- metadata — title "eSIM Compatible Devices"; description "Check whether your iPhone, Samsung Galaxy, or Google Pixel supports eSIM — plus compatible smartwatches, tablets, laptops, routers and cars."
- Checker H1 "Devices that support eSIM."; subtitle; label "Your phone model"; placeholder "e.g. iPhone 15 Pro, Galaxy S24, Pixel 8"; resultYes/resultUnknown; manualCheck "Don't see your device?" (*#06# / EID); H2 "Compatible device categories" (Smartphones/Smartwatches/Tablets/Laptops/Wi-Fi Routers **"eSIM-capable mobile hotspots (varies by model)"**/Cars); image alt "A laptop, smartphone, tablet, smartwatch and Wi-Fi router linked together — devices that support eSIM."

### `content/help.json` + help pages
- Hub metadata — title "Help Center"; description "Guides and answers for installing, activating, and using your eSIMFlys travel eSIM."; H1 "We've got answers"
- 8 category cards (title + description double as category-page meta + intro): Installation / Activation / Devices / Billing & Refunds / Travel & Coverage / Data Usage / Account & Security / Troubleshooting
- Q&As across categories (install iOS/Android/manual; activation/turn-on data; device support/unlock; billing/refund; coverage/regional; usage/top-up; account/password; troubleshooting) — all honest; **Usage answer** "We'll notify you as you approach your plan limit."; category back-link "← Help center"

### `content/glossary.js` + `app/(support)/glossary/page.js`
- metadata — title "eSIM terms, demystified — Glossary"; description "Master the language of global connectivity: APN, eSIM, EID, ICCID, IMEI, roaming, VoLTE and more — clearly defined."
- H1 "eSIM terms, demystified"; intro "Master the language of global connectivity. Everything you need to know about eSIM technology in one place."
- **11 terms** (APN, eSIM, EID, ICCID, IMEI, LTE, MNO, MVNO, Roaming, VPN, VoLTE) — definitions read verbatim like Wikipedia/generic-source leads (file comment: "verbatim from the source design").

### Marketing pages
- **about** — title "About"; desc "eSIMFlys sells prepaid, data-only travel eSIMs so travellers can get online the moment they land."; H1 "About eSIMFlys"; 3 short paragraphs; CTA "Explore destinations"
- **contact** — title "Contact Us"; desc "Get in touch with the eSIMFlys support team about plans, orders, or installation."; H1 "Contact us"; body; form (Email/Message/Send message); success "Thanks — we'll be in touch. (Demo: this form isn't yet connected to a support inbox.)"
- **for-business** — title "eSIMFlys for Business"; desc "Keep your travelling team connected worldwide with travel eSIMs. Talk to us about business plans."; H1 "eSIMFlys for Business"; 2 paragraphs; CTA "Contact our team"
- **affiliates** — title "Affiliates & Partners"; desc "Earn by referring travellers to eSIMFlys…"; H1 "Affiliates & Partners"; 2 paragraphs; CTA "Become a partner"

### Nav / footer / chrome
- `content/nav.json` — header: Home, Destinations, Supported devices, How it works, FAQ. Footer columns: eSIMFlys / Top destinations / Resources / Legal.
- `config/nav.js` (PRIMARY_NAV) + `config/footer.js` (FOOTER, mission "Empowering global citizens…") — **UNUSED / dead config** (header & footer render from nav.json + site.json).
- `footer.jsx` — "{brand} · soon"; "© {year} eSIMFlys. All rights reserved."
- `header.jsx` / `mobile-menu.client.jsx` — "eSIMFlys"; "Sign in"; "Open/Close menu".
- `consent-banner.client.jsx` — "We use an essential cookie to remember your currency. Analytics stays off unless you accept." / "Decline" / "Accept".

### Legal (noindex placeholders)
- `privacy.js` — "Privacy Policy" + intro (remaining clauses: placeholder boilerplate).
- `terms.js` — "Terms & Conditions" + intro. **⚠ Contains an "Always On service" section** describing subscriptions, "Local Phone Number Activation", free always-on data across ~100 named countries, and dated rollouts (4 Nov 2025 / 26 Feb 2026) — reads as copied competitor boilerplate; contradicts the data-only prepaid model.
- `refund.js` — "Refund Policy" + intro (placeholder boilerplate).
- `cookies.js` — "Cookie Policy" + intro (placeholder boilerplate; matches the real essential-currency-cookie behaviour).
