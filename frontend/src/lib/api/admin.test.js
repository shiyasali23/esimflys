import { describe, it, expect } from "vitest";
import {
  allowedTransitions,
  canRetry,
  hasPricingVisibility,
  readBulkResult,
} from "@/lib/api/admin";

/**
 * The admin rules that fail silently rather than loudly. Each of these would
 * render a plausible but wrong screen, so each is pinned here.
 */

describe("readBulkResult", () => {
  // Plans report successes under `updated`, commissions under `approved`.
  // Reading only one key reports zero successes for the other endpoint.
  it("reads the plans key", () => {
    const r = readBulkResult({ updated: ["a", "b"], failed: [], status: "active" });
    expect(r.succeeded).toEqual(["a", "b"]);
    expect(r.failed).toEqual([]);
  });

  it("reads the commissions key", () => {
    const r = readBulkResult({ approved: ["c"], failed: [] });
    expect(r.succeeded).toEqual(["c"]);
  });

  // Bulk endpoints never abort — partial success must be surfaced, not hidden.
  it("flags partial success so the UI can report both halves", () => {
    const r = readBulkResult({
      updated: ["ok-1"],
      failed: [{ id: "bad-1", error: "not found" }],
    });
    expect(r.partial).toBe(true);
    expect(r.succeeded).toHaveLength(1);
    expect(r.failed[0].error).toBe("not found");
  });

  it("is not partial when everything failed", () => {
    const r = readBulkResult({
      updated: [],
      failed: [{ id: "x", error: "A plan in state 'active' cannot be activated." }],
    });
    expect(r.partial).toBe(false);
    expect(r.failed).toHaveLength(1);
  });

  it("degrades safely on an unexpected body", () => {
    expect(readBulkResult(null)).toEqual({ succeeded: [], failed: [], partial: false });
    expect(readBulkResult({}).succeeded).toEqual([]);
  });
});

describe("hasPricingVisibility", () => {
  /**
   * The keys are POPPED for roles without pricing capability, so presence — not
   * truthiness — is the test. A `margin` of 0 is real data and must not read as
   * "no permission".
   */
  it("detects the key rather than its value", () => {
    expect(hasPricingVisibility({ margin: { margin_minor: 0 } })).toBe(true);
    expect(hasPricingVisibility({ margin: null })).toBe(true);
  });

  it("is false when the key is absent, as for support_admin", () => {
    expect(hasPricingVisibility({ revenue: {}, orders: {} })).toBe(false);
    expect(hasPricingVisibility(null)).toBe(false);
  });
});

describe("allowedTransitions", () => {
  // Offering an illegal move just earns a 409 the user cannot act on.
  it("offers only the legal next states", () => {
    expect(allowedTransitions("active").map((t) => t.target)).toEqual(["suspended", "closed"]);
    expect(allowedTransitions("suspended").map((t) => t.target)).toEqual(["active", "closed"]);
    expect(allowedTransitions("pending").map((t) => t.target)).toEqual([
      "active",
      "rejected",
      "closed",
    ]);
  });

  it("treats closed as terminal", () => {
    expect(allowedTransitions("closed")).toEqual([]);
  });

  it("uses approve to activate a pending agency, not activate", () => {
    const toActive = allowedTransitions("pending").find((t) => t.target === "active");
    expect(toActive.verb).toBe("approve");
    const reactivate = allowedTransitions("suspended").find((t) => t.target === "active");
    expect(reactivate.verb).toBe("activate");
  });

  it("marks suspend as requiring a reason", () => {
    expect(allowedTransitions("active").find((t) => t.target === "suspended").requiresReason).toBe(
      true,
    );
    expect(allowedTransitions("active").find((t) => t.target === "closed").requiresReason).toBe(
      false,
    );
  });

  it("returns nothing for an unknown status instead of guessing", () => {
    expect(allowedTransitions("weird")).toEqual([]);
  });
});

describe("canRetry", () => {
  // Retrying a succeeded provision could buy a second eSIM — the server 409s.
  it("allows retry only from recoverable states", () => {
    for (const status of ["failed", "manual_review", "retrying"]) {
      expect(canRetry({ status })).toBe(true);
    }
  });

  it("refuses retry on a completed or in-flight job", () => {
    expect(canRetry({ status: "succeeded" })).toBe(false);
    expect(canRetry({ status: "pending" })).toBe(false);
    expect(canRetry(null)).toBe(false);
  });
});
