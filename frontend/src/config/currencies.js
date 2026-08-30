/**
 * Currency configuration.
 *
 * USD is the canonical base: every plan is priced once in USD, and every other
 * currency is derived. That keeps 385 plans x 9 currencies from becoming a
 * maintenance problem, and it is what the structured data declares.
 *
 * `decimals`, `roundingStep` and `charmOffset` MIRROR the backend tables in
 * `apps/common/currency.py` (CURRENCY_DECIMALS / ROUNDING_STEP / CHARM_OFFSET).
 * They are duplicated here because the displayed price and the charged price must
 * be the same number, and the browser cannot reach the backend's tables.
 *
 * If the backend edits its tables, edit these too — `money.rounding.test.js` pins
 * the worked examples, but it cannot detect a change made only on the far side.
 * The durable fix is for `GET /catalog/rates/` to return the tables; that is a
 * backend change and is recorded as a recommendation, not done here.
 */
export const BASE_CURRENCY = "USD";

/**
 * What a visitor sees when nothing better is known.
 *
 * USD, and it has to be. This is the LAST step in `no-flash-script`'s precedence — the
 * answer for a visitor whose locale and timezone tell us nothing we can quote — so it is
 * the value everyone unmatched receives, not a mild preference.
 *
 * [MEASURED] It was "INR", chosen when the backend quoted nine currencies and India was
 * the primary market. That was safe only because a German visitor's own signals resolved
 * to EUR and overrode it. The backend now quotes USD and INR alone, so every European,
 * Gulf and East Asian signal fails the `ok()` gate and falls through to this line.
 * Simulating the deployed script across seven locales: with "INR" here, Germany, London,
 * Dubai, Tokyo AND Riyadh all resolve to INR. With "USD", each gets USD and an Indian
 * visitor still gets INR from `Asia/Kolkata`.
 *
 * That is not cosmetic. Checkout sends the on-screen currency, so serving INR to a
 * shopper in Riyadh does not merely look wrong — it bills their card in rupees. This is
 * the same failure the file's history already records once, where DEFAULT sat above the
 * detection steps and served INR to everyone on earth; withdrawing currencies re-opens
 * the identical hole from underneath.
 *
 * Restore "INR" here ONLY together with a backend that quotes EUR, GBP, AED, SAR and JPY
 * again, so the detection steps have something to override it with.
 */
export const DEFAULT_DISPLAY_CURRENCY = "USD";

/**
 * `roundingStep` and `charmOffset` are in MINOR units, which is why they differ so
 * much per currency: 1 cent off $7.00 gives $6.99, but 1 paisa off Rs 600 gives
 * Rs 599.99 — India prices on whole rupees, so the offset there is Rs 1 = 100 paise.
 * A step of 0 disables charm rounding for that currency.
 */
export const SUPPORTED_CURRENCIES = [
  { code: "USD", locale: "en-US", decimals: 2, roundingStep: 100, charmOffset: 1 },
  { code: "EUR", locale: "de-DE", decimals: 2, roundingStep: 100, charmOffset: 1 },
  { code: "GBP", locale: "en-GB", decimals: 2, roundingStep: 100, charmOffset: 1 },
  { code: "INR", locale: "en-IN", decimals: 2, roundingStep: 1000, charmOffset: 100 },
  { code: "AED", locale: "en-AE", decimals: 2, roundingStep: 50, charmOffset: 0 },
  { code: "SAR", locale: "en-SA", decimals: 2, roundingStep: 50, charmOffset: 0 },
  { code: "JPY", locale: "ja-JP", decimals: 0, roundingStep: 10, charmOffset: 0 },
  { code: "AUD", locale: "en-AU", decimals: 2, roundingStep: 100, charmOffset: 1 },
  { code: "CAD", locale: "en-CA", decimals: 2, roundingStep: 100, charmOffset: 1 },
];

/** Currency metadata, or USD when the code is unknown. Never throws — this is a display path. */
export function currencyMeta(code) {
  return (
    SUPPORTED_CURRENCIES.find((c) => c.code === String(code || "").toUpperCase()) ||
    SUPPORTED_CURRENCIES[0]
  );
}

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

