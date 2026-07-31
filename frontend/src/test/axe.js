import axe from "axe-core";

/**
 * WCAG 2.2 AA is the gate (CLAUDE.md §2), so only those rule tags run — axe's
 * "best-practice" tags flag things that are not conformance failures.
 *
 * `color-contrast` is disabled here because jsdom has no layout or paint: it
 * cannot resolve a computed colour, so the rule can only ever return "incomplete"
 * and would give false confidence. Contrast is checked in the real browser
 * instead (Phase D2).
 */
const OPTIONS = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  rules: { "color-contrast": { enabled: false } },
};

function describeViolation(violation) {
  const where = violation.nodes
    .slice(0, 3)
    .map((node) => `      ${node.target.join(" ")}\n        ${node.failureSummary?.split("\n").join("\n        ")}`)
    .join("\n");
  return `  [${violation.impact}] ${violation.id} — ${violation.help}\n${where}`;
}

/**
 * Assert a rendered container has no WCAG AA violations.
 * Throws with the rule, impact and offending selectors so a failure is actionable.
 */
export async function expectNoAxeViolations(container) {
  const results = await axe.run(container, OPTIONS);
  if (results.violations.length) {
    const detail = results.violations.map(describeViolation).join("\n");
    throw new Error(
      `${results.violations.length} accessibility violation(s):\n${detail}`,
    );
  }
  return results;
}
