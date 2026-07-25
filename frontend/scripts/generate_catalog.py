import json
import math
import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
XLSX = os.path.join(REPO, "eSIM_DB_Catalogue_Launch.xlsx")
OUT = os.path.join(HERE, "..", "src", "data", "catalog.json")

SERVER_ONLY = [
    "wholesale_price_usd",
    "competitor_ref_price",
    "competitor_ref_brand",
    "supplier_package_code",
    "wsp_verified_date",
]


def s(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    text = str(v).strip()
    return text or None


def b(v):
    return s(v) is not None and str(v).strip().lower() in ("true", "1", "yes", "y", "t")


def num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    f = float(v)
    return int(f) if f == int(f) else round(f, 4)


def split_multi(v):
    text = s(v)
    if not text:
        return []
    out = []
    for part in text.split(","):
        name = part.strip()
        if name and name not in out:
            out.append(name)
    return out


def per_day_min(plans):
    rates = [
        p["retail_price_usd"] / p["validity_days"]
        for p in plans
        if p["validity_days"] > 0 and p["retail_price_usd"] > 0
    ]
    return round(min(rates), 4) if rates else None


def main():
    if not os.path.exists(XLSX):
        sys.exit(f"Excel not found: {XLSX}")

    countries_df = pd.read_excel(XLSX, sheet_name="countries")
    catalogue_df = pd.read_excel(XLSX, sheet_name="Catalogue")

    iso_to_slug = {}
    for _, r in countries_df.iterrows():
        iso = s(r["iso2"])
        if iso:
            iso_to_slug[iso.upper()] = s(r["slug"])

    plans = []
    warnings = []
    orphan_codes = set()
    for _, r in catalogue_df.iterrows():
        iso = (s(r["country_code"]) or "").upper()
        slug = iso_to_slug.get(iso)
        if not slug:
            orphan_codes.add(iso)
            continue
        plan_type = s(r["plan_type"])
        is_unlimited = plan_type == "daily"
        data_gb = num(r["data_gb"])
        retail = num(r["retail_price_usd"])
        validity = num(r["validity_days"]) or 0
        status = s(r["status"]) or "draft"
        plan = {
            "product_id": s(r["product_id"]),
            "supplier_package_code": s(r["supplier_package_code"]),
            "plan_type": plan_type,
            "scope_type": "country",
            "country_code": iso,
            "country_name": s(r["country_name"]),
            "region": s(r["region"]),
            "countrySlug": slug,
            "iso2": iso,
            "display_name": s(r["display_name"]),
            "data_gb": data_gb,
            "perDayGb": data_gb if is_unlimited else None,
            "validity_days": validity,
            "traffic_policy": s(r["traffic_policy"]),
            "networkNames": split_multi(r["network"]),
            "topupSupported": b(r["topup_supported"]),
            "hotspot": s(r["hotspot"]),
            "hotspotSupported": None,
            "wholesale_price_usd": num(r["wholesale_price_usd"]),
            "retail_price_usd": retail,
            "competitor_ref_price": num(r["competitor_ref_price"]),
            "competitor_ref_brand": s(r["competitor_ref_brand"]),
            "wsp_verified_date": s(r["wsp_verified_date"]),
            "status": status,
            "isLive": status == "active",
            "isUnlimited": is_unlimited,
            "sort_order": num(r["sort_order"]) if s(r["sort_order"]) else 99,
            "badge": s(r["badge"]),
            "isDefaultSelected": b(r["default_selected"]),
            "tier": s(r["tier"]),
        }
        plans.append(plan)

    if orphan_codes:
        warnings.append(
            f"Skipped plans with country_code not in countries sheet: {sorted(c for c in orphan_codes if c)}"
        )

    countries = []
    for _, r in countries_df.iterrows():
        iso = (s(r["iso2"]) or "").upper()
        cp = [p for p in plans if p["iso2"] == iso]
        active = [p for p in cp if p["status"] == "active"]
        networks = []
        for p in cp:
            for n in p["networkNames"]:
                if n not in networks:
                    networks.append(n)
        data_tiers = sorted(
            {p["data_gb"] for p in cp if not p["isUnlimited"] and p["data_gb"] is not None}
        )
        validity_tiers = sorted({p["validity_days"] for p in cp if p["validity_days"]})
        price_from = per_day_min(active)
        if price_from is None:
            price_from = per_day_min(cp)
        countries.append(
            {
                "slug": s(r["slug"]),
                "iso2": iso,
                "name": s(r["name"]),
                "region": s(r["region"]),
                "flagEmoji": s(r["flag_emoji"]),
                "timezone": s(r["timezone"]),
                "isPopular": b(r["is_popular"]),
                "homepageBadge": s(r["homepage_badge"]),
                "isActive": b(r["is_active"]),
                "sortOrder": int(num(r["sort_order"])) if s(r["sort_order"]) else 999,
                "networks": networks,
                "hasUnlimited": any(p["isUnlimited"] for p in cp),
                "dataTiersGb": data_tiers,
                "validityDaysTiers": validity_tiers,
                "planCount": len(cp),
                "livePlanCount": len(active),
                "priceFrom": price_from,
                "hotspot": "Unknown",
                "content": {"intro": None, "coverageNotes": None, "faqs": [], "approved": False},
            }
        )

    countries.sort(key=lambda c: c["sortOrder"])
    plans.sort(key=lambda p: (p["countrySlug"] or "", p["sort_order"] or 99))

    active_countries = [c for c in countries if c["isActive"]]
    live_plans = [p for p in plans if p["status"] == "active"]

    def counts(items, key):
        out = {}
        for it in items:
            out[it[key]] = out.get(it[key], 0) + 1
        return out

    if not live_plans:
        warnings.append(
            "0 plans have status='active' — production visibility shows no plans until the business activates them (showPausedPlans renders paused as a dev fallback)."
        )

    meta = {
        "source": "eSIM_DB_Catalogue_Launch.xlsx",
        "generatedBy": "scripts/generate_catalog.py",
        "note": "SERVER_ONLY fields must be projected out before reaching the client (toClientPlan).",
        "serverOnlyFields": SERVER_ONLY,
        "currency": "USD",
        "countryCount": len(active_countries),
        "totalCountryCount": len(countries),
        "planCount": len(plans),
        "livePlanCount": len(live_plans),
        "regionsByCountry": counts(active_countries, "region"),
        "planTypes": counts(plans, "plan_type"),
        "warnings": warnings,
    }

    payload = {"meta": meta, "countries": countries, "plans": plans}
    with open(os.path.abspath(OUT), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"WROTE {OUT}")
    print(
        f"countries={len(countries)} (active {len(active_countries)}) plans={len(plans)} "
        f"(active {len(live_plans)}) popular={sum(c['isPopular'] for c in countries)}"
    )
    for w in warnings:
        print("WARN:", w)


if __name__ == "__main__":
    main()
