/**
 * Currency configuration (blueprint §28.8).
 * USD is the canonical base (matches the catalogue + structured data).
 * Everything else is a DISPLAY currency, converted at build time via FX rates.
 */
export const BASE_CURRENCY = "USD";

export const SUPPORTED_CURRENCIES = [
  { code: "USD", locale: "en-US", decimals: 2 },
  { code: "EUR", locale: "de-DE", decimals: 2 },
  { code: "GBP", locale: "en-GB", decimals: 2 },
  { code: "INR", locale: "en-IN", decimals: 2 },
  { code: "AED", locale: "en-AE", decimals: 2 },
  { code: "SAR", locale: "en-SA", decimals: 2 },
  { code: "JPY", locale: "ja-JP", decimals: 0 },
  { code: "AUD", locale: "en-AU", decimals: 2 },
  { code: "CAD", locale: "en-CA", decimals: 2 },
];

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code);

/** User-origin ISO-2 country → default display currency (edge-geo maps to this). */
const COUNTRY_TO_CURRENCY = {
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

/** Map an ISO-2 country code to a supported display currency (default USD). */
export function currencyForCountry(countryCode) {
  return COUNTRY_TO_CURRENCY[String(countryCode || "").toUpperCase()] || BASE_CURRENCY;
}

export function isSupportedCurrency(code) {
  return CURRENCY_CODES.includes(code);
}
