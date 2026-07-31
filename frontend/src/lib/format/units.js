/**
 * Backend unit conventions (API.md §8). Two of these are silent footguns:
 * payable money is an integer in minor units, and data allowances are MB while
 * eSIM usage is bytes. Convert here, never inline at a call site.
 */

/** 1699 → 16.99. Feed the result to <Price usd={…} />, which owns display. */
export function fromMinor(minor) {
  const value = Number(minor);
  return Number.isFinite(value) ? value / 100 : 0;
}

/** 16.99 → 1699, for request bodies that take minor units (e.g. refund allocations). */
export function toMinor(amount) {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
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
