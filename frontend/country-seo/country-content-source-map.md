# Country Content Source Map

Every factual claim in the authored country pages traces to one of three allowed sources. Nothing else was asserted.

## Allowed sources
- **[DB]** — verified catalogue data (`data/catalog.json` ← `eSIM_DB_Catalogue_Launch.xlsx`): operator names, plan types, data tiers, validity, USD price/per-day, top-up availability, region.
- **[UNIV]** — universal eSIM facts true everywhere: eSIM = digital SIM installed by QR; data-only (keep your number on the usual SIM); plans typically start on first local network connection (install on Wi-Fi beforehand); works on eSIM-capable, carrier-unlocked phones (iPhone XS+, Pixel 3+, Galaxy S20+); dial `*#06#` for an EID; enable data roaming on the eSIM line.
- **[GEO]** — verifiable public geography only: the region/sub-region a country sits in (e.g., "Asia" / "Southeast Asia", "Southeast Europe"), and the Maldives being an island nation. No coverage, speed, city, landmark, or population claims.

## Explicitly NOT asserted anywhere (guarded against)
Coverage percentages · "nationwide/everywhere" coverage · network speed/quality/rankings · "best/fastest" network · city/rural specifics · population/landmarks · **hotspot/tethering** (catalogue = "Unknown") · savings/discounts · reviews/ratings/statistics · any product feature not in the data. *(4G/5G is stated only as carried by the named operator label, e.g. "STC 5G", which is a DB fact.)*

## Per-country factual backbone (all [DB])
| Country | Operators (network label) | Plan types | Data tiers (GB) | Validity (days) | From $/day | Top-up |
|---|---|---|---|---|---|---|
| Saudi Arabia | STC 5G | fixed + unlimited-daily (1 GB/day) | 1,3,5,10,20 | 3,5,7,30 | 0.27 | some |
| United Arab Emirates | Du 5G | fixed + unlimited-daily (2 GB/day) | 1,3,5,10,20 | 5,7,10,30 | 0.57 | some |
| Thailand | AIS 5G, DTAC 5G | fixed + unlimited-daily (2 GB/day) | 1,3,5,10,20 | 5,7,10,30 | 0.33 | some |
| Indonesia | Telkomsel 5G, XL 4G, Smartfren 4G | fixed + unlimited-daily (2 GB/day) | 1,3,5,10,20,50 | 5,7,10,30 | 0.30 | some |
| Malaysia | Maxis 5G, CelcomDigi 5G | fixed only | 1,3,5,10,20,50 | 7,30 | 0.30 | all |
| Singapore | StarHub 5G | fixed only | 1,3,5,10,20,50 | 7,30 | 0.30 | all |
| Maldives | Dhiraagu 4G | fixed only | 1,3,5,10,20 | 7,30 | 0.87 | all |
| Turkey | Türk Telekom 5G, Aycell 5G, Vodafon 5G | fixed + unlimited-daily (2 GB/day) | 1,3,5,10,20,50 | 5,7,10,30 | 0.30 | some |
| Morocco | Orange Morocco 5G, IAM 4G | fixed + unlimited-daily | 1,3,5,10,20,50 | 5,7,10,30 | 0.43 | yes |
| Montenegro | m:tel CG 5G | fixed + unlimited-daily | 1,3,5,10,20 | 5,7,10,30 | 0.30 | yes |

## Field → source mapping (applies to every country JSON)
- `metaTitle`, `metaDescription` → [DB] (country, operator, from $X/day) + [UNIV] (QR, keep your number).
- `intro` → [UNIV] + [DB] price entry point.
- `countryContext` → [GEO] (region) + [DB] (operator names). No coverage/landmark/speed.
- `networkNotes` → [DB] (operator names + their 4G/5G label) + [UNIV] (auto network selection).
- `connectionDetails` → [DB] (tiers, validity, plan types, per-day, top-up) + [UNIV] (what data is good for).
- `activationNotes` → [UNIV] entirely.
- `whyEsim` → [UNIV] (vs local SIM / roaming; keep number).
- `faqs[]` → [DB] (networks, plans) + [UNIV] (device support, activation, keep number, roaming toggle).

## Data-quality note — RESOLVED
- Turkey's operator was previously stored as **"Vodafon 5G"** (missing "e") in the supplier feed. The source Excel has since been fixed to **"Vodafone 5G"**; `catalog.json` was regenerated and the Turkey country content updated (meta description, countryContext, networkNotes, FAQ). Verified: no "Vodafon" typo remains anywhere in `src/`, and the Turkey page's network chips + content + metadata all read "Vodafone 5G".

## Missing facts per country (why deeper editorial wasn't added)
For all 10, the catalogue provides operators + plan economics but **no** coverage depth, speeds, or city-level detail. Content therefore stays at "honest, data-driven" depth. To go deeper (e.g., "5G in major cities"), the client must supply or approve specific verifiable public facts per country — none were invented.
