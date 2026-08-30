import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The fixed header is cleared by a top padding on every page shell. Two sections then
 * CANCEL that padding with an equal negative margin so their background can bleed to the
 * top of the viewport behind the floating nav.
 *
 * That makes the two numbers a matched pair. Change the shell's padding alone and the
 * cancelling section slides up by the difference, putting its first heading underneath
 * the header — on the home page that is the H1, and it is invisible rather than merely
 * misaligned. Nothing in the type system or in a render test connects these two files,
 * so the coupling is asserted here on the source text.
 */
const SHELLS = [
  "src/app/not-found.js",
  "src/app/(marketing)/layout.js",
  "src/app/(shop)/layout.js",
  "src/app/(support)/layout.js",
  "src/app/(legal)/layout.js",
];

const CANCELLERS = [
  "src/features/home/components/hero.jsx",
  "src/app/(support)/supported-devices/page.js",
];

const read = (path) => readFileSync(path, "utf8");

describe("fixed-header offset", () => {
  it("every shell uses the same top padding", () => {
    for (const shell of SHELLS) {
      expect(read(shell), shell).toContain('className="pt-16 sm:pt-20"');
    }
  });

  it("every cancelling section negates exactly that padding, at both breakpoints", () => {
    for (const file of CANCELLERS) {
      const source = read(file);
      expect(source, file).toContain("-mt-16");
      expect(source, file).toContain("sm:-mt-20");
    }
  });

  it("no shell still carries the old unconditional pt-20", () => {
    // `pt-20` with no `sm:` prefix would leave the mobile header's 24px of dead space
    // back in place while the cancellers pull up by only 16.
    for (const shell of SHELLS) {
      expect(read(shell), shell).not.toMatch(/className="pt-20"/);
    }
  });

  it("no section still carries the old unconditional -mt-20", () => {
    for (const file of CANCELLERS) {
      expect(read(file), file).not.toMatch(/\s-mt-20[\s"]/);
    }
  });
});
