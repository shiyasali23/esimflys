/**
 * Bakes the catalogue into `src/data/catalog.json` at build time.
 *
 * The storefront reads that file, not the API. Country pages then render with no
 * runtime dependency on the backend — faster, statically generated, and immune to
 * a backend outage (which took the catalogue down once already).
 *
 * The trade-off is deliberate and worth stating: **prices and availability are as
 * fresh as the last build.** Pause a plan or change a price and the site keeps
 * showing the old one until you rebuild. The money is still safe — checkout
 * re-reads live prices server-side and returns 409 `plan_unavailable` for a plan
 * that has since been paused — so a customer can be surprised, but never
 * mischarged. Rebuild whenever the catalogue changes.
 *
 * Run: `node scripts/generate-catalog.mjs` (wired to `prebuild`, so `npm run build`
 * does it automatically).
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptCountries, adaptPlans, withNetworks } from "../src/server/catalog/adapters.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "src", "data", "catalog.json");

const API = (process.env.CATALOG_API_ORIGIN || "http://localhost:8000").replace(/\/$/, "");
const CONCURRENCY = 8;

/** Fields that must never reach a public bundle, asserted rather than assumed. */
const FORBIDDEN = ["wholesale_amount_minor", "margin_minor", "wholesale_price_usd", "competitor_ref_price"];

async function getJson(path) {
  const res = await fetch(`${API}/api/v1${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

/** Run tasks with a small pool so 68 countries don't open 68 sockets at once. */
async function pooled(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

async function main() {
  console.log(`[catalog] reading ${API}/api/v1/catalog/…`);

  const rawCountries = await getJson("/catalog/countries/");
  if (!Array.isArray(rawCountries) || rawCountries.length === 0) {
    // Writing an empty catalogue would ship a store with nothing to sell and no
    // error anywhere. Fail the build instead.
    throw new Error("the catalogue API returned no countries — refusing to write an empty catalogue");
  }

  const countries = adaptCountries(rawCountries);

  const perCountry = await pooled(countries, CONCURRENCY, async (country) => {
    const rawPlans = await getJson(`/catalog/countries/${encodeURIComponent(country.slug)}/plans/`);
    const plans = adaptPlans(rawPlans, country.slug);
    return { country: withNetworks(country, plans), plans };
  });

  const allPlans = perCountry.flatMap((entry) => entry.plans);
  const leaked = FORBIDDEN.filter((f) => JSON.stringify(allPlans).includes(f));
  if (leaked.length) {
    throw new Error(`refusing to write: wholesale/margin fields present (${leaked.join(", ")})`);
  }

  const payload = {
    meta: {
      source: `${API}/api/v1/catalog/`,
      generatedBy: "scripts/generate-catalog.mjs",
      // The catalogue is a committed artifact refreshed by hand, so without a stamp
      // there is no way to tell whether the prices in the repo are days or months old.
      generatedAt: new Date().toISOString(),
      countryCount: perCountry.length,
      planCount: allPlans.length,
      countriesWithPlans: perCountry.filter((e) => e.plans.length).length,
    },
    countries: perCountry.map((e) => e.country),
    plans: allPlans,
  };

  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);

  const withoutPlans = payload.meta.countryCount - payload.meta.countriesWithPlans;
  console.log(
    `[catalog] wrote ${payload.meta.countryCount} countries, ${payload.meta.planCount} plans` +
      (withoutPlans ? ` (${withoutPlans} with no active plans)` : ""),
  );
}

main().catch((error) => {
  console.error(`\n[catalog] FAILED: ${error.message}`);
  console.error("[catalog] the backend must be reachable to build the catalogue.");
  console.error(`[catalog] set CATALOG_API_ORIGIN if it is not at ${API}\n`);
  process.exit(1);
});
