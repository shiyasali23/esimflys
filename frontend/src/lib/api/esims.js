import { api, toList } from "./client";

/**
 * eSIMs (API.md §6.7). Owner-scoped, auth required.
 *
 * The list never contains activation credentials — only the detail endpoint does.
 * Usage figures are BYTES here, while plan allowances elsewhere are MB.
 */

export async function listEsims(options) {
  return toList(await api.get("/esims/", options));
}

/** Adds `credentials` (ICCID, SM-DP+ address, activation code, qr_payload). */
export function getEsim(esimId, options) {
  return api.get(`/esims/${encodeURIComponent(esimId)}/`, options);
}

/** Re-syncs usage from the supplier. Rate limited to 20/min. */
export function refreshEsimUsage(esimId) {
  return api.post(`/esims/${encodeURIComponent(esimId)}/refresh-usage/`);
}

/**
 * Top-ups for one eSIM (API.md §6.7).
 *
 * `available` is filtered server-side to products from this profile's own
 * supplier, so an empty list is a legitimate state — the plan simply has no
 * top-up offered — not an error. `data_amount_mb` is MB; `retail_amount_minor`
 * is minor units.
 *
 * @returns {Promise<{available: any[], history: any[]}>}
 */
export async function listTopups(esimId) {
  const data = await api.get(`/esims/${encodeURIComponent(esimId)}/topups/`);
  return {
    available: Array.isArray(data?.available) ? data.available : [],
    history: Array.isArray(data?.history) ? data.history : [],
  };
}

/**
 * Buying a top-up returns a normal ORDER (201), not a completed purchase — it is
 * paid through the same payment-intent flow as a first purchase, and the balance
 * only grows once the worker fulfils it.
 */
export function createTopupOrder(esimId, topupProductCode) {
  return api.post(`/esims/${encodeURIComponent(esimId)}/topups/`, {
    topup_product_code: topupProductCode,
  });
}

/** Nothing is installable until the worker has provisioned the profile. */
export function isEsimReady(esim) {
  return ["ready", "installed", "active"].includes(esim?.status);
}

export function isEsimPending(esim) {
  return ["pending", "provisioning"].includes(esim?.status);
}
