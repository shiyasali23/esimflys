import { api, toList } from "./client";

/**
 * Public catalogue (API.md §6.2). No auth, no cookies — so these are safe to call
 * from Server Components, which is what keeps the country pages server-rendered
 * and indexable.
 *
 * Note: `plan_count` here counts ACTIVE plans only. A country with paused plans
 * reports 0, which is what the index gate should key on.
 */

export async function fetchCountries(options) {
  return toList(await api.get("/catalog/countries/", options)).results;
}

export async function fetchCountryPlans(slug, options) {
  const data = await api.get(`/catalog/countries/${encodeURIComponent(slug)}/plans/`, options);
  return toList(data).results;
}