/**
 * Visitor's ISO-2 country -> default display currency.
 *
 * Read in the browser from the locale region subtag, never from IP on the server.
 * Geo-detection is allowed to *switch* the displayed currency; it must never cause a
 * redirect, and it must never change the HTML the server emits, or a CDN would cache
 * one country's page and serve it to everyone including Googlebot.
 */
/**
 * IANA timezone -> display currency.
 *
 * The primary location signal, and it exists because `navigator.language` is a LANGUAGE,
 * not a place. A visitor in Germany running an English browser reports `en-US` or `en-GB`,
 * so locale alone put them on dollars or pounds. Their timezone says `Europe/Berlin`.
 *
 * Timezone is the best location signal obtainable BEFORE first paint: it is synchronous,
 * needs no network, and no permission prompt. True IP geolocation would be more accurate
 * still, but it is only knowable server-side — and this site is a static export served
 * from a CDN, so there is no per-visitor server step to ask. Reaching for it would mean
 * either a post-paint correction (the price visibly changes under the visitor) or running
 * the Worker on every HTML request, which is the per-view server hop that removing
 * OpenNext eliminated.
 *
 * Only the nine currencies the storefront actually quotes are mapped. Anything unlisted
 * falls through to locale, then to DEFAULT_DISPLAY_CURRENCY. That is deliberate: a wrong
 * guess here becomes a wrong CHARGE, because the currency on screen is the one sent to
 * Stripe. Silence is safer than a near-miss.
 */
export const TIMEZONE_TO_CURRENCY = {
  // India
  "Asia/Kolkata": "INR", "Asia/Calcutta": "INR",
  // United Kingdom
  "Europe/London": "GBP", "Europe/Belfast": "GBP",
  // Eurozone
  "Europe/Berlin": "EUR", "Europe/Paris": "EUR", "Europe/Madrid": "EUR",
  "Europe/Rome": "EUR", "Europe/Amsterdam": "EUR", "Europe/Dublin": "EUR",
  "Europe/Lisbon": "EUR", "Europe/Athens": "EUR", "Europe/Vienna": "EUR",
  "Europe/Brussels": "EUR", "Europe/Helsinki": "EUR", "Europe/Luxembourg": "EUR",
  "Europe/Bratislava": "EUR", "Europe/Ljubljana": "EUR", "Europe/Tallinn": "EUR",
  "Europe/Riga": "EUR", "Europe/Vilnius": "EUR", "Europe/Valletta": "EUR",
  "Europe/Nicosia": "EUR", "Europe/Zagreb": "EUR", "Europe/Malta": "EUR",
  // Gulf
  "Asia/Dubai": "AED", "Asia/Riyadh": "SAR",
  // Japan
  "Asia/Tokyo": "JPY",
  // Australia
  "Australia/Sydney": "AUD", "Australia/Melbourne": "AUD", "Australia/Brisbane": "AUD",
  "Australia/Perth": "AUD", "Australia/Adelaide": "AUD", "Australia/Hobart": "AUD",
  "Australia/Darwin": "AUD",
  // Canada
  "America/Toronto": "CAD", "America/Vancouver": "CAD", "America/Edmonton": "CAD",
  "America/Winnipeg": "CAD", "America/Halifax": "CAD", "America/St_Johns": "CAD",
  "America/Montreal": "CAD", "America/Regina": "CAD",
  // United States
  "America/New_York": "USD", "America/Chicago": "USD", "America/Denver": "USD",
  "America/Los_Angeles": "USD", "America/Phoenix": "USD", "America/Anchorage": "USD",
  "Pacific/Honolulu": "USD", "America/Detroit": "USD", "America/Indiana/Indianapolis": "USD",
};

export const COUNTRY_TO_CURRENCY = {
  US: "USD",
  GB: "GBP",
  IN: "INR",
  AE: "AED",
  SA: "SAR",
  JP: "JPY",
  AU: "AUD",
  CA: "CAD",
  // Eurozone (common)
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR",
  PT: "EUR", GR: "EUR", AT: "EUR", BE: "EUR", FI: "EUR", LU: "EUR",
};

