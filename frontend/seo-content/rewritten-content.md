# eSIMFlys — Rewritten Content (original, drop-in ready)

Final original wording for every block marked IMPROVE/REWRITE in `content-analysis.md`, matched to its exact file and field. KEEP blocks are listed at the end of each section (no change needed). **Text-only** — no UI, route, heading-level, or `${...}` token changes. Interpolation variables are preserved exactly.

---

## 1. Homepage + chrome

**`content/home.json` → hero**
- titleLines: `["Instant travel eSIM data.", "60+ countries.", "Online when you land."]`
- highlightLine: `"60+ countries."` *(unchanged — keeps highlight logic)*
- subtitle: `"Choose your destination, compare per-day rates clearly, and land with your data ready to go."`

**`content/home.json` → whereTravelersGo.cta.label:** `"Browse all destinations"`

**`content/home.json` → howItWorks**
- features: `["Plans for 60+ countries", "Instant QR installation", "Main SIM stays active"]`
- steps[0].body: `"Filter by country, then compare data, validity, and cost in seconds. See exactly what's covered and what you'll pay before you commit."`

**`content/home.json` → ctaBand.subtitle:** `"Compare country plans in minutes, activate before your flight, and skip the airport SIM scramble entirely."`

**`content/home.json` → appCta.subtitle:** `"Manage your plans, buy your next one in a tap, and reach support right from your phone. Coming soon for iOS and Android."`

**`content/reviews.json` → title:** `"Reviews from every kind of trip."`
**`content/reviews.json` → items[Hiroko T.].text:** `"Two kids, one ferry with no Wi-Fi, and a lot of 'can I see the map again?'. The data plan kept us navigating and messaging the whole week."`
**`content/reviews.json` → items[Elena M.].text:** `"Grabbed a fresh plan for each stop as I went. Setup was quick every time, so I barely thought about data."`

**`content/quiz.json` → intro.subtitle:** `"Three quick questions about your trip, your data habits, and how long you're away — then we'll narrow our plans down to the ones that actually fit."`
**`content/quiz.json` → option descriptions (4 only):**
- Business trip → `"Email, calls, maps and the odd video meeting"`
- Remote work → `"Daily video calls, big uploads, weeks of use"`
- Family vacation → `"Full days out with maps, photos and streaming"`
- Heavy → `"Video calls, streaming, big uploads"`

**`content/site.json` → ticker:** `["Clear per-day pricing", "Scan a QR, connect on arrival", "Local 4G/5G in 60+ countries", "No roaming fees", "Keep your own number"]`
**`content/site.json` → stats "Average activation" entry:** `{ "label": "Typical setup", "value": "2 min" }` *(or value "2–3 min" for parity with the FAQ / what-is-esim copy)*

**`features/home/components/hero.jsx` → image alt:** `"Circular travel scene — mountains, a city skyline, a beach and a high-speed train framing a smartphone and suitcase, illustrating travel eSIM data on the go."`

**KEEP (home/chrome):** whatIsEsim · whereTravelersGo title+subtitle · howItWorks eyebrow/title/subtitle/cta/steps 2–3 · whyPick · ctaBand title/cta/assurances · reviews header eyebrow/subtitle/note · reviews items (Amara, Leo, Sofia, Diego, Ravi, Owen) · faq (all) · quiz cta/recommendation/DATA_BY_NEED · site tagline/appStores/stats(60+,385,4G-5G) · config/site.js tagline+description · what-is-esim.jsx alts + "Learn more" link · where-travelers-go regional placeholder · app-cta store labels · layout/page metadata · micro-labels.

---

## 2. Catalog + commerce

**`app/(marketing)/esim/[slug]/page.js` → metadata.title:** `` `${country.name} eSIM — Travel Data Plans` ``

**`app/(marketing)/esim/[slug]/page.js` → metadata.description:**
`` `Buy a prepaid travel eSIM for ${country.name}${priceLine}. Fast 4G/5G data on trusted local networks, install by QR code, skip roaming fees, and keep your number.` ``

**`app/(marketing)/esim/[slug]/page.js` → intro paragraph:**
`` `Get online the moment you land in ${country.name} with a data-only travel eSIM. Buy it online, scan one QR code to install, and keep your usual number for calls and texts — no physical SIM and no roaming bills.` ``

**`app/(marketing)/esim/[slug]/page.js` → CONFIDENCE array:**
`["QR code emailed to you instantly", "Data-only — your number stays", "Runs on local 4G/5G networks", "No contracts, no deposits"]`

