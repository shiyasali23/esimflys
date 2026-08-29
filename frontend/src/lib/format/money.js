// Relative, not aliased: reachable from the build-time catalogue generator via
// `units.js`, which plain Node loads without the `@/` alias.
import { BASE_CURRENCY, currencyMeta } from "../../config/currencies.js";

/**
 * Money conversion and formatting.
 *
 * `convertUsdMinor` is a deliberate, faithful port of `convert()` in the backend's
 * `apps/common/currency.py`. It is NOT the simpler `amount x rate x buffer` — that
 * formula gives a different number from the one the customer is charged, because
 * the backend also charm-rounds. At $7.10 into INR the two disagree by Rs 90:
 *
 *     rate x buffer      -> Rs 608.48   (what a naive display would show)
 *     backend convert()  -> Rs 699.00   (what the card is actually debited)
 *
 * The gap is a full rounding step (Rs 100 for INR), so it is large whenever the
 * buffered amount sits just above a step boundary. Displaying one and charging the
 * other is the page-vs-receipt bug, so the algorithm is mirrored rather than
 * approximated. Both sides must change together.
 */

/**
 * Integer ceiling that tolerates float64 dust.
 *
 * The backend runs this arithmetic in `Decimal`; we only have doubles. 6.99 x 83.2
 * x 1.03 x 100 evaluates to 59897.999999999993 rather than 59898, and a plain
 * `Math.ceil` would round that dust up into a real extra unit. Snapping values that
 * are within a millionth of an integer removes the artefact without affecting any
 * genuine fraction, which is always many orders of magnitude larger.
 */
function ceilMinor(value) {
  const snapped = Math.round(value);
  return Math.abs(value - snapped) < 1e-6 ? snapped : Math.ceil(value);
}

/** Decimal USD (6.99) -> integer USD minor units (699). */
export function usdToMinor(usdAmount) {
  const value = Number(usdAmount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/**
 * Integer minor units -> decimal amount, using the currency's own decimal count.
 *
 * Never divide by 100 at a call site. JPY has no minor unit — Y700 is `700`, and a
 * hardcoded /100 turns it into Y7, a 100x error that is invisible in every other
 * currency.
 */
export function fromMinorUnits(minor, currency = BASE_CURRENCY) {
  const value = Number(minor);
  if (!Number.isFinite(value)) return 0;
  const { decimals } = currencyMeta(currency);
  return decimals === 0 ? value : value / 10 ** decimals;
}

/**
 * USD minor units -> target-currency minor units, matching the backend exactly.
 *
 * `rate` is the mid-market quote (1 USD = rate of the target) and `buffer` is the
 * margin protection layered on top. Rounding is always upward: rounding down can,
 * at the limit, price below the supplier's wholesale cost and turn a sale into a
 * silent loss.
 */
export function convertUsdMinor(baseMinor, currency, rate, buffer = 1, { charm = true } = {}) {
  const code = String(currency || "").toUpperCase();
  const base = Number(baseMinor);
  if (!Number.isFinite(base)) return 0;
  if (code === BASE_CURRENCY) return Math.round(base);

  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) return Math.round(base);

  const { decimals, roundingStep, charmOffset } = currencyMeta(code);
  const baseAmount = base / 100;
  const factor = 10 ** decimals;
  const numericBuffer = Number.isFinite(Number(buffer)) ? Number(buffer) : 1;

  const buffered = ceilMinor(baseAmount * numericRate * numericBuffer * factor);
  // The true FX value with no margin protection. Charm rounding may dip into the
  // buffer but must never cross this line — below it the sale is worth less than
  // the money taken, before the supplier is even paid.
  const unbuffered = ceilMinor(baseAmount * numericRate * factor);

  /*
    `charm: false` is for DERIVED display figures — today, only the "from X/day" rate, which
    is `retail_price / validity_days` and is never a sum anybody is charged.

    Charm rounding is calibrated for plan prices, where a step of one whole unit turns 5.87
    into 5.99. Applied to a per-day rate it destroys the number instead: the four countries
    the home page leads with cost $0.27, $0.57, $0.33 and $0.30, and EUR/GBP/AUD/CAD all use
    `roundingStep: 100`, so every one of them rounded up to the same 0.99. Four different
    prices, one displayed value, and Saudi Arabia shown at roughly 3.7x its real rate.

    USD escaped only because of the early return above, which is why this was invisible to
    anyone testing in dollars while every euro visitor saw it.

    Opting out here cannot reintroduce the page-vs-receipt bug this module exists to prevent:
    that risk lives on amounts the backend charges, and this is not one. Plan prices keep the
    full mirrored algorithm.
  */
  if (!roundingStep || !charm) return buffered;

  let rounded = Math.ceil(buffered / roundingStep) * roundingStep - charmOffset;
  if (rounded < unbuffered) rounded += roundingStep;
  return rounded;
}

/** Format an amount already denominated in `currency`, using that currency's locale. */
export function formatMoney(amount, currency = BASE_CURRENCY) {
  const meta = currencyMeta(currency);
  const value = Number(amount);
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * Format integer minor units that are ALREADY in `currency`.
 *
 * This is the right function for an amount that came back from the API already
 * denominated — a PaymentIntent, an order total. Do not route those through
 * `formatUsd`, which would convert an already-converted amount a second time.
 */
export function formatMinor(minor, currency = BASE_CURRENCY) {
  return formatMoney(fromMinorUnits(minor, currency), currency);
}

/**
 * Format a decimal USD catalogue price into a display currency.
 *
 * `fx` is the whole `{ rates, buffer }` table, never a pre-multiplied rate. Folding
 * the buffer into the rate looks equivalent and is not: the backend's floor check
 * compares the charm-rounded price against the UNBUFFERED value, so a pre-buffered
 * rate raises that floor and pushes borderline prices a full step higher. At $6.99
 * into INR that is the difference between showing Rs 599 and showing Rs 699 for an
 * order the card is debited Rs 599 for. Keep the two apart.
 */
export function formatUsd(usdAmount, currency = BASE_CURRENCY, fx = {}, options = {}) {
  const code = String(currency || "").toUpperCase();
  const rate = fx?.rates?.[code];
  if (code === BASE_CURRENCY || rate == null) {
    return formatMoney(Number(usdAmount) || 0, BASE_CURRENCY);
  }
  const minor = convertUsdMinor(usdToMinor(usdAmount), code, rate, fx.buffer ?? 1, options);
  return formatMinor(minor, code);
}
