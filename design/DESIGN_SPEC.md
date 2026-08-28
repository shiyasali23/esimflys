# DESIGN_SPEC.md — Phase 2 Reference Forensics

Source: the CONSULT hiring dashboard reference. Values are read off the image at its
native ~2000px width and normalised to a 1440px working canvas (÷1.39).

## 1. Colour roles

Sampled from the reference, then reconciled against this product's existing palette.

| Role | Reference | Adopted for admin | Note |
|---|---|---|---|
| App background | `#FFFFFF` | `#F7F8FA` | Reference floats white cards on white; a faint ground makes hairline cards read without shadow spam |
| Surface | `#FFFFFF` | `#FFFFFF` | |
| Surface raised | `#FFFFFF` + soft shadow | `#FFFFFF` + `0 1px 2px rgba(16,24,40,.04)` | Reference elevation is very low-contrast |
| Border | `#EEF0F5` | `#E8EAF0` | |
| Border subtle | `#F4F5F8` | `#F1F2F6` | Table dividers |
| Text primary | `#1A1A2E` | `#111827` | |
| Text secondary | `#5B6178` | `#4B5563` | |
| Text muted | `#8B8FA3` | `#5B6472` | Labels, captions — see §10 |
| **Accent** | `#5B4DD3` (indigo-violet) | **`#4F46E5`** | See §1.1 |
| Accent ink | — | `#4338CA` | Text-on-white variant, ≥4.5:1 |
| Info | `#67E8F9` (cyan) | `#0E7490` ink / `#ECFEFF` fill | |
| Success | — | `#047857` ink / `#ECFDF5` fill | Reused from existing `--color-success-text` |
| Warning | `#FCBB00`-family | `#B45309` ink / `#FFFBEB` fill | |
| Danger | `#F87A5E` (coral) | `#B91C1C` ink / `#FEF2F2` fill | Reference coral is a *chart* colour, not a danger state — see relevance table |

### 1.1 — The accent is scoped, not global. This is load-bearing.

`globals.css @theme` is shared with the customer storefront. `--color-primary` is
`#2563eb` and drives every customer CTA. Changing it globally would restyle checkout,
which violates §1 and R6.

**Therefore all admin tokens live in a scoped layer** — `[data-surface="admin"]` on the
admin/agency shell root — redefining only within that subtree. The customer tree is
untouched by construction, not by discipline.

**Ambiguity flagged (§6):** the reference is indigo-violet; this product is blue. I read
"rebrand" as adopting the reference's *language*, and propose indigo `#4F46E5` for admin
only, keeping storefront blue. If you want admin to stay blue, that is a one-token change
and nothing else in this spec moves. **Confirm before Phase 4.**

## 2. Type scale

Reference uses a geometric sans (Poppins/Gilroy family). This repo ships **Inter + Inter
Tight**, self-hosted variable, chosen deliberately for tabular figures and a
disambiguated `1/l/I`, `0/O` — which an ICCID/order-number panel needs more than it needs
geometric warmth. **Keep Inter.** Adopt the reference's *scale and weight relationships*.

| Step | Size / line-height | Weight | Tracking | Role |
|---|---|---|---|---|
| `admin-page-title` | 20 / 28 | 600 | -0.01em | Top-bar page title |
| `admin-section` | 15 / 22 | 600 | 0 | Card + section headings |
| `admin-kpi` | 28 / 34 | 650 | -0.02em | KPI value (reference: 1,436 / 424) |
| `admin-body` | 14 / 20 | 400 | 0 | Table cells, body |
| `admin-label` | 13 / 18 | 500 | 0 | Form labels, secondary cell text |
| `admin-caps` | 11 / 14 | 600 | 0.06em | Table headers, eyebrows |

Reference table headers are small, spaced, muted — reproduced by `admin-caps`.

## 3. Spacing

Base unit **4px**. Ladder: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`.

Measured from the reference (normalised): card inner padding ≈20px; gap between KPI
cards ≈16px; sidebar item height ≈44px; sidebar horizontal inset ≈16px; section vertical
rhythm ≈24px; table cell padding ≈12px×16px.

## 4. Radius, border, elevation

| | Reference | Adopted |
|---|---|---|
| Cards | ~18–22px | **12px** |
| Large feature card | ~24px | 12px |
| Buttons / inputs | ~10px | **8px** |
| Pills / badges | full | full |
| Border | 1px hairline | 1px `border` |
| Elevation | single soft ambient shadow | `0 1px 2px rgba(16,24,40,.04)`, one level only |

**Deviation stated:** the reference's 18–22px radius reads friendly at its low density.
At operational density it wastes corner space and softens a data table into a toy.
12px keeps the reference's rounded character while holding a grid.

## 5. Component anatomy

**Sidebar** — 240px expanded / 64px collapsed. Surface white, 1px right border. Logo
block 56px. Item: 44px tall, 8px radius, 16px inset, 18px icon + 14px label, 10px gap.
Active: accent-tinted fill + accent ink + 2px left accent bar. Hover: `#F7F8FA`. Group
divider + 11px caps group label, mirroring the reference's Settings/Notifications split.

**Top bar** — 48px max (R2). Page title left, contextual actions right. No global search
duplication (a Search page already exists — see relevance table).

**KPI card** — 20px padding, 12px radius, hairline border. Icon in a 40px tinted circle
(reference uses 48px; reduced for density), value at `admin-kpi`, label at `admin-label`
muted beneath. Reference stacks icon-left / value-right; adopted.

**Data table** — header 32px, `admin-caps`, muted, `#F7F8FA` fill, sticky. Rows 40px
(from 65px), 12px×16px cell padding, 1px subtle divider, no zebra (reference uses
dividers). Numerics right-aligned + tabular figures. Hover row tint.

