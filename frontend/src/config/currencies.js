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
 * What a visitor sees when nothing better is known — deliberately NOT `BASE_CURRENCY`.
 *
 * The two answer different questions. `BASE_CURRENCY` is what the order is charged in
 * and what the structured data declares; it is money, and it does not move. This is a
 * display preference for a visitor whose locale tells us nothing useful, and India is
 * the primary market.
 *
 * It is a *preference*, not a guarantee: the backend withdraws a currency whose rate
 * has gone stale, and `no-flash-script` falls back to `BASE_CURRENCY` when this one is
 * not being quoted. Honouring it blindly would leave an empty gap where the price
 * should be, because the CSS only reveals a span that was actually rendered.
 */
export const DEFAULT_DISPLAY_CURRENCY = "INR";

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

