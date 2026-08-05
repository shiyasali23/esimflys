import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { countryProductJsonLd } from "@/lib/seo/jsonld";

/**
 * Three rules that multi-currency work is unusually good at breaking. The site is
 * clean on all three today; these keep it that way.
 *
 * They are structural checks over the source tree rather than rendered-output checks
 * because the failure they guard against is someone *adding* a currency-aware route
 * or a geo redirect later, in a file that does not exist yet.
 */

const APP = join(process.cwd(), "src", "app");
const SRC = join(process.cwd(), "src");

/**
 * Strip comments before matching. These checks look for *calls*, and the files they
 * inspect explain in prose why those calls are absent — matching the explanation
 * instead of the code makes the test fail on documentation.
 */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir, predicate, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, predicate, found);
    else if (predicate(path)) found.push(path);
  }
  return found;
}

const routeSegments = (() => {
  const names = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (!statSync(path).isDirectory()) continue;
      names.push(entry);
      collect(path);
    }
  };
  collect(APP);
  return names;
})();

describe("rule 1 — currency never appears in a URL", () => {
  /**
   * A per-currency URL splits every page into nine near-duplicates competing with
   * each other, and none of them can be the canonical one. Currency lives in a
   * cookie; the URL stays currency-free.
   */
  it("has no route segment named after a currency", () => {
    const codes = ["usd", "eur", "gbp", "inr", "aed", "sar", "jpy", "aud", "cad"];
    const offenders = routeSegments.filter((segment) => {
      const bare = segment.replace(/^[[(]|[\])]$/g, "").toLowerCase();
      return codes.includes(bare) || /^(currency|cur)$/.test(bare);
    });
    expect(offenders).toEqual([]);
  });

  it("has no country-prefixed locale segment", () => {
    const offenders = routeSegments.filter((s) => /^\[?(locale|country|region|geo)\]?$/.test(s));
    expect(offenders).toEqual([]);
  });
});

describe("rule 2 — currency is never resolved by redirecting", () => {
  /**
   * Detect and switch is fine; redirecting is not. Googlebot crawls from US IPs, and
   * a geo redirect either traps it on one variant or looks like cloaking.
   */
  it("calls no redirect() from any currency or geo module", () => {
    const currencyFiles = walk(
      SRC,
      (p) => /currency|rates/i.test(p) && /\.jsx?$/.test(p) && !/\.test\./.test(p),
    );
    expect(currencyFiles.length).toBeGreaterThan(0);

    for (const file of currencyFiles) {
      const source = code(readFileSync(file, "utf8"));
      expect(source, `${file} must not redirect`).not.toMatch(/\bredirect\s*\(/);
      expect(source, `${file} must not read request headers`).not.toMatch(
        /from ["']next\/headers["']/,
      );
    }
  });

  /**
   * The root layout must stay statically generated. Reading cookies or headers there
   * would make every page dynamic AND make the HTML vary per visitor, which is what
   * lets a CDN serve one person's currency to the next person — Googlebot included.
   */
  it("resolves nothing per-request in the root layout", () => {
    const layout = code(readFileSync(join(APP, "layout.js"), "utf8"));
    expect(layout).not.toMatch(/from ["']next\/headers["']/);
    expect(layout).not.toMatch(/\bcookies\s*\(/);
    expect(layout).not.toMatch(/\bheaders\s*\(/);
  });

  /**
   * Middleware is the sharpest version of this trap, and it is the one that was
   * actually here: `src/proxy.js` read a geo-IP header and attached a `Set-Cookie`
   * for the matching currency. The HTML was identical for everyone, but the
   * `Set-Cookie` rode along on cacheable responses — so a CDN could hand the first
   * visitor's currency to every visitor behind that edge.
   *
   * Country detection now happens in the browser from the locale, which needs no
   * geo header and cannot be cached onto anyone else.
   */
  it("has no middleware that resolves currency from geo", () => {
    const candidates = ["proxy.js", "proxy.ts", "middleware.js", "middleware.ts"];
    for (const name of candidates) {
      const path = join(SRC, name);
      let source;
      try {
        source = code(readFileSync(path, "utf8"));
      } catch {
        continue; // absent is the desired state
      }
      expect(source, `${name} must not set a currency cookie`).not.toMatch(
        /cookies\.set\(\s*["']cur["']/,
      );
      expect(source, `${name} must not read a geo header`).not.toMatch(
        /ip-country|ipcountry|geo\b/i,
      );
    }
  });
});

describe("rule 3 — structured data stays USD", () => {
  /**
   * Googlebot sees USD prices in the rendered page, so the markup must say USD too.
   * A visible-vs-markup mismatch gets rich results suppressed.
   */
  it("declares priceCurrency USD", () => {
    const product = countryProductJsonLd({ name: "Turkey" }, [
      { retail_price_usd: 6.99 },
      { retail_price_usd: 19.99 },
    ]);
    const serialised = JSON.stringify(product);
    expect(serialised).toMatch(/"priceCurrency":"USD"/);
    for (const code of ["INR", "EUR", "GBP", "JPY"]) {
      expect(serialised).not.toContain(code);
    }
  });

  /** The markup must quote the USD figure, not a converted one. */
  it("quotes the unconverted USD prices", () => {
    const product = countryProductJsonLd({ name: "Turkey" }, [
      { retail_price_usd: 6.99 },
      { retail_price_usd: 19.99 },
    ]);
    expect(product.offers.lowPrice).toBe("6.99");
    expect(product.offers.highPrice).toBe("19.99");
  });

  it("hardcodes USD rather than deriving it from the display currency", () => {
    const source = readFileSync(join(SRC, "lib", "seo", "jsonld.js"), "utf8");
    expect(source).toMatch(/priceCurrency:\s*["']USD["']/);
  });
});