**`features/catalog/components/country-content.jsx` (interpolation variables preserved exactly):**
- **When to activate:** `` `Install the eSIM while you're still on Wi-Fi at home, then switch it on once you land in ${country.name}. Your allowance doesn't start at checkout — it begins when the eSIM first connects to a local network, so buying a few days ahead costs you nothing.` ``
- **Network partners:** `` `Across ${country.name}, your eSIMFlys data runs on established local networks — ${networks.join(", ")} — and your phone locks onto whichever gives the strongest signal wherever you are.` ``
- **Connection details:** `` `Connections use 4G/5G where the local network offers it${minGb ? \`, with plans from ${minGb} GB up to ${maxGb} GB\` : ""}${maxValidity ? \` and validity of up to ${maxValidity} days\` : ""}. That's plenty for maps, messaging, browsing, and internet-based calls while you travel.` ``
- **Why an eSIM for {country.name}?:** `` `No hunting for an airport SIM kiosk and no shock roaming bill when you get home. Your normal number stays live for calls and texts, your eSIMFlys plan carries the data, and there's no plastic SIM, deposit, or contract to deal with.` ``

**`features/catalog/components/country-faq.jsx` (questions unchanged; answers rewritten; only `${country.name}`):**
- A1: `` `If your phone supports eSIM and isn't carrier-locked, it will work in ${country.name}. Most iPhones from the XS onward, Google Pixel 3 and later, and Samsung Galaxy S20 and newer support eSIM. Dial *#06# and look for an EID number to confirm before you buy.` ``
- A2: `` `Not when you pay. The validity clock starts when you install the eSIM and it first connects to a network in ${country.name}. Install over Wi-Fi before you leave, keep the line switched off, and turn it on when you arrive so none of your days go to waste.` ``
- A3: `` `Yes. The plan is data-only, so it sits alongside your usual SIM: your home number keeps handling calls and texts while the eSIM carries data in ${country.name}. Switch off data roaming on your primary line to avoid charges from your home carrier.` ``
- A4: `` `You can buy another ${country.name} plan whenever you run low — no need to wait for your current one to expire. Some plans also support top-ups; if yours does, you can add data to the eSIM you've already installed instead of setting one up again.` ``

**`app/(marketing)/destinations/page.js` → metadata.description:**
`` `Browse prepaid travel eSIM data plans for ${SITE.countryCount} countries. Fast 4G/5G data at local rates, install by scanning a QR code, skip roaming, keep your number.` ``

**KEEP (catalog/commerce):** esim/[slug] H1 + empty state · plan-selector (all) · destinations-browser (all) · related/recently-viewed headings · destinations title + H1 + intro · checkout/payment/confirmation (all) · auth-bento (all).

---

## 3. Standalone pages + nav/footer/legal

**`app/(marketing)/how-it-works/page.js` → metadata.description:**
`"Set up a travel eSIM in minutes: choose a plan, get a QR code by email, scan to install, then connect on arrival — no physical SIM, no roaming bills."`

**`content/devices.json` → Wi-Fi Routers example:** `"eSIM-capable travel routers (availability varies by model)"`

**`app/(support)/help/page.js` → metadata.description:**
`"Clear answers for your travel eSIM: installing, activating, device support, billing, coverage, data usage, and troubleshooting — all in one help center."`

