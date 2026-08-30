// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoFlashCurrencyScript } from "./no-flash-script";
import { CurrencySelector } from "./currency-selector.client";
import { RatesProvider } from "./rates-provider.client";
import { DEFAULT_DISPLAY_CURRENCY } from "@/config/currencies";
import shipped from "@/data/rates.json";

/** Run the inline script exactly as the browser would, and read what it decided. */
function resolve({ offered, cookie = "", language = "en-US", timeZone = "UTC" }) {
  document.documentElement.removeAttribute("data-currency");
  Object.defineProperty(document, "cookie", { value: cookie, configurable: true });
  Object.defineProperty(navigator, "language", { value: language, configurable: true });
  // The script reads the timezone as its primary location signal; jsdom reports the
  // machine's, which would make these assertions depend on where the test runs.
  const RealDTF = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () {
    return { resolvedOptions: () => ({ ...new RealDTF().resolvedOptions(), timeZone }) };
  };
  try {
    const { container } = render(<NoFlashCurrencyScript offered={offered} />);
    new Function(container.querySelector("script").innerHTML)();
    return document.documentElement.getAttribute("data-currency");
  } finally {
    Intl.DateTimeFormat = RealDTF;
  }
}

afterEach(() => document.documentElement.removeAttribute("data-currency"));

describe("default display currency", () => {
  /**
   * Asserted against the CONSTANT, not a literal. These tests are about the mechanism —
   * that the last step in the chain is reached and applied — and hard-coding the value
   * made four of them fail as a unit the moment the default legitimately moved, which
   * says nothing about whether the fallback still works.
   */
  it("applies DEFAULT_DISPLAY_CURRENCY when no signal is recognised", () => {
    expect(resolve({ offered: ["USD", "INR"], language: "en" })).toBe(DEFAULT_DISPLAY_CURRENCY);
  });

  it("falls back to USD when the default itself is not quoted", () => {
    expect(resolve({ offered: ["USD"], language: "en" })).toBe("USD");
  });

  /**
   * DEFAULT is a FALLBACK, not an override. It used to sit above both detection signals
   * and overwrite them, so every visitor on earth got INR — reported from Germany and
   * London, and reproduced across de-DE, en-GB, en-US, fr-FR and ja-JP.
   */
  it("does NOT outrank a recognised region", () => {
    expect(resolve({ offered: ["USD", "INR", "GBP"], language: "en-GB" })).toBe("GBP");
  });

  it("uses the region when the default is not quoted", () => {
    expect(resolve({ offered: ["USD", "GBP"], language: "en-GB" })).toBe("GBP");
  });

  /**
   * Timezone outranks locale because `navigator.language` is a LANGUAGE, not a place.
   * This is the case the user reported: an English browser physically in Germany.
   */
  it("prefers the timezone over the browser language", () => {
    expect(
      resolve({ offered: ["USD", "INR", "EUR"], language: "en-US", timeZone: "Europe/Berlin" }),
    ).toBe("EUR");
  });

  it("keeps INR for an Indian visitor on an English browser, so UPI survives", () => {
    expect(
      resolve({ offered: ["USD", "INR"], language: "en-US", timeZone: "Asia/Kolkata" }),
    ).toBe("INR");
  });

  it("falls back to locale when the timezone is unmapped", () => {
    expect(
      resolve({ offered: ["USD", "INR", "GBP"], language: "en-GB", timeZone: "Africa/Lagos" }),
    ).toBe("GBP");
  });

  it("falls back to the default when neither signal is recognised", () => {
    expect(
      resolve({ offered: ["USD", "INR"], language: "xx", timeZone: "Africa/Lagos" }),
    ).toBe(DEFAULT_DISPLAY_CURRENCY);
  });

  /**
   * An unquoted detection falls through to the NEXT signal, it does not blank the page.
   * `language: "en"` carries no region, so locale contributes nothing and the only
   * remaining step below the timezone is the default.
   */
  it("ignores a detected currency the backend is not quoting", () => {
    const got = resolve({ offered: ["USD", "INR"], language: "en", timeZone: "Europe/Berlin" });
    expect(got).not.toBe("EUR");
    expect(got).toBe(DEFAULT_DISPLAY_CURRENCY);
  });

  /** With a usable locale below it, an unquoted timezone falls through to that instead. */
  it("falls through an unquoted timezone to the locale", () => {
    expect(
      resolve({ offered: ["USD", "INR"], language: "en-US", timeZone: "Europe/Berlin" }),
    ).toBe("USD");
  });

  it("still lets an explicit pick beat everything", () => {
    expect(resolve({ offered: ["USD", "INR"], cookie: "cur=USD", language: "en-IN" })).toBe("USD");
  });

  it("ignores a cookie naming a currency no longer quoted", () => {
    // The case that matters after a withdrawal: a returning visitor who picked EUR back
    // when it was offered must not keep being shown a price nobody will charge.
    const got = resolve({ offered: ["USD", "INR"], cookie: "cur=EUR", language: "en" });
    expect(got).not.toBe("EUR");
    expect(got).toBe(DEFAULT_DISPLAY_CURRENCY);
  });
});

/**
 * These run against what is actually SHIPPED — the committed `rates.json` and the real
 * constant — rather than a hand-written `offered` list. Every test above passes a list in
 * by hand, so all of them stayed green while the deployed pairing was wrong.
 *
 * [MEASURED] Trimming `rates.json` from nine currencies to two, with the default still
 * "INR", resolved Germany, London, Dubai, Tokyo AND Riyadh to INR: their own signals no
 * longer matched anything quoted, so every one of them fell through to the default. The
 * currency on screen is the currency Stripe charges, so that bills a card in Riyadh in
 * rupees. Withdrawing currencies re-opens, from underneath, the same hole the precedence
 * fix closed from above.
 */
describe("the shipped table and default, together", () => {
  const OFFERED = Object.keys(shipped.rates);

  it("only offers what the backend quotes", () => {
    expect(OFFERED).toEqual(["USD", "INR"]);
  });

  it("the default is a currency that is actually quoted", () => {
    // Otherwise the last step of the chain is dead and everyone unmatched gets BASE by
    // accident rather than by decision.
    expect(OFFERED).toContain(DEFAULT_DISPLAY_CURRENCY);
  });

  it.each([
    ["Germany", "de-DE", "Europe/Berlin"],
    ["London", "en-GB", "Europe/London"],
    ["Dubai", "ar-AE", "Asia/Dubai"],
    ["Riyadh", "ar-SA", "Asia/Riyadh"],
    ["Tokyo", "ja-JP", "Asia/Tokyo"],
  ])("does not bill a visitor in %s in rupees", (_name, language, timeZone) => {
    expect(resolve({ offered: OFFERED, language, timeZone })).toBe("USD");
  });

  it("still gives an Indian visitor INR, so UPI survives", () => {
    expect(resolve({ offered: OFFERED, language: "en-US", timeZone: "Asia/Kolkata" })).toBe("INR");
  });
});

describe("the header currency picker", () => {
  const show = (rates) =>
    render(
      <RatesProvider value={{ rates, buffer: 1 }}>
        <CurrencySelector />
      </RatesProvider>,
    );

  it("appears once there is a real choice", () => {
    show({ USD: 1, INR: 88 });
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("offers exactly what the backend quotes, not the whole table", () => {
    show({ USD: 1, INR: 88 });
    const codes = [...screen.getByRole("combobox").options].map((o) => o.value);
    expect(codes).toEqual(["USD", "INR"]);
  });

  /** Nothing to choose between is not a picker — it is a dead control. */
  it("hides itself when only one currency is quoted", () => {
    show({ USD: 1 });
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
