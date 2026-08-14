import "server-only";
import { BASE_CURRENCY, CURRENCY_CODES } from "@/config/currencies";
import table from "@/data/rates.json";

/**
 * The FX table, read from `src/data/rates.json`.
 *
 * A COMMITTED source file, exactly like `catalog.json`, refreshed by hand with
 * `npm run catalog`. The build makes no network call at all, so a backend that is down
 * — or not deployed yet — cannot turn the storefront into a single-currency site
 * without anyone noticing. Read once in the root layout and handed to the client
 * through `RatesProvider`; `<Price>` renders dozens of times per page and each
 * instance needs the whole table.
 *
 * Refreshing is a deliberate act: run the script, read the diff, commit it. That fits
 * how these numbers actually move — the backend serves them from hand-configured
 * settings, not a live feed, so they change when someone edits `FX_RATES`. And the
 * converted figure is display-only: no order can be created in a currency other than
 * USD, so a stale rate is a misquote, never a mischarge.
 *
 * Two rules from the backend design, both enforced here:
 *
 * 1. **Only currencies present in `rates` may be offered.** A currency whose quote
 *    has gone stale is deliberately withdrawn by the backend rather than charged on
 *    an old number. Absent means unavailable, not "look it up somewhere else".
 * 2. **Never invent a rate.** Every number in `rates.json` came from the backend and
 *    was reviewed into the repo. A malformed file answers USD only rather than
 *    guessing — showing a price derived from a rate nobody will honour is worse than
 *    showing no local price at all.
 *
 * Rates are returned RAW, with `buffer` alongside them rather than multiplied in.
 * The backend's charm rounding compares against the unbuffered value, so folding the
 * buffer into the rate changes the result — see `convertUsdMinor`.
 */

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
  const rates = parseRates(table);
  if (!rates) return USD_ONLY;

  const buffer = Number(table.buffer);
  return { rates, buffer: Number.isFinite(buffer) && buffer > 0 ? buffer : 1 };
}