**Pagination bar** — 44px, below table: range indicator left; page-size select, page
controls right.

## 6. Layout grid

```
┌────────┬──────────────────────────────────────────┐
│ 240px  │ top bar 48px                             │
│ side   ├──────────────────────────────────────────┤
│ bar    │ content — fluid, 20px gutters, 16px gap  │
└────────┴──────────────────────────────────────────┘
```

Breakpoints: `<1024px` sidebar collapses to a drawer; `≥1536px` content caps at 1600px
to stop table rows becoming unreadably wide.

**Ambiguity flagged (§6):** acceptance says "content region ≥90% of viewport width", but
a persistent 240px sidebar makes that arithmetically impossible at 1440 (max 83%). I read
it as **≥90% of the width available to content after the sidebar** — at 1440 that is
1200 available, 1160 used = **96.7%**. Confirm this reading.

## 7. Information hierarchy

The reference puts one hero metric, two secondary metrics, a trend, a work list, and a
right rail above the fold — five information types, no scrolling, achieved by *small
type with generous internal padding* rather than large type. That is the transferable
idea: compress the type, keep the air inside components.

## 8. Relevance table

| Reference element | Verdict | Reasoning |
|---|---|---|
| Left sidebar, icon+label, grouped | **ADOPT** | Directly satisfies R2 |
| Logo block top of sidebar | **ADOPT** | |
| Collapsed/secondary nav group | **ADOPT** | Maps to Operations/Webhooks/Audit |
| KPI card anatomy | **ADOPT** | Maps to existing dashboard tiles |
| Hero stat card (big, accent-filled) | **ADAPT** | Becomes "Collected / Gross margin" — the platform's one headline number |
| Data table + Options column | **ADOPT** | Existing tables gain density |
| Status pills | **ADOPT** | `StatusBadge` already exists; restyle within scope |
| Muted caps table headers | **ADOPT** | |
| Bar chart "Top Hiring Sources" | **ADAPT** | Only if mapped to the existing revenue timeseries endpoint. **Deferred — this is a new feature, excluded per your instruction.** |
| Right rail (calendar) | **REJECT** | No scheduling domain |
| "Upcoming Interviews" list | **REJECT** | No such entity |
| "Free Plan" badge / "Upgrade to PRO" card | **REJECT** | Not a plan-tiered SaaS; would be a fabricated affordance |
| Rocket illustration | **REJECT** | Decorative; costs vertical space R3 reclaims |
| Notification bell + avatar menu | **ADAPT** | Account menu only — no notification system exists |
| Purple/cyan/coral chart triad | **ADAPT** | Retained as accent + info + danger *roles*, not as a chart palette |

## 9. Token set — repo-native (Tailwind v4 `@theme` + scoped layer)

```css
/* globals.css — ADDITIVE. Nothing above this block changes. */
@theme {
  --color-admin-bg: #f7f8fa;
  --color-admin-surface: #ffffff;
  --color-admin-border: #e8eaf0;
  --color-admin-border-subtle: #f1f2f6;
  --color-admin-text: #111827;
  --color-admin-text-secondary: #4b5563;
  --color-admin-text-muted: #5b6472;
  --color-admin-accent: #4f46e5;
  --color-admin-accent-ink: #4338ca;
  --color-admin-accent-tint: #eef2ff;

  --text-admin-title: 20px;   --text-admin-title--line-height: 28px;  --text-admin-title--font-weight: 600;
  --text-admin-section: 15px; --text-admin-section--line-height: 22px; --text-admin-section--font-weight: 600;
  --text-admin-kpi: 28px;     --text-admin-kpi--line-height: 34px;    --text-admin-kpi--font-weight: 650;
  --text-admin-body: 14px;    --text-admin-body--line-height: 20px;
  --text-admin-label: 13px;   --text-admin-label--line-height: 18px;  --text-admin-label--font-weight: 500;
  --text-admin-caps: 11px;    --text-admin-caps--line-height: 14px;   --text-admin-caps--letter-spacing: 0.06em; --text-admin-caps--font-weight: 600;

  --radius-admin: 12px;
  --radius-admin-sm: 8px;
  --shadow-admin: 0 1px 2px rgba(16, 24, 40, 0.04);

  --spacing-sidebar: 240px;
  --spacing-sidebar-collapsed: 64px;
  --spacing-topbar: 48px;
}
```

## 10. Contrast (computed, sRGB WCAG 2.1)

| Pair | Measured | AA body (4.5:1) |
|---|---|---|
| `#111827` on `#ffffff` | **17.74:1** | pass |
| `#4b5563` on `#ffffff` | **7.56:1** | pass |
| `#4b5563` on `#f7f8fa` | **7.11:1** | pass |
| `#5b6472` on `#ffffff` | **5.98:1** | pass |
| `#5b6472` on `#f7f8fa` | **5.63:1** | pass |
| `#4338ca` on `#ffffff` | **7.90:1** | pass |
| `#4338ca` on `#eef2ff` | **7.07:1** | pass |
| `#4f46e5` on `#ffffff` | **6.29:1** | pass |

Computed with the WCAG 2.1 sRGB relative-luminance formula, not eyeballed.

**Muted grey was changed during this phase.** The first candidate, `#6b7280`, measures
**4.55:1** on the `#f7f8fa` ground — 0.05 above the AA floor. That is not a pass worth
having: it is one background tweak or one antialiasing difference away from failing, on
the colour that carries every table label and caption. `#5b6472` measures **5.63:1** on
the same ground and still reads clearly muted against `#4b5563` secondary text.

Re-verified against the rendered DOM in Phase 5.
