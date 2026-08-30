import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import site from "@/content/site.json";

/**
 * The hero's "No roaming fees · Keep your own number" badge is hidden below `sm`.
 *
 * That is only acceptable because the TrustTicker, which sits immediately under the hero
 * and shows on every viewport, already carries both claims — it reads them from
 * `content/site.json`. Delete or reword them there and a phone visitor stops seeing them
 * ANYWHERE, silently: the desktop page still looks complete, so nothing in review would
 * surface it.
 */
describe("hero badge is safe to hide on a phone", () => {
  it("the ticker still carries both claims the hidden badge made", () => {
    const text = JSON.stringify(site.ticker).toLowerCase();
    expect(text).toContain("no roaming fees");
    expect(text).toContain("keep your own number");
  });

  it("the badge is hidden below sm and restored above it", () => {
    const hero = readFileSync("src/features/home/components/hero.jsx", "utf8");
    // The badge's own class attribute, not the commentary around it.
    const at = hero.indexOf("bg-secondary-container px-3.5");
    const open = hero.lastIndexOf('className="', at);
    const badge = hero.slice(open, hero.indexOf('"', open + 11));
    expect(badge, badge).toContain("hidden");
    expect(badge, badge).toContain("sm:inline-flex");
    expect(badge, badge).not.toMatch(/className="inline-flex/);
  });

  it("the h1 carries no top margin on the viewport where the badge is gone", () => {
    // `mt-4`/`min-[360px]:mt-5` existed only to clear the badge. Left behind they are
    // dead space above the headline on exactly the viewport with least of it.
    const hero = readFileSync("src/features/home/components/hero.jsx", "utf8");
    const h1 = hero.slice(hero.indexOf("<h1 className="), hero.indexOf("<h1 className=") + 220);
    expect(h1).not.toMatch(/"mt-4|\smt-4\s/);
    expect(h1).not.toContain("min-[360px]:mt-5");
    expect(h1).toContain("sm:mt-5");
  });
});
