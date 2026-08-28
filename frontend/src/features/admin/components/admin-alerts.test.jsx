// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminDashboard } from "@/features/admin/components/admin-dashboard.client";

/**
 * The alert strip.
 *
 * These counters were already on the dashboard when a 100% email failure ran unnoticed
 * for weeks: five customers paid and none received a QR code, while "Notifications
 * failed: 10" sat as one tile among twelve numbers. A number is not a warning.
 *
 * So the tests that matter are the two ends — it must say what is wrong in a sentence
 * when something is, and it must be completely absent when nothing is. An alert strip
 * that is always on screen is furniture, and gets ignored exactly like the tiles did.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const dashboard = (operations) => ({
  currency: "USD",
  revenue: { gross_minor: 1000, refunded_minor: 0, net_minor: 1000 },
  orders: { total: 5, paid: 5, by_status: {}, by_payment_status: {} },
  esims: { total: 5, live: 5, failed: 0 },
  commissions: { outstanding_minor: 0, paid_minor: 0, reversed_minor: 0 },
  operations: {
    supplier_jobs_pending: 0,
    supplier_jobs_manual_review: 0,
    notifications_failed: 0,
    webhooks_rejected: 0,
    webhooks_bad_signature: 0,
    paid_without_esim: 0,
    ...operations,
  },
});

function mockApi(operations) {
  globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(dashboard(operations))));
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("when something is wrong", () => {
  it("names undelivered paid orders in a sentence, not a number", async () => {
    mockApi({ paid_without_esim: 2 });
    render(<AdminDashboard />);
    expect(await screen.findByText(/were charged and have nothing/i)).toBeTruthy();
  });

  it("explains a signature failure as the secret not matching", async () => {
    mockApi({ webhooks_bad_signature: 3 });
    render(<AdminDashboard />);
    expect(await screen.findByText(/secret does not match the sender/i)).toBeTruthy();
  });

  it("says QR codes are not reaching customers when email fails", async () => {
    mockApi({ notifications_failed: 10 });
    render(<AdminDashboard />);
    expect(await screen.findByText(/QR codes are not reaching customers/i)).toBeTruthy();
  });

  it("says provisioning will not retry on its own", async () => {
    mockApi({ supplier_jobs_manual_review: 1 });
    render(<AdminDashboard />);
    expect(await screen.findByText(/will not retry on its own/i)).toBeTruthy();
  });

  it("links each alert to the screen that can act on it", async () => {
    mockApi({ webhooks_bad_signature: 1 });
    render(<AdminDashboard />);
    const link = await screen.findByRole("link", { name: /secret does not match/i });
    expect(link.getAttribute("href")).toBe("/superuser/webhooks");
  });

  it("shows every distinct problem, not just the first", async () => {
    mockApi({ paid_without_esim: 1, notifications_failed: 4 });
    render(<AdminDashboard />);
    expect(await screen.findByText(/were charged and have nothing/i)).toBeTruthy();
    expect(screen.getByText(/QR codes are not reaching customers/i)).toBeTruthy();
  });
});

describe("when nothing is wrong", () => {
  /**
   * The most important test here. A strip that is always present is furniture, and
   * furniture is what the tiles became.
   */
  it("renders no alert section at all", async () => {
    mockApi();
    render(<AdminDashboard />);
    await screen.findByText(/operations/i);
    expect(screen.queryByText(/needs attention/i)).toBeNull();
  });

  it("does not warn about jobs that are merely queued", async () => {
    /** Pending work is normal. Only work that has STOPPED deserves a warning. */
    mockApi({ supplier_jobs_pending: 25 });
    render(<AdminDashboard />);
    await screen.findByText(/operations/i);
    expect(screen.queryByText(/needs attention/i)).toBeNull();
  });
});
