// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoFlashCurrencyScript } from "./no-flash-script";
import { CurrencySelector } from "./currency-selector.client";
import { RatesProvider } from "./rates-provider.client";

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
  it("defaults to INR when the backend quotes it", () => {
    expect(resolve({ offered: ["USD", "INR"], language: "en" })).toBe("INR");
  });

  it("falls back to USD when INR is not quoted", () => {
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
    ).toBe("INR");
  });

  /**
   * An unquoted detection falls through to the NEXT signal, it does not blank the page.
   * `language: "en"` carries no region, so locale contributes nothing and the only
   * remaining step below the timezone is the default.
   */
  it("ignores a detected currency the backend is not quoting", () => {
    expect(
      resolve({ offered: ["USD", "INR"], language: "en", timeZone: "Europe/Berlin" }),
    ).toBe("INR");
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
    expect(resolve({ offered: ["USD", "INR"], cookie: "cur=EUR", language: "en" })).toBe("INR");
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
