# Image Analysis & UI-Suitability Report — `esim/images/`

**Scope:** every file in `/Users/macbookpro/Desktop/code-red/esim/images/` (10 files).
**Method:** dimensions/format/alpha via `sips`; byte-identity via `md5`; visual content by direct image inspection. Every conclusion below is grounded in one of those three evidence sources.
**Brand baseline used for "fit" judgements** (from the live eSIMFlys codebase): primary indigo `#615de5`, CTA electric-blue `#3535ff`, highlight lime `#c6f135`, red `#e40014`, on white/neutral surfaces; type Oswald (uppercase) + Poppins; clean flat/3D-modern style. **Yellow and teal are NOT in the current palette** — this is the single biggest recurring caveat below.

---

## 1. Complete inventory (evidence: `sips` + `md5`)

| ID | File name | W×H (px) | Aspect | Format | Alpha | Size | Unique? |
|----|-----------|----------|--------|--------|-------|------|---------|
| IMG-01 | `ChatGPT Image Jul 19, 2026, 11_06_16 PM.png` | 1641×958 | ~1.71 (≈16:9) | PNG | No | 1.4 MB | **Dup** (= IMG-02) |
| IMG-02 | `ChatGPT Image Jul 20, 2026, 06_42_00 PM.png` | 1641×958 | ~1.71 | PNG | No | 1.4 MB | **Exact duplicate of IMG-01** (md5 `563a333e…`) |
| IMG-03 | `ChatGPT Image Jul 20, 2026, 06_42_07 PM.png` | 1835×857 | ~2.14 (ultrawide) | PNG | No | 1.2 MB | Yes |
| IMG-04 | `ChatGPT Image Jul 20, 2026, 06_42_22 PM.png` | 1024×1536 | 0.67 (2:3 portrait) | PNG | **Yes** | 2.2 MB | Yes |
| IMG-05 | `ChatGPT Image Jul 20, 2026, 06_42_26 PM.png` | 1729×910 | ~1.90 | PNG | No | 1.9 MB | Yes |
| IMG-06 | `ChatGPT Image Jul 20, 2026, 06_42_32 PM.png` | 1672×941 | ~1.78 (16:9) | PNG | No | 2.4 MB | Yes |
| IMG-07 | `ChatGPT Image Jul 20, 2026, 06_42_43 PM.png` | 1536×1024 | 1.50 (3:2) | PNG | No | 2.6 MB | Yes |
| IMG-08 | `ChatGPT Image Jul 20, 2026, 06_42_46 PM.png` | 1672×941 | ~1.78 (16:9) | PNG | No | 2.1 MB | Yes |
| IMG-09 | `ChatGPT Image Jul 20, 2026, 06_42_56 PM.png` | 1672×941 | ~1.78 (16:9) | PNG | No | 2.1 MB | Yes (variant of IMG-08 theme) |
| IMG-10 | `ChatGPT Image Jul 20, 2026, 06_43_08 PM.png` | 1770×888 | ~1.99 (≈2:1) | PNG | No | 1.3 MB | Yes |

**Totals:** 10 files · **9 unique** (1 exact-duplicate pair) · all PNG · all AI-generated (filenames "ChatGPT Image …") · all large (1.2–2.6 MB) · all high-resolution and crisp.

---

## 2. Detailed per-image analysis

### IMG-01 — Circular travel illustration (hero-style)
- **Content:** Paper-craft/3D circular scene on the right; inside it a city skyline, snow-capped mountain, high-speed train, beach + sailboat, palm trees, green hills, tunnel; foreground a blank-screen smartphone, yellow suitcase, a **blue+yellow paper airplane** (mirrors the eSIMFlys logo mark), a Wi-Fi glyph. Large light-lavender/white empty area on the **left**.
- **Colors:** blue, yellow, teal, green on near-white. **Style:** clean modern 3D/paper-craft. **Quality:** high, crisp, no artifacts.
- **Purpose:** homepage hero (illustration-right / text-left layout).
- **Defects/limits:** yellow accents are off the current lime palette; **exact duplicate exists (IMG-02)**; heavy PNG.

### IMG-02 — EXACT DUPLICATE of IMG-01
- Byte-identical to IMG-01 (`md5 563a333e2d51b85e91128fcb7d929a0b`). No independent value. **Redundant asset.**

