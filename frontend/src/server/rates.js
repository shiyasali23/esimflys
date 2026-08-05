import "server-only";
import { BASE_CURRENCY, CURRENCY_CODES } from "@/config/currencies";

/**
 * The FX table, read from `GET /api/v1/catalog/rates/`.
 *
 * Fetched on the server at BUILD time, once per render pass, and handed to the client
 * through `RatesProvider`. It is NOT fetched per component: `<Price>` renders dozens of
 * times on a country page and each instance needs the whole table.
 *
 * Cached indefinitely rather than revalidated. This fetch lives in the ROOT layout, so
 * any revalidation window would make all 123 pages incrementally static and require a
 * cache backend on Cloudflare Workers. It buys nothing: the backend serves rates from
 * hand-configured settings, not a live feed, so they change only when the backend is
 * redeployed — and the converted figure is display-only, because no order can be
 * created in a currency other than USD. Deploy the frontend to pick up new rates.
 *
 * Two rules from the backend design, both enforced here:
 *
 * 1. **Only currencies present in `rates` may be offered.** A currency whose quote
 *    has gone stale is deliberately withdrawn by the backend rather than charged on
 *    an old number. Absent means unavailable, not "look it up somewhere else".
 * 2. **Never fall back to a hardcoded rate.** If the endpoint is unreachable the
 *    answer is USD only. Showing a price derived from a rate nobody will honour is
 *    worse than showing no local price at all.
 *
 * Rates are returned RAW, with `buffer` alongside them rather than multiplied in.
 * The backend's charm rounding compares against the unbuffered value, so folding the
 * buffer into the rate changes the result — see `convertUsdMinor`.
 */

const API = (process.env.BACKEND_ORIGIN || "http://localhost:8000").replace(/\/$/, "");

/** USD is the base. A rate of 1 is true by definition and can never go stale. */
export const USD_ONLY = Object.freeze({
  rates: Object.freeze({ [BASE_CURRENCY]: 1 }),
  buffer: 1,
});

function parseRates(payload) {
  const raw = payload?.rates;
  if (!raw || typeof raw !== "object") return null;

  const rates = {};
  for (const [code, value] of Object.entries(raw)) {
    const upper = String(code).toUpperCase();
    const numeric = Number(value);
    // The API sends decimal strings. A non-finite or non-positive quote is a broken
    // row, and dividing by it would produce a nonsense price rather than an error.
    if (CURRENCY_CODES.includes(upper) && Number.isFinite(numeric) && numeric > 0) {
      rates[upper] = numeric;
    }
  }

  // USD must always be present and exactly 1, whatever the feed says about it.
  rates[BASE_CURRENCY] = 1;
  return rates;
}

export async function getRates() {
  try {
    const response = await fetch(`${API}/api/v1/catalog/rates/`, {
      headers: { Accept: "application/json" },
      cache: "force-cache",
    });
    if (!response.ok) return USD_ONLY;

    const payload = await response.json();
    const rates = parseRates(payload);
    if (!rates) return USD_ONLY;

    const buffer = Number(payload.buffer);
    return { rates, buffer: Number.isFinite(buffer) && buffer > 0 ? buffer : 1 };
  } catch {
    // A backend outage must not take the storefront down with it. USD still sells.
    return USD_ONLY;
  }
}
