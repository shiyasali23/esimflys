import {
  BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
} from "@/config/currencies";

/**
 * FX rates map: { EUR: 0.92, INR: 83.2, ... } as multipliers vs 1 USD.
 * Baked at build time (blueprint §28.8) — never fetched per render.
 */

/** Convert a USD amount to a target currency. */
export function convert(usdAmount, currency, rates = {}) {
  if (currency === BASE_CURRENCY) return usdAmount;
  const rate = rates[currency];
  return typeof rate === "number" ? usdAmount * rate : usdAmount;
}

/**
 * Format an amount already in `currency` using its configured locale.
 * Runs server-side (fixed locale per currency) → no hydration mismatch.
 */
export function formatMoney(amount, currency = BASE_CURRENCY) {
  const meta =
    SUPPORTED_CURRENCIES.find((c) => c.code === currency) ||
    SUPPORTED_CURRENCIES[0];
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(amount);
}

/** Convenience: format a USD amount into a target currency. */
export function formatUsd(usdAmount, currency = BASE_CURRENCY, rates = {}) {
  return formatMoney(convert(usdAmount, currency, rates), currency);
}
