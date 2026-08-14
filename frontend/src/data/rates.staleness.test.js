import { describe, it, expect } from "vitest";
import rates from "./rates.json";
import { CURRENCY_CODES, BASE_CURRENCY, DEFAULT_DISPLAY_CURRENCY } from "@/config/currencies";

/**
 * `rates.json` is a committed artifact refreshed by hand with `npm run catalog`, so
 * nothing forces it to stay current. Nobody notices a stale FX table by looking at the
 * site — the prices simply keep converting at last month's number.
 *
 * A stale rate is a misquote, never a mischarge: checkout charges USD regardless. So
 * this warns rather than blocks below the hard limit, and only fails once the table is
 * old enough that the quoted price has probably stopped resembling the real one.
 */
const WARN_AFTER_DAYS = 45;
const FAIL_AFTER_DAYS = 120;

const ageInDays = (iso) => (Date.now() - Date.parse(iso)) / 86_400_000;

describe("the committed FX table", () => {
  it("quotes USD at exactly 1", () => {
    expect(rates.rates[BASE_CURRENCY]).toBe(1);
  });

  it("names only currencies this frontend can format", () => {
    const unknown = Object.keys(rates.rates).filter((c) => !CURRENCY_CODES.includes(c));
    expect(unknown, `not in SUPPORTED_CURRENCIES: ${unknown.join(", ")}`).toEqual([]);
  });

  it("quotes no rate that would produce a nonsense price", () => {
    const broken = Object.entries(rates.rates).filter(
      ([, v]) => !Number.isFinite(Number(v)) || Number(v) <= 0,
    );
    expect(broken, `unusable quotes: ${JSON.stringify(broken)}`).toEqual([]);
  });

  it("carries a buffer above 1", () => {
    expect(Number(rates.buffer)).toBeGreaterThanOrEqual(1);
  });

  /**
   * The picker hides itself below two currencies, so a table that lost its second
   * entry silently removes the whole multi-currency feature from the header.
   */
  it("still offers the default display currency", () => {
    expect(
      Object.keys(rates.rates),
      `${DEFAULT_DISPLAY_CURRENCY} is the default but is not quoted — the picker will hide and everyone sees ${BASE_CURRENCY}`,
    ).toContain(DEFAULT_DISPLAY_CURRENCY);
  });

  it("is not so old that the quoted price has stopped meaning anything", () => {
    const stamp = rates.meta?.generatedAt;
    if (!stamp) {
      // Seeded by hand from the backend's settings and never refreshed against a live
      // one. Not a failure — but it has never been verified either.
      console.warn(
        "[rates] generatedAt is null — seeded from backend settings, never refreshed. Run `npm run catalog`.",
      );
      return;
    }

    const days = ageInDays(stamp);
    expect(Number.isFinite(days), `generatedAt is not a date: ${stamp}`).toBe(true);
    if (days > WARN_AFTER_DAYS) {
      console.warn(`[rates] table is ${Math.round(days)} days old — run \`npm run catalog\`.`);
    }
    expect(days, `FX table is ${Math.round(days)} days old`).toBeLessThan(FAIL_AFTER_DAYS);
  });
});