### IMG-03 — "How it works" horizontal flow
- **Content:** left-to-right process on light-lavender bg: (1) suitcase + white cards + location pin + phone (choose a plan); (2) phone with QR-scan frame + envelope (buy / scan QR / emailed); (3) airplane taking off + city + phone with Wi-Fi (connect abroad). A blue dotted "journey" line with yellow dots links the three.
- **Colors:** blue + yellow accents on near-white. **Style:** clean 3D. **Quality:** high. Ultrawide (2.14) with generous top whitespace.
- **Purpose:** a purpose-built **3-step / "How it works" banner** — maps 1:1 to the site's 01/02/03 section.
- **Limits:** very wide (crops awkwardly to square/portrait); yellow dots off-palette.

### IMG-04 — Portrait phone-orbit (dark background)
- **Content:** central glowing-blue-screen phone encircled by a blue+yellow paper-plane arrow; yellow suitcase, white earbuds, yellow+white camera, red location pin. Portrait 2:3.
- **Colors:** blue + yellow subject over a **dark olive-brown gradient background**. Has an alpha channel, but the visible background is a dark baked gradient with the subject's glow bleeding into it (not a clean cut-out).
- **Quality:** subject render is high; **the dark muddy background is the problem.** **Purpose:** at best a mobile/app splash or dark-section decorative element.
- **Defects/limits:** background clashes hard with the white/indigo light-theme brand; portrait orientation is poor for web heroes/banners; the glow makes clean background removal difficult. **Weakest of the set for this UI.**

### IMG-05 — Teal circular travel ecosystem (with SIM card)
- **Content:** phone at centre; an elliptical blue "road" loops around it carrying an airplane, high-speed train, city buildings, mountains + pines, a ferry, a palm-tree island, a yellow suitcase, a **gold SIM-card chip**, and a yellow paper-plane arrow.
- **Colors:** **teal/cyan background**, blue road, yellow accents. **Style:** 3D. **Quality:** high. Some upper-left negative space.
- **Purpose:** feature/ecosystem or coverage banner; secondary hero. Strong eSIM signal (visible SIM card).
- **Limits:** teal background is off-brand; composition fairly centre-weighted (less clean text space than IMG-06).

### IMG-06 — Teal flat-lay (with SIM card, left negative space)
- **Content:** flat-lay on **teal** — phone (blue screen), **gold SIM chip**, white earbuds, yellow camera, yellow suitcase, yellow alarm clock, white airplane, blue+yellow paper planes with dotted paths. Objects grouped on the **right**; large empty teal on the **left**.
- **Colors:** teal + yellow + blue. **Style:** 3D flat-lay. **Quality:** high. Excellent left negative space for text.
- **Purpose:** hero (text-left) or CTA/feature banner. Strong eSIM signal.
- **Limits:** teal background off-brand; heavy PNG (2.4 MB).

### IMG-07 — Cream watercolor flat-lay (editorial)
- **Content:** watercolor eucalyptus/foliage + coral berries in the corners; blue+yellow vintage camera, cream paper plane, phone (mint screen), small blue globe, sketched compass rose, seashell. Large **cream** empty area on the **left**.
- **Colors:** cream, sage green, muted blue, yellow. **Style:** soft watercolor + realistic objects — **vintage/boho editorial**. **Quality:** high, artistic.
- **Purpose:** blog/article header or a soft editorial background; light cream bg fits a light theme.
- **Limits:** **style clashes** with the bold modern Oswald/3D brand — no SIM/eSIM cue; best kept to editorial/blog contexts, not the main brand hero.

### IMG-08 — Royal-blue isometric multi-device (with SIM cards)
- **Content:** isometric scene on **royal blue** — three phones in a dock, a laptop, **three gold SIM-card chips**, headphones, two luggage tags (white + yellow), a train, an airplane, joined by thin connector lines.
- **Colors:** royal blue bg, white/silver devices, yellow accents. **Style:** clean isometric 3D. **Quality:** high.
- **Purpose:** **Supported-Devices page hero / "works on all your devices" feature.** Royal blue is the closest of any image to the electric-blue/indigo brand.
- **Limits:** composition is fairly full (less blank space than IMG-09); yellow accents slightly off-palette. **One of the two strongest, best on-brand.**