**`content/help.json` → Usage "How do I track my data?" answer (optional, if limit alerts aren't guaranteed):**
`"Once you're connected, check remaining data from your account dashboard. Where a plan supports it, we'll flag when you're getting close to your limit."`

**`content/glossary.js` → definitions (replace `definition` strings only; keep id/term/letter/badge/seeAlso):**
- apn: `"Access Point Name. The setting that tells your device how to reach a mobile-data network. Travel eSIMs normally configure it for you, so you rarely need to change it."`
- esim: `"Embedded SIM. A SIM built into your device as software rather than a plastic card. You add a plan by downloading a profile, so there's nothing to insert or swap."`
- eid: `"Embedded Identifier. The permanent serial number of the eSIM chip inside your device. Dial *#06#, and if an EID appears your device can use an eSIM."`
- iccid: `"Integrated Circuit Card Identifier. The unique ID of a single SIM profile — physical or eSIM — that tells the network which plan is installed on your device."`
- imei: `"International Mobile Equipment Identity. A unique number that identifies your phone itself, separate from any SIM. Dial *#06# to see it."`
- lte: `"Long-Term Evolution. The technical name for 4G mobile data — the fast, widely available standard most travel eSIMs use for browsing, maps, and streaming."`
- mno: `"Mobile Network Operator. A company that owns the towers and radio network in a country. Your travel eSIM connects through these local operators abroad."`
- mvno: `"Mobile Virtual Network Operator. A mobile brand that sells service without owning towers, renting capacity from an operator instead. Many eSIM providers work this way."`
- roaming: `"Using a network other than your home carrier's while you travel. A travel eSIM gives you local data directly, so you skip your home carrier's roaming charges."`
- vpn: `"Virtual Private Network. A tool that encrypts your connection and hides your location, adding privacy on public Wi-Fi and mobile data while you're away."`
- volte: `"Voice over LTE. A way to place calls over a 4G network instead of older voice channels, giving clearer audio and quicker connections where it's supported."`

**`app/(support)/glossary/page.js` → intro:** `"Traveling with an eSIM comes with a handful of acronyms. Here's a plain-English glossary of the eSIM and mobile-data terms you'll actually run into."`
**`app/(support)/glossary/page.js` → metadata.description:** `"A plain-English guide to eSIM and mobile-data terms — APN, EID, ICCID, IMEI, LTE, MNO, MVNO, roaming, VoLTE and VPN — defined clearly for travelers."`

**`app/(marketing)/about/page.js` → body (keep H1 + `{SITE.countryCount}` token):**
- P1: `"eSIMFlys is a travel-connectivity store. We sell prepaid, data-only eSIM plans that get you online the moment you land — with no physical SIM to collect, no roaming bills, and no need to change your everyday number."`
- P2: `` `Choose a destination from ${SITE.countryCount} countries, pick a plan by data amount and validity, and get your eSIM QR code by email — ready to install in minutes.` ``
- P3: `"Prices are shown per plan in US dollars, with your local currency for reference, so you know the cost before you buy. Check out as a guest, or create an account to re-download your eSIMs and reorder faster."`
- P4: `"Our goal is simple: make staying connected abroad fast, transparent, and fairly priced."`

**`app/(marketing)/about/page.js` → metadata.description:** `"eSIMFlys sells prepaid, data-only travel eSIMs for 60+ countries. Get online the moment you land — no physical SIM, no roaming bills, keep your number."`

**`app/(marketing)/contact/page.js` → metadata.description:** `"Questions about a plan, an order, or installing your eSIM? Contact the eSIMFlys support team and we'll help you get connected before and during your trip."`

**`app/(marketing)/for-business/page.js` → body:**
- P1: `"Keep your travelling team connected across the 60+ countries we cover. Business travel eSIMs mean no surprise roaming bills, no chasing local SIM cards, and one simple way to manage data on the road."`
- P2: `"We're building tools for teams — bulk ordering, consolidated invoicing, and shared management. Get in touch and tell us what your business needs."`

**`app/(marketing)/for-business/page.js` → metadata.title:** `"eSIM Plans for Business"`
**`app/(marketing)/for-business/page.js` → metadata.description:** `"Keep your travelling team connected across 60+ countries with prepaid travel eSIMs and no roaming surprises. Ask eSIMFlys about plans for your business."`

**`app/(marketing)/affiliates/page.js` → body:**
- P1: `"Travel creators, agencies, and communities can earn by referring travelers to eSIMFlys. If your audience travels, mobile data is something they need on every trip."`
- P2: `"Our partner program is being finalised. Reach out and we'll share how it works and how you can join."`

**`app/(marketing)/affiliates/page.js` → metadata.description:** `"Partner with eSIMFlys and earn by referring travelers to prepaid travel eSIMs. Built for creators, travel agencies, and communities always on the move."`

**KEEP (standalone/chrome):** what-is-esim body+metadata · how-it-works body · supported-devices body+metadata · help hub/categories/Q&As (except optional Usage hedge) · glossary H1 · contact body+form · nav.json/site.js/footer/header/mobile-menu/consent-banner (chrome micro-labels) · config/nav.js + footer.js (dead, unused) · legal privacy/refund/cookies (placeholder boilerplate).

**⚠ LEGAL — do NOT auto-rewrite:** `content/legal/terms.js` "Always On service" section (subscriptions / local-phone-number SMS / free always-on data across ~100 countries / dated rollouts) contradicts the data-only prepaid model and reads as copied. **Remove or replace via legal counsel.** No replacement legal text authored here (out of scope — don't invent legal terms).
