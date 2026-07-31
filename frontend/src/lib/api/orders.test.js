import { describe, it, expect } from "vitest";
import { isDelivered, isPaid, isTerminalFailure } from "@/lib/api/orders";
import { statusTone } from "@/components/data/status-badge";

describe("order state predicates", () => {
  it("recognises a settled, fulfilled order", () => {
    const order = { payment_status: "paid", fulfillment_status: "delivered" };
    expect(isPaid(order)).toBe(true);
    expect(isDelivered(order)).toBe(true);
    expect(isTerminalFailure(order)).toBe(false);
  });

  // Polling must not stop while the order can still progress.
  it("does not treat in-flight states as final", () => {
    expect(isTerminalFailure({ payment_status: "pending", fulfillment_status: "pending" })).toBe(false);
    expect(isTerminalFailure({ payment_status: "processing", fulfillment_status: "processing" })).toBe(false);
    expect(isPaid({ payment_status: "processing" })).toBe(false);
  });

  // ...and must stop when waiting can no longer change the outcome.
  it("treats failure, cancellation and refunds as final", () => {
    expect(isTerminalFailure({ payment_status: "failed" })).toBe(true);
    expect(isTerminalFailure({ payment_status: "cancelled" })).toBe(true);
    expect(isTerminalFailure({ payment_status: "refunded" })).toBe(true);
    expect(isTerminalFailure({ fulfillment_status: "failed" })).toBe(true);
  });

  it("is safe on a missing order", () => {
    expect(isPaid(null)).toBe(false);
    expect(isDelivered(undefined)).toBe(false);
    expect(isTerminalFailure(null)).toBe(false);
  });
});

describe("statusTone", () => {
  it("greens the states that mean success", () => {
    for (const s of ["paid", "delivered", "fulfilled", "ready", "active", "approved"]) {
      expect(statusTone(s)).toBe("success");
    }
  });

  it("flags the states that need attention", () => {
    for (const s of ["failed", "suspended", "manual_review", "reversed", "cancelled"]) {
      expect(statusTone(s)).toBe("attention");
    }
  });

  it("keeps in-flight states neutral", () => {
    for (const s of ["pending", "provisioning", "retrying", "processing"]) {
      expect(statusTone(s)).toBe("neutral");
    }
  });

  // A status added on the backend must not break a table.
  it("degrades unknown values to neutral", () => {
    expect(statusTone("some_new_status")).toBe("neutral");
    expect(statusTone(null)).toBe("neutral");
  });
});