### IMG-09 — Royal-blue isometric multi-device (variant)
- **Content:** same concept/style/background as IMG-08 (phones in a dock, laptop, **SIM chips**, headphones, tags, train, plane, connectors) with a **different arrangement and more empty royal-blue space on the right**.
- **Colors/style/quality:** as IMG-08. **Purpose:** Supported-Devices hero, or a homepage "multi-device" band with **text overlaid on the right negative space**.
- **Limits:** thematically redundant with IMG-08 — **use one, not both**, to avoid repetition. Slightly better for text overlay than IMG-08.

### IMG-10 — Teal + yellow travel flat-lay (no phone/SIM)
- **Content:** monochromatic-yellow travel objects on the **left** — suitcase, sunglasses, camera, model airplane, alarm clock, straw hat, and a **passport + flight ticket bearing readable text "PASSPORT" / "FLIGHT TICKET"**. Large empty **teal** on the **right**.
- **Colors:** teal + yellow (complementary). **Style:** 3D flat-lay. **Quality:** high; good right-side text space; ~2:1 banner.
- **Purpose:** wide CTA band, blog header, generic travel banner.
- **Defects/limits:** **no phone and no SIM/eSIM element** (generic travel, not eSIM-specific); teal+yellow off-brand; **embedded English text** on the passport/ticket limits localisation and re-cropping.

---

## 3. UI-suitability decisions, placement, modifications & alt text

