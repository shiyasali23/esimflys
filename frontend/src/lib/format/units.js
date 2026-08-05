// Relative, not aliased, for the same reason as `server/catalog/adapters.js`: the
// build-time catalogue generator imports this file from plain Node, where `@/` does
// not resolve.
import { currencyMeta } from "../../config/currencies.js";
import { fromMinorUnits } from "./money.js";

/**
 * Backend unit conventions (API.md §8). Two of these are silent footguns:
 * payable money is an integer in minor units, and data allowances are MB while
 * eSIM usage is bytes. Convert here, never inline at a call site.
 */

/**
 * 1699 -> 16.99, using the currency's own decimal count.
 *
 * The currency defaults to USD because almost every amount on this site is USD:
 * the catalogue is priced in it, and commissions and payouts are denominated in it
 * on purpose so an agency's cut does not move with someone else's exchange rate.
 *
 * Pass the currency for anything that arrives already denominated — a PaymentIntent,
 * an order total. JPY has no minor unit, so Y700 is `700`, and the USD assumption
 * would render it as Y7: a 100x error that is invisible in every other currency.
 */
export function fromMinor(minor, currency = "USD") {
  return fromMinorUnits(minor, currency);
}

/** 16.99 -> 1699, for request bodies that take minor units (e.g. refund allocations). */
export function toMinor(amount, currency = "USD") {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  const { decimals } = currencyMeta(currency);
  return Math.round(value * 10 ** decimals);
}

/**
 * `price_from` / `price_per_day` arrive pre-formatted as {amount: "0.57", currency}
 * — decimal strings, NOT minor units. Returns null when the country has no active plans.
 */
export function fromDisplayPrice(price) {
  if (!price || typeof price.amount !== "string") return null;
  const value = Number(price.amount);
  return Number.isFinite(value) ? value : null;
}

const MB_PER_GB = 1000;

/** Data allowance, in MB. 10000 → "10 GB". */
export function formatDataMb(mb) {
  const value = Number(mb);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value >= MB_PER_GB) {
    const gb = value / MB_PER_GB;
    return `${trimZeros(gb)} GB`;
  }
  return `${trimZeros(value)} MB`;
}

/** eSIM usage, in bytes. 10000000000 → "10 GB". Decimal GB, matching the supplier. */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value >= 1e9) return `${trimZeros(value / 1e9)} GB`;
  if (value >= 1e6) return `${trimZeros(value / 1e6)} MB`;
  if (value >= 1e3) return `${trimZeros(value / 1e3)} KB`;
  return `${Math.round(value)} B`;
}

/** Fraction of the allowance still available, 0–1, or null when totals are unknown. */
export function usageRatio(remainingBytes, totalBytes) {
  const remaining = Number(remainingBytes);
  const total = Number(totalBytes);
  if (!Number.isFinite(remaining) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(1, Math.max(0, remaining / total));
}

/**
 * `fixed` plans carry a total allowance; `daily` plans carry a per-day allowance
 * plus a day count (API.md §6.2). Reading the wrong field renders "null GB".
 */
export function planAllowance(plan) {
  if (!plan) return null;
  if (plan.plan_type === "daily") {
    const perDay = formatDataMb(plan.daily_high_speed_mb);
    return perDay ? `${perDay}/day` : null;
  }
  return formatDataMb(plan.data_limit_mb);
}

function trimZeros(value) {
  return Number(value.toFixed(2)).toString();
}
