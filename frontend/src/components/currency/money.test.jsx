// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Money } from "./money";

/**
 * `<Money>` formats an amount that is ALREADY denominated. `<Price>` converts a USD
 * catalogue price into whatever the shopper is browsing in. Sending a recorded
 * amount through `<Price>` converts it twice.
 */

describe("Money", () => {
  it("formats in the currency it is given, without converting", () => {
    render(<Money minor={63900} currency="INR" />);
    expect(screen.getByText("₹639.00")).toBeTruthy();
  });

  /** JPY has no minor unit. A hardcoded /100 would render this as ¥11.40. */
  it("respects a zero-decimal currency", () => {
    render(<Money minor={1140} currency="JPY" />);
    expect(screen.getByText(/[¥￥]1,140/)).toBeTruthy();
  });

  it("falls back to USD for an unknown currency rather than throwing", () => {
    render(<Money minor={1699} currency="ZZZ" />);
    expect(screen.getByText("$16.99")).toBeTruthy();
  });

  it("renders zero rather than blank for a missing amount", () => {
    render(<Money minor={undefined} currency="USD" />);
    expect(screen.getByText("$0.00")).toBeTruthy();
  });
});

/**
 * The structural half, and the one that actually protects the money path.
 *
 * `<Price usd={fromMinor(order.total_minor)} />` reads harmlessly and was correct for
 * as long as every order was USD. It is now a double conversion: an INR order total
 * would be multiplied by the INR rate a second time, so a ₹639 order would advertise
 * roughly ₹56,000. There were 47 of these.
 *
 * Every money field the API returns carries its own `currency`, so the rule is simply
 * that a recorded amount never reaches `<Price>`. Only genuine catalogue prices may.
 */
describe("no recorded amount is routed through <Price>", () => {
  const SRC = join(process.cwd(), "src");

  /** Catalogue prices are authored in USD and are meant to be converted. */
  const CATALOGUE_ONLY = new Set([
    join(SRC, "features", "catalog", "components", "plan-selector.client.jsx"),
    join(SRC, "features", "account", "components", "topup-panel.client.jsx"),
  ]);

  function walk(dir, found = []) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path, found);
      else if (/\.jsx$/.test(path) && !/\.test\./.test(path)) found.push(path);
    }
    return found;
  }

  it("never pairs <Price> with fromMinor outside the catalogue", () => {
    const offenders = walk(SRC)
      .filter((path) => !CATALOGUE_ONLY.has(path))
      .filter((path) => /<Price\s+usd=\{fromMinor\(/.test(readFileSync(path, "utf8")))
      .map((path) => path.replace(`${SRC}/`, ""));

    expect(offenders).toEqual([]);
  });

  it("keeps the catalogue exemptions honest — they must still exist and use <Price>", () => {
    for (const path of CATALOGUE_ONLY) {
      expect(readFileSync(path, "utf8")).toMatch(/<Price\s/);
    }
  });
});
