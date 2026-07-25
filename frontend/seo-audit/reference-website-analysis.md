# Reference Website Analysis — esim70.com

**Purpose:** understand esim70.com's SEO structure and content strategy (NOT to copy its wording). Findings are used only to benchmark our frontend.
**Method:** (1) the verified teardown in `../../how_reference_platfrom_build.md` (live DOM/computed-style inspection, compiled 2026-07-18); (2) fresh live technical-SEO extraction of the homepage and `/esim/japan` via the in-app browser (this session), reading `<head>` tags and JSON-LD directly from the DOM.
**Not verified (would need SEO tooling — Search Console / Ahrefs / live SERP):** their actual Google indexation, rankings, backlink profile, domain authority, or traffic. On-page/technical values below are DOM-verified; ranking outcomes are **not** claimed.

*esim70's extracted tag values are quoted below strictly as technical evidence being analyzed — they are their property and must not be reused in our product.*

---

## 1. Positioning & IA
- **What:** direct-to-consumer, prepaid, data-only travel-eSIM storefront. Marketing figure "150+ countries" (≈165 destinations live). Per-day price framing ("from $1.36/day") with savings framing (strikethrough + "Save $X"). Companion iOS/Android app.
- **Stack (inferred, high confidence):** Next.js App Router + Tailwind v4 + shadcn/ui + Oswald/Poppins; Microsoft Clarity analytics; consent modal.
- **URL structure (shallow, ≤3 clicks to a plan):**
  - `/` · `/destinations` · `/esim/[country]` · `/esim/[region]` (regional bundles share the namespace, e.g. `/esim/asia`) · `/supported-devices` · `/what-is-esim` · `/glossary` · `/blog` · `/about` · `/contact` · `/help` · `/auth` · `/account/esims` · `/terms` (+ `/terms#refunds`) · `/privacy`.
  - Homepage in-page anchors: `/#how-it-works`, `/#faq`, `/#testimonials`.
- **Nav (header):** Home · Destinations · Supported devices · How it works (`/#how-it-works`) · FAQ (`/#faq`) · language/region selector (also switches currency) · Sign in.
- **Footer IA (4 columns):** About (About Us, Browse Plans, Reviews, Contact, Help center, How It Works, Sign in) · Top destinations (Japan, Thailand, US, UAE, UK, France, Turkey, All) · Resources (What is an eSIM, Supported Devices, Blog, Glossary, FAQ, My eSIMs) · Legal (Terms, Privacy, Refund).

## 2. Homepage content strategy (funnel order)
Hero → red trust ticker (marquee) → "What is an eSIM?" (educate) → "Where travelers go" (compare, Country/Regional tabs, per-day + savings badges POPULAR/TRENDING/BEST VALUE) → "Find your perfect plan" (3-step quiz) → "How it works" (01/02/03) → "Why travelers pick" (5 benefit cards) → "Real reviews from real trips." (real 4.3★/109 Google Play, named + "Verified" testimonials) → CTA band → FAQ accordion (7 Q&As) → app promo → footer. Each band answers the next likely question; strong internal linking to country pages throughout.

## 3. Country page = the SEO backbone (`/esim/japan` inspected)
- **H1:** "eSIM for Japan"; live local-time widget; "Choose your plan" grid (real tiers: 1/3/5/10/15/20/30 GB + Unlimited 7/15/30-day); sticky purchase panel ("network partner", transparent total, instant-QR confidence bullets).
- **Unique per-country editorial (the differentiator):** When to activate · Network partners · Connection details · Country context · "Why eSIM here, not a local SIM" · "From order to online in 4 steps" · **country-specific FAQ** ("Common questions about Japan") · "Continue your trip" (related). This is genuinely unique content per destination, not a swapped-name template.

## 4. Technical SEO layer (DOM-verified this session)

**Homepage `/`:**
| Element | Value |
|---|---|
| `<title>` | `Travel eSIM Plans for 150+ Countries \| Esim70` (45 chars) |
| meta description | `Buy an international travel eSIM for 150+ countries from $1.36/day. Instant QR activation, fast data, no roaming fees, keep your number.` (136 chars) |
| canonical | `https://www.esim70.com/` (self) |
| robots | `index, follow` |
| Open Graph | og:title, og:description, og:type=website, og:image (`/og/esim70-card.jpg`), og:url — full set |
| Twitter | `summary_large_image` |
| **hreflang** | **10+ locales** (en-US, fr-FR, cs-CZ, de-DE, es-ES, es-419, it-IT, ja-JP, ko-KR, lt-LT, …) |
| JSON-LD | **Organization, WebSite (SearchAction), FAQPage ×2** |
| H1 | one hero H1 (present twice in DOM — a responsive desktop/mobile duplicate) |

**Country `/esim/japan`:**
| Element | Value |
|---|---|
| `<title>` | `Japan eSIM - Prepaid Travel Data Plans \| Esim70` (47 chars) — **leads with the country + "eSIM"** |
| meta description | `Buy a Japan travel eSIM with instant activation and no roaming fees. Compare Japan data plans by data, validity, and price.` (123 chars) |
| canonical | `https://www.esim70.com/esim/japan` (self) |
| robots | **`index, follow`** (country pages are indexed) |
| **hreflang** | **17 alternates** |
| JSON-LD | **Organization + WebSite + BreadcrumbList + Product(with `offers`) + FAQPage** |

## 5. SEO patterns worth benchmarking against
1. **Content-rich programmatic country pages** — unique editorial per destination is why esim70 can index 165 country URLs without scaled/thin-content exposure. This is their organic moat.
2. **Full internationalization** — hreflang across 10–17 locales multiplies their addressable search demand (travelers search "eSIM Japon", "eSIM 日本", etc.).
3. **Honest, specific trust** — real Google-Play rating + named "Verified" reviews (not fabricated).
4. **Rich structured data** — Organization + WebSite + Breadcrumb + Product(offers) + FAQPage, mirroring visible content.
5. **Keyword-led titles** — homepage leads with the keyword phrase, not the brand; country titles lead with "[Country] eSIM".
6. **Savings/per-day comparison model** — per-day price + strikethrough + "Save $X" on every card (backed by real list prices on their side).
7. **Content marketing** — a `/blog` for top-of-funnel guides.
8. **Regional bundle pages** — `/esim/[region]` broadens keyword coverage with descriptive intros.

## 6. Things esim70 does that we deliberately do NOT (and why that's defensible)
- **FAQPage schema** — Google deprecated FAQ rich results for most non-authoritative sites (Aug 2023), so esim70's FAQPage markup likely yields no rich result for a commercial eSIM page; low upside, low risk. Our omission is defensible; adding it (mirroring visible FAQ) would be low-risk parity, not a ranking lever.
- **"Hotspot ready" / savings claims** — esim70 states these; we removed hotspot claims (our supplier data = "Unknown") and savings (we have no verified list prices). Our honesty stance is the safer choice given our data.
- **AggregateRating/Review schema** — appropriate only with real reviews; esim70 has them, we don't yet.

*Nothing above is to be copied. Structure and strategy only.*
