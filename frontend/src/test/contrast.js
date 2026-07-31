/**
 * WCAG contrast arithmetic, for asserting the design tokens themselves.
 *
 * This exists because jsdom has no paint, so axe's `color-contrast` rule can only
 * ever return "incomplete" there — and in a real browser it ALSO returns
 * "incomplete" for text on a gradient, because there is no single background
 * colour to measure. A genuine AA failure (white at 80% over the indigo hero,
 * 3.82:1 against a required 4.5:1) sat on the homepage behind a clean axe run for
 * exactly that reason. Tokens are checkable without a renderer, so they are.
 */

/** "#615de5" → [97, 93, 229]. Accepts 3- or 6-digit hex. */
export function hexToRgb(hex) {
  const value = String(hex).trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** Composite a translucent foreground over an opaque background. */
export function composite(fg, alpha, bg) {
  return [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha)));
}

export function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG "large text": ≥24px, or ≥18.66px when bold. */
export function requiredRatio({ px = 16, bold = false } = {}) {
  return px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
}

/** Read `--color-*` custom properties out of the stylesheet source. */
export function readColorTokens(css) {
  const tokens = {};
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}