| ID | Decision | Best UI location | Required modifications | Suggested alt text |
|----|----------|------------------|------------------------|--------------------|
| **IMG-01** | **Suitable — with mods** | Homepage **hero** (illustration right / text left) or "What is an eSIM" | Convert PNG→**WebP/AVIF** + compress (<200 KB); recolor yellow→lime/indigo to match brand (optional); provide 2× + mobile crop | "Illustration of a smartphone, suitcase and paper plane over travel scenes — city, mountains, beach and a high-speed train — representing worldwide travel-eSIM connectivity." |
| **IMG-02** | **Unsuitable** | — (delete) | Remove: byte-identical duplicate of IMG-01 | *(n/a — do not ship)* |
| **IMG-03** | **Suitable — with mods** | **"How it works" section banner** (01/02/03) | WebP/AVIF + compress; recolor yellow dots; if used elsewhere, crop the 2.14 ultrawide | "Three-step travel-eSIM flow: choose a plan on your phone, scan the QR code to install, then connect on arrival abroad." |
| **IMG-04** | **Suitable — with heavy mods** *(borderline unsuitable)* | Mobile/app splash or a **dark-section** decorative element only | Replace/remove the dark olive-brown background (hard — glow bleeds); or place only on a dark band; recolor; compress | "Smartphone encircled by a paper-plane arrow with a suitcase, camera and earbuds — travel-eSIM concept." |
| **IMG-05** | **Suitable — with mods** | Feature/**coverage** banner or secondary hero | Recolor teal bg→white/indigo (or use on an intentionally teal band); compress; note SIM-card = good eSIM cue | "Smartphone at the centre of a travel loop with an eSIM card, airplane, train, ferry, city and mountains — global eSIM coverage." |
| **IMG-06** | **Suitable — with mods** | **Hero** (text-left) or CTA/feature banner | Recolor teal bg to brand (or teal band); compress (2.4 MB→<250 KB WebP) | "Flat-lay of a smartphone, eSIM card, camera, suitcase and airplane on a teal background — travel-eSIM essentials." |
| **IMG-07** | **Suitable — with mods** *(style-limited)* | **Blog / article header** or soft editorial background | Use only where a soft editorial tone fits (not the main modern hero); WebP + compress | "Watercolor travel flat-lay with eucalyptus leaves, a vintage camera, a smartphone, a globe and a compass rose." |
| **IMG-08** | **Suitable** *(minor mods)* | **Supported-Devices page hero** / "works on all your devices" | WebP/AVIF + compress; optional yellow→lime; white text overlays legibly on royal blue | "Isometric illustration of smartphones, a laptop and eSIM cards linked together with a train and airplane — devices supported by eSIM." |
| **IMG-09** | **Suitable** *(minor mods)* | **Supported-Devices hero** or homepage **multi-device band** (text over right space) | Same as IMG-08; **choose IMG-08 OR IMG-09, not both** | "Isometric illustration of smartphones, a laptop and eSIM cards connected to a train and airplane, with space for a headline — multi-device eSIM support." |
| **IMG-10** | **Suitable — with mods** | Wide **CTA band** ("Leave home planned") or blog/travel banner | Recolor teal+yellow to brand; **watch the embedded "PASSPORT/FLIGHT TICKET" text** (limits re-crop/localisation); compress | "Yellow travel accessories — suitcase, camera, sunglasses, passport, flight ticket and a model airplane — on a teal background." |

**Accessibility note (applies to all):** every image is decorative/illustrative, not informational. When an image sits **behind or beside real text**, prefer the descriptive alt above; when it is **purely decorative** and its meaning is already in adjacent DOM text, an empty `alt=""` is acceptable to avoid screen-reader noise. None contains information that is *only* conveyed by the image, so no image is load-bearing for accessibility.

---

## 4. Cross-cutting findings (evidence-based)

1. **All are large scenic illustrations — none are icons, logos, buttons, or small UI assets.** They fit hero / banner / section / background / card-media / decorative roles only. They cannot serve icon/button/favicon needs.
2. **Format & weight:** 100% PNG at 1.2–2.6 MB. **Every image needs conversion to WebP/AVIF + compression** (target <200–300 KB, plus responsive `srcset`) before UI use — mandatory for the site's performance goals (LCP ≤2.5 s / Lighthouse Perf ≥95). This is the one modification common to *all*.
3. **Palette fit is the dominant caveat.** Most images lean **yellow and/or teal**, which are **not** in the current indigo/electric-blue/lime brand. Closest to brand: **IMG-08/09** (royal blue). Off-brand backgrounds: IMG-05/06/10 (teal), IMG-04 (dark olive), IMG-07 (cream/watercolor). Recolor or brand-accommodation is needed for most.
4. **Duplication:** IMG-01 = IMG-02 exactly (md5). Ship one; delete the other. IMG-08 ≈ IMG-09 thematically — ship one.
5. **No usable transparency.** Only IMG-04 has an alpha channel, and it is a dark baked background rather than a clean cut-out. None are drop-in transparent assets.
6. **eSIM specificity:** a visible SIM-card chip appears in **IMG-05, 06, 08, 09** (strongest eSIM storytelling). A phone appears in all except IMG-10. **IMG-10 has neither** (generic travel).
7. **Embedded text:** only **IMG-10** ("PASSPORT" / "FLIGHT TICKET") — a minor localisation/re-crop limitation.
8. **Technical quality is uniformly high** — all sharp, well-composed, professional AI renders with no visible compression artifacts, banding, or distortion.

---

## 5. Final summary — strongest images for the UI

**Tier A — ship first (highest value, best fit):**
- **IMG-08** (or **IMG-09**) — royal-blue isometric multi-device + SIM cards → **Supported-Devices hero / "works on all your devices."** Best brand-fit (royal blue ≈ electric-blue) and the clearest eSIM+devices story. *Pick one of the pair.*
- **IMG-01** — circular travel illustration with left negative space → **homepage hero.** Best hero composition; its blue+yellow paper plane even echoes the eSIMFlys logo mark. (Recolor + compress.)
- **IMG-03** — three-step flow → **"How it works" section banner.** Purpose-built for the 01/02/03 section.

**Tier B — good with recolor/compression:**
- **IMG-06** — teal flat-lay + SIM, strong left text space → hero/CTA.
- **IMG-05** — teal ecosystem + SIM → coverage/feature banner.
- **IMG-10** — wide yellow/teal travel flat-lay → CTA band / blog (note: no eSIM cue, embedded text).

**Tier C — niche / conditional:**
- **IMG-07** — watercolor editorial → blog/article header only (style off-brand for the main site).
- **IMG-04** — portrait, dark background → dark-section/app-splash only, after heavy background work.

**Do not ship:**
- **IMG-02** — exact duplicate of IMG-01 (delete).

**One-line recommendation:** adopt **IMG-08/09 (devices), IMG-01 (hero), IMG-03 (how-it-works)** as the core set; convert all to WebP/AVIF and reconcile the yellow/teal accents with the indigo-lime brand (or consciously extend the palette); drop IMG-02; treat IMG-04, IMG-07, IMG-10 as situational.

---
*Report generated by inspecting each file directly (visual render), with dimensions/format/alpha from `sips` and duplicate detection from `md5`. No conclusion here relies on the filename or on assumptions beyond the observed pixels and metadata.*
