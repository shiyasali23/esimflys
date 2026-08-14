import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  hexToRgb,
  composite,
  contrastRatio,
  requiredRatio,
  readColorTokens,
} from "@/test/contrast";

/**
 * The design tokens, checked against WCAG AA arithmetically.
 *
 * Neither tool covers this. In jsdom axe cannot compute contrast at all; in a real
 * browser it returns "incomplete" for text on a gradient, because there is no one
 * background colour to measure against. The homepage hero subtitle — the first
 * sentence describing the product — sat at 3.82:1 against a required 4.5:1 behind
 * a clean axe run, and only turned up when the gradient stops were measured by
 * hand. These assertions make that class of failure fail the build instead.
 */

const css = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
const tokens = readColorTokens(css);
const rgb = (name) => hexToRgb(tokens[name]);
const WHITE = [255, 255, 255];

describe("the token file parses", () => {
  it("exposes the colours the rest of this file asserts on", () => {
    for (const name of ["primary", "foreground", "muted", "muted-foreground", "cta", "destructive", "success-text"]) {
      expect(tokens[name], `--color-${name} missing from globals.css`).toBeTruthy();
    }
    expect(rgb("primary")).toEqual([37, 99, 235]);
  });
});

/**
 * Every hero and CTA band is `from-primary … to-[#4a47c4]`. `--color-primary` is
 * the LIGHTEST stop, so it is the worst case for white text and the only stop
 * worth asserting against.
 */
describe("text on the indigo gradient", () => {
  const LIGHTEST_STOP = rgb("primary");

  it("full white passes as body text", () => {
    const ratio = contrastRatio(WHITE, LIGHTEST_STOP);
    expect(ratio).toBeGreaterThanOrEqual(requiredRatio({ px: 18 }));
  });

  /**
   * The regression guard. `text-white/80` renders at 3.82:1 here — legible enough
   * to pass review by eye, and invisible to every automated check we run.
   */
  it("white at 80% does NOT pass, which is why no such class remains", () => {
    const faded = composite(WHITE, 0.8, LIGHTEST_STOP);
    const ratio = contrastRatio(faded, LIGHTEST_STOP);
    expect(ratio).toBeLessThan(4.5);
    expect(ratio).toBeCloseTo(3.89, 1);
  });

  it("white at 90% does not pass either", () => {
    const faded = composite(WHITE, 0.9, LIGHTEST_STOP);
    expect(contrastRatio(faded, LIGHTEST_STOP)).toBeLessThan(4.5);
  });

  /**
   * The sky accent reads 1.86:1 on the brand blue — far below the 3:1 WCAG 1.4.11
   * needs even for an icon. So it may not be placed on primary at all; `cta-band`
   * uses sky-300 for its assurance ticks instead. This guards the rule, not a ratio.
   */
  it("the highlight accent is never legible enough to sit on primary", () => {
    expect(contrastRatio(rgb("highlight"), LIGHTEST_STOP)).toBeLessThan(3);
  });
});

describe("core foreground/background pairs meet AA", () => {
  const PAIRS = [
    ["foreground on background", "foreground", "background"],
    ["muted-foreground on background", "muted-foreground", "background"],
    ["primary on background", "primary", "background"],
    ["primary-foreground on primary", "primary-foreground", "primary"],
    ["destructive-foreground on destructive", "destructive-foreground", "destructive"],
    ["secondary-foreground on secondary", "secondary-foreground", "secondary"],
    ["accent-foreground on accent", "accent-foreground", "accent"],
    ["success-text on background", "success-text", "background"],
  ];

  for (const [label, fg, bg] of PAIRS) {
    it(label, () => {
      const ratio = contrastRatio(rgb(fg), rgb(bg));
      expect(ratio, `${label} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

/**
 * Three brand pairs sit below AA by deliberate decision: the CTA orange and the sky
 * highlight both carry WHITE labels, and muted grey sits on the muted surface. That is
 * the brand, and `lighthouserc.json` reflects it — accessibility is a warning at 0.95
 * rather than an error at 1.0.
 *
 * They are pinned rather than dropped: these numbers must not drift further by
 * accident. If a colour changes, this fails and the choice gets made on purpose again.
 */
describe("brand pairs that knowingly sit below AA", () => {
  const ACCEPTED = [
    ["cta-foreground on cta", "cta-foreground", "cta", 2.8],
    ["highlight-foreground on highlight", "highlight-foreground", "highlight", 2.77],
    ["muted-foreground on muted", "muted-foreground", "muted", 4.34],
  ];

  for (const [label, fg, bg, expected] of ACCEPTED) {
    it(`${label} is still ${expected}:1, no worse`, () => {
      const ratio = contrastRatio(rgb(fg), rgb(bg));
      expect(ratio, `${label} is ${ratio.toFixed(2)}:1`).toBeCloseTo(expected, 1);
    });
  }
});

/**
 * Status badges paint their text on a 10% tint of their own colour, not on white.
 * `--color-success-text` was changed from #1b7f3b to #166b32 for precisely this
 * case: 4.42:1 on its own tint is a failure that passes when measured on white.
 */
describe("badge text on its own 10% tint", () => {
  it("success text passes on the tint, not just on white", () => {
    const tint = composite(rgb("success-text"), 0.1, WHITE);
    expect(contrastRatio(rgb("success-text"), tint)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The brand red fails here at 4.09:1, which is why `--color-destructive-text`
   * exists — the same split already made for success. The base token is still
   * correct for a button, so both are asserted for what they are actually used for.
   */
  it("the brand red alone would NOT pass on its own tint", () => {
    const tint = composite(rgb("destructive"), 0.1, WHITE);
    expect(contrastRatio(rgb("destructive"), tint)).toBeLessThan(4.5);
  });

  it("destructive TEXT passes on that tint", () => {
    const tint = composite(rgb("destructive"), 0.1, WHITE);
    expect(contrastRatio(rgb("destructive-text"), tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("the base destructive is still fine behind white button text", () => {
    expect(contrastRatio(WHITE, rgb("destructive"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the arithmetic itself", () => {
  it("matches the known extremes", () => {
    expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
  });

  it("scores the primary on white at the figure axe reported live", () => {
    expect(contrastRatio(rgb("primary"), WHITE)).toBeCloseTo(5.17, 1);
  });

  it("applies the large-text threshold only where WCAG does", () => {
    expect(requiredRatio({ px: 16 })).toBe(4.5);
    expect(requiredRatio({ px: 24 })).toBe(3);
    expect(requiredRatio({ px: 19, bold: true })).toBe(3);
    expect(requiredRatio({ px: 19, bold: false })).toBe(4.5);
  });
});
