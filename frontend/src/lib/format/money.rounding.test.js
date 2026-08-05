import { describe, it, expect } from "vitest";
import { convertUsdMinor, formatMinor, fromMinorUnits, formatUsd, usdToMinor } from "./money";

/**
 * The displayed price must equal the charged price.
 *
 * Every expected value below was produced by running the BACKEND's own
 * `apps/common/currency.py:convert()` over the same inputs, not by hand and not by
 * this implementation. They are the contract between the two sides: if the backend
 * changes its rounding tables, these fail, which is the only warning the frontend
 * gets that `config/currencies.js` needs the same edit.
 */

const BUFFER = 1.03;
/** The rate configured in backend settings (`FX_RATES.INR`). */
const INR = 88;
/** The rate the dev-seeded `FxRate` rows serve while they are still present. */
const INR_SEEDED = 83.2;

describe("convertUsdMinor matches the backend", () => {
  it.each([
    [699, "INR", INR, 63900],
    [299, "INR", INR, 27900],
    [12999, "INR", INR, 1178900],
    [699, "INR", INR_SEEDED, 59900],
    [710, "INR", INR_SEEDED, 60900],
    [199, "INR", INR_SEEDED, 17900],
    [1499, "INR", INR_SEEDED, 128900],
    [699, "EUR", 0.92, 699],
    [699, "JPY", 157, 1140],
    [699, "AED", 3.67, 2650],
    [2999, "GBP", 0.79, 2499],
    [699, "USD", 1, 699],
    [50, "INR", INR_SEEDED, 4900],
    [1, "INR", INR_SEEDED, 900],
  ])("%i USD minor -> %s @ %f = %i", (baseMinor, currency, rate, expected) => {
    expect(convertUsdMinor(baseMinor, currency, rate, BUFFER)).toBe(expected);
  });

  /**
   * A regression that shipped: the backend moved `ROUNDING_STEP["INR"]` from 10000
   * (nearest Rs 100) to 1000 (nearest Rs 10) and this mirror was not updated, so the
   * storefront advertised Rs 699 for an order the card was debited Rs 639 on.
   *
   * Nothing in the build could have caught it — the tables live on both sides and only
   * one changed. Pinned explicitly so the step itself, not just a derived total, has
   * to be edited deliberately.
   */
  it("rounds INR to the nearest 10 rupees, not 100", () => {
    expect(convertUsdMinor(699, "INR", INR, BUFFER)).toBe(63900);
    expect(convertUsdMinor(699, "INR", INR, BUFFER)).not.toBe(69900);
  });

  /**
   * The whole reason this is a port rather than `amount x rate x buffer`.
   *
   * At $7.10 the buffered value lands just past an INR step boundary, so charm
   * rounding lifts it to the next Rs 10. A naive display would show Rs 643.54 for an
   * order the card is debited Rs 649.00 on — the page-vs-receipt mismatch, caused by
   * the simpler formula rather than prevented by it.
   *
   * The gap used to be up to Rs 100 and is now up to Rs 10, because the backend
   * narrowed the step. Smaller, still wrong, and still a number nobody agreed to.
   */
  it("diverges from a naive rate x buffer", () => {
    const naive = 7.1 * INR * BUFFER;
    const actual = fromMinorUnits(convertUsdMinor(710, "INR", INR, BUFFER), "INR");

    expect(naive).toBeCloseTo(643.54, 2);
    expect(actual).toBe(649);
    expect(actual).not.toBeCloseTo(naive, 2);
  });

  /**
   * Charm rounding is allowed to eat into the margin buffer but never past the true
   * FX value — below that line the sale is worth less than the money taken, before
   * the supplier is even paid.
   */
  it("never prices below the unbuffered FX value, across a rate swing", () => {
    for (const rate of [66.5, 74.9, 83.2, 91.5, 99.8]) {
      for (const baseMinor of [1, 50, 199, 699, 710, 1499, 4999, 9999]) {
        const got = convertUsdMinor(baseMinor, "INR", rate, BUFFER);
        const unbuffered = Math.ceil((baseMinor / 100) * rate * 100);
        expect(got).toBeGreaterThanOrEqual(unbuffered);
      }
    }
  });

  it("returns the base amount untouched for USD, whatever the rate says", () => {
    expect(convertUsdMinor(1499, "USD", 83.2, BUFFER)).toBe(1499);
  });

  it("falls back to the USD amount when the rate is missing or nonsense", () => {
    for (const rate of [undefined, null, 0, -1, Number.NaN, "abc"]) {
      expect(convertUsdMinor(699, "INR", rate, BUFFER)).toBe(699);
    }
  });
});

describe("zero-decimal currencies", () => {
  /** Y700 is stored as 700. Treating it as 70000 minor units is a 100x mis-charge. */
  it("does not divide JPY by 100", () => {
    expect(fromMinorUnits(700, "JPY")).toBe(700);
    expect(fromMinorUnits(700, "USD")).toBe(7);
  });

  it("formats JPY with no decimal places", () => {
    expect(formatMinor(1140, "JPY")).toMatch(/1,140/);
    expect(formatMinor(1140, "JPY")).not.toMatch(/\./);
  });

  it("round-trips a USD decimal through minor units without float drift", () => {
    // 6.99 * 100 is 698.9999999999999 in float64; a floor would lose a cent.
    expect(usdToMinor(6.99)).toBe(699);
    expect(usdToMinor(0.07)).toBe(7);
    expect(usdToMinor(19.99)).toBe(1999);
  });
});

describe("formatUsd", () => {
  const fx = { rates: { USD: 1, INR }, buffer: BUFFER };

  it("renders the same number the backend would charge", () => {
    expect(formatUsd(6.99, "INR", fx)).toMatch(/639\.00/);
    expect(formatUsd(2.99, "INR", fx)).toMatch(/279\.00/);
    expect(formatUsd(129.99, "INR", fx)).toMatch(/11,789\.00/);
  });

  it("falls back to USD for a currency the backend is not quoting", () => {
    expect(formatUsd(6.99, "EUR", fx)).toBe("$6.99");
  });

  /**
   * Folding the buffer into the rate looks equivalent and is not: it raises the
   * floor the charm price is checked against, pushing borderline prices a step up.
   *
   * $7.06 is chosen because its buffered value lands inside the last Rs 1 of a step,
   * which is exactly where the two formulas part company. Most amounts agree, which
   * is what makes this the kind of bug that reaches production.
   */
  it("is not the same as passing a pre-buffered rate", () => {
    const preBuffered = { rates: { USD: 1, INR: INR * BUFFER }, buffer: 1 };
    expect(formatUsd(7.06, "INR", fx)).toMatch(/639\.00/);
    expect(formatUsd(7.06, "INR", preBuffered)).toMatch(/649\.00/);
  });
});
