# Recommended Action Plan — eSIMFlys SEO

Derived from `cross-validation-report.md` (F#) and `negative-seo-risk-report.md` (R#). **Phase One is analysis-only — nothing here has been applied.** These are recommendations for a later implementation phase. Every action must stay honest: **no copying/paraphrasing esim70, no fabricated data.**

Guiding principle: our on-page/technical SEO is at parity. The gap that actually limits rankings is **unique indexable content, internationalization, real trust, and off-page authority** — not tag hygiene. Sequence: **protect → grow the core → scale → build authority.**

---

## 1. Immediate fixes (low-risk, quick, high signal-to-effort)
| # | Action | Refs | Effort | Notes |
|---|---|---|---|---|
| I1 | Align footer "Top destinations" (`content/nav.json`) to the featured/top-`sortOrder` countries (SA, UAE, Thailand, Indonesia…) instead of the stale France/Germany/Greece/Italy | R8 | XS | Content-only; keeps footer relevant to the new homepage. |
| I2 | Decide the dead `routes.blog()`/`blogPost()` builders: remove them, or commit to building `/blog` | R5, F8 | XS | Dead code today; remove to avoid confusion if blog isn't imminent. |
| I3 | (Optional-immediate) Keyword-first homepage `<title>` in `app/layout.js` (e.g. "Travel eSIM Data for 60+ Countries \| eSIMFlys", original wording) | F5, R9 | XS | Small head-term upside on the most-linked page. |

## 2. High-priority fixes (biggest impact / real risk)
| # | Action | Refs | Effort | Dependency |
|---|---|---|---|---|
| H1 | **Remove the copied "Always On service" block** from `content/legal/terms.js` (diff ready) | R1 | XS to apply | **Legal sign-off** (see §5). Highest-severity item. |
| H2 | **Author unique per-country editorial** for the top ~10–20 markets (real networks, plan ranges, genuine destination guidance — NOT esim70's words), then set `content.approved=true` per country so the gate indexes them | F1, R4, R6 | L (content project) | Real content authored/approved; ideally in the DB `country_content` model (currently unused by the frontend) |
| H3 | **Activate real plans** (flip catalogue `status` to active) and set `SHOW_PAUSED_PLANS=false` before indexing/launch | R7 | M (data/business) | Supplier/business decision |
| H4 | **Keep the `noindex` gate enforced** — never bulk-flip country pages while they're templated | R2 | — (guardrail) | Do-not-do rule |
| H5 | Wire the frontend to render `country_content` (intro/activation/why/FAQ/meta per locale) so approved unique content actually surfaces + drives the index decision | F1 | M | H2 content exists |

## 3. Medium-priority improvements (scale)
| # | Action | Refs | Effort |
|---|---|---|---|
| M1 | **Internationalization (hreflang)** — locale routing + genuinely translated top pages and top-market country pages + `alternates.languages`. Ship only locales you can translate well (machine-thin translations create new duplicate risk). | F2, R5 | L |
| M2 | **Blog** with original informational guides ("how to install an eSIM on iPhone", destination guides) targeting long-tail intent | F8, R5 | M–L |
| M3 | **Real reviews pipeline** → once collected + verified-purchase, enable Review/AggregateRating JSON-LD and real ratings | F4, R6 | M |
| M4 | **Regional bundle pages** (`/esim/[region]`) — only when a real regional product/data exists | F7 | M |
| M5 | Add Organization `logo` + real `sameAs` social profiles to JSON-LD once assets exist | F10 | S |
| M6 | Validate all structured data on live URLs via Google Rich Results Test / schema validator | R-verify | S |

## 4. Optional improvements (low upside / nice-to-have)
| # | Action | Refs | Effort |
|---|---|---|---|
| O1 | Emit **FAQPage JSON-LD** mirroring the visible FAQs (home + country) for parity — low ranking upside (FAQ rich results largely deprecated for commercial sites) | F3 | S |
| O2 | Restore the **live local-time widget** on country pages using `countries.timezone` | F9 | S |
| O3 | Per-page uniqueness lever: inject `${networks}` into one country-FAQ answer (guarded for empty) to raise real per-page variance | F1 | S |

## 5. Items requiring legal or human review (do NOT auto-implement)
| # | Item | Refs | Owner |
|---|---|---|---|
| L1 | Confirm + apply removal of the Terms "Always On service" block | R1, H1 | **Legal counsel** |
| L2 | Finalize placeholder legal docs — controlling entity, governing law/jurisdiction, liability cap, support contact | R3 | **Legal counsel** |
| L3 | Real-review collection, verification, and display policy | R6, M3 | Ops / product (human) |
| L4 | i18n translation quality (human translators; avoid thin machine output) | M1 | Localization (human) |
| L5 | Off-page strategy — set up Google Search Console, run a backlink/authority audit (Ahrefs/SEMrush), plan link-building. **The new-domain authority gap vs esim70 is the dominant real-world ranking factor and is out of scope for on-page work.** | Cross-val §C, R-verify | SEO (human + tooling) |

---

## 6. Sequencing (recommended)
1. **Protect (now):** H1 (remove copied Terms block, w/ counsel), H4 (keep gate), I1–I2. → removes active risk.
2. **Grow the core (next):** H3 (activate plans) + H2/H5 (unique content for top markets → index them) + M6 (validate schema). → turns on country organic honestly.
3. **Scale:** M1 (i18n), M2 (blog), M3 (real reviews + rating schema), M4 (regional). → expands keyword surface.
4. **Authority (ongoing):** L5 (backlinks/GSC) — the long game; no on-page shortcut.

## 7. What NOT to do
- Do **not** copy, spin, or closely paraphrase esim70's country content, reviews, blog, or metadata to close the gap — that would create the exact duplicate/plagiarism risk this audit is guarding against.
- Do **not** fabricate reviews, ratings, savings, hotspot support, or regional availability to match esim70's trust signals.
- Do **not** remove the country-page `noindex` gate until pages are genuinely unique and approved.
- Do **not** treat a Lighthouse SEO 100 as proof of rankings.
