// @vitest-environment jsdom
/* eslint-disable jsx-a11y/alt-text, @next/next/no-img-element --
   The markup below is broken on purpose: it is the fixture that proves the axe
   harness still fails when it should. */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { expectNoAxeViolations } from "@/test/axe";

/**
 * The a11y harness, checked against itself.
 *
 * A misconfigured axe run reports zero violations and every screen "passes" —
 * indistinguishable from a genuinely clean codebase. These cases fail loudly if
 * the harness ever stops actually running.
 */
describe("the axe harness catches real violations", () => {
  it("an image with no alt text", async () => {
    const { container } = render(<img src="/x.png" />);
    await expect(expectNoAxeViolations(container)).rejects.toThrow(/image-alt/);
  });

  it("an input with no label", async () => {
    const { container } = render(<input type="text" />);
    await expect(expectNoAxeViolations(container)).rejects.toThrow(/label/);
  });

  it("a button with no accessible name", async () => {
    const { container } = render(<button type="button" />);
    await expect(expectNoAxeViolations(container)).rejects.toThrow(/button-name/);
  });

  it("a select with no accessible name", async () => {
    const { container } = render(
      <select>
        <option>a</option>
      </select>,
    );
    await expect(expectNoAxeViolations(container)).rejects.toThrow(/select-name/);
  });

  it("reports the rule, its impact and the offending selector", async () => {
    const { container } = render(<img src="/x.png" />);
    const error = await expectNoAxeViolations(container).catch((e) => e);
    expect(error.message).toMatch(/\[critical\]/);
    expect(error.message).toMatch(/img/);
  });
});

/**
 * The run is scoped to WCAG A/AA tags. Axe's "best-practice" rules flag things
 * that are not conformance failures, and treating them as gate failures makes the
 * suite noisy enough to start ignoring.
 */
describe("the harness is scoped to WCAG A/AA", () => {
  it("does not fail on a best-practice-only rule", async () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <th />
            <td>x</td>
          </tr>
        </tbody>
      </table>,
    );
    // `empty-table-header` is best-practice, not WCAG — deliberately out of scope.
    await expect(expectNoAxeViolations(container)).resolves.toBeTruthy();
  });
});
