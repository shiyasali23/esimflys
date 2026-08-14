// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoFlashCurrencyScript } from "./no-flash-script";
import { CurrencySelector } from "./currency-selector.client";
import { RatesProvider } from "./rates-provider.client";

/** Run the inline script exactly as the browser would, and read what it decided. */
function resolve({ offered, cookie = "", language = "en-US" }) {
  document.documentElement.removeAttribute("data-currency");
  Object.defineProperty(document, "cookie", { value: cookie, configurable: true });
  Object.defineProperty(navigator, "language", { value: language, configurable: true });
  const { container } = render(<NoFlashCurrencyScript offered={offered} />);
  new Function(container.querySelector("script").innerHTML)();
  return document.documentElement.getAttribute("data-currency");
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
   * The default now outranks locale. The order is charged in whatever is on screen,
   * and Stripe only offers UPI on an INR intent — so letting a recognised region
   * silently pick GBP would also silently remove the payment method most of this
   * storefront's customers use.
   */
  it("outranks the visitor's region", () => {
    expect(resolve({ offered: ["USD", "INR", "GBP"], language: "en-GB" })).toBe("INR");
  });

  /** Locale survives one step below, for when the default is not quoted. */
  it("falls back to the visitor's region when the default is unavailable", () => {
    expect(resolve({ offered: ["USD", "GBP"], language: "en-GB" })).toBe("GBP");
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
