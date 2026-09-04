import aliases from "@/data/network-aliases.json";

/**
 * The catalogue's network strings come from the wholesale supplier and several are
 * stale brands (a Turkish operator that merged in 2004, "T-Mobile UK", "Telenor" three
 * years after the Yettel rebrand). `catalog.json` is kept as the supplier truth; this
 * layer decides what a visitor is shown. Per-slug entries win over the "*" defaults.
 *
 * @param {string} slug
 * @param {string[]} names
 * @returns {string[]} display names, de-duplicated in first-seen order
 */
export function displayNetworks(slug, names) {
  const fallback = aliases["*"] || {};
  const specific = aliases[slug] || {};
  const seen = [];
  for (const raw of names || []) {
    const mapped = Object.prototype.hasOwnProperty.call(specific, raw)
      ? specific[raw]
      : Object.prototype.hasOwnProperty.call(fallback, raw)
        ? fallback[raw]
        : raw;
    if (mapped && !seen.includes(mapped)) seen.push(mapped);
  }
  return seen;
}

export function withDisplayNetworks(country) {
  if (!country) return country;
  return { ...country, networks: displayNetworks(country.slug, country.networks) };
}

export function withDisplayNetworkNames(plan) {
  if (!plan) return plan;
  return { ...plan, networkNames: displayNetworks(plan.countrySlug, plan.networkNames) };
}
