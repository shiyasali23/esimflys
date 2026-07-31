// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AdminDashboard } from "@/features/admin/components/admin-dashboard.client";

/**
 * The role-gating rule that fails hardest if got wrong.
 *
 * `margin`, `wholesale_amount_minor` and `margin_minor` are POPPED from the
 * payload for roles without pricing capability — the keys are absent, not null.
 * Reading `data.margin.margin_minor` therefore throws for support and finance
 * admins, taking the entire dashboard down rather than hiding one section.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const BASE = {
  currency: "USD",
  revenue: { gross_minor: 10294, refunded_minor: 0, net_minor: 10294 },
  orders: { total: 31, paid: 5, by_status: { fulfilled: 4 } },
  esims: { total: 6, live: 6, failed: 0 },
  commissions: { outstanding_minor: 679, paid_minor: 0, reversed_minor: 0 },
  operations: {
    supplier_jobs_pending: 0,
    supplier_jobs_manual_review: 0,
    notifications_failed: 0,
    webhooks_rejected: 0,
  },
};

const WITH_MARGIN = {
  ...BASE,
  margin: { retail_minor: 9794, wholesale_minor: 4678, margin_minor: 5116 },
};

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("with pricing capability (platform_admin)", () => {
  it("shows the economics section", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(WITH_MARGIN));
    render(<AdminDashboard />);
    expect(await screen.findByText(/platform economics/i)).toBeTruthy();
  });

  it("renders the margin figures from minor units", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(WITH_MARGIN));
    render(<AdminDashboard />);
    await screen.findByText(/platform economics/i);
    // 5116 minor → $51.16
    expect(screen.getAllByText("$51.16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$46.78").length).toBeGreaterThan(0);
  });
});

describe("without pricing capability (support_admin / finance)", () => {
  /**
   * The regression this file exists for: the page must survive the key being
   * gone, not crash on a property read.
   */
  it("renders the rest of the dashboard when `margin` is absent", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(BASE));
    render(<AdminDashboard />);
    expect(await screen.findByText(/revenue/i)).toBeTruthy();
    expect(screen.getByText(/operations/i)).toBeTruthy();
  });

  // Matched on the heading, not free text: the fallback copy also contains the
  // phrase "Platform economics", so a text query passes in both branches.
  it("hides the economics section and says why", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(BASE));
    render(<AdminDashboard />);
    await screen.findByText(/revenue/i);
    expect(screen.queryByRole("heading", { name: /platform economics/i })).toBeNull();
    expect(screen.getByText(/hidden for your role/i)).toBeTruthy();
  });

  it("leaks no wholesale or margin figure anywhere on the page", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(BASE));
    render(<AdminDashboard />);
    await screen.findByText(/revenue/i);
    expect(document.body.textContent).not.toContain("46.78");
    expect(document.body.textContent).not.toContain("51.16");
  });

  // Presence, not truthiness: a genuine margin of zero is data, not a denial.
  it("treats a zero margin as visible data, not a missing permission", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ ...BASE, margin: { retail_minor: 0, wholesale_minor: 0, margin_minor: 0 } }),
    );
    render(<AdminDashboard />);
    expect(await screen.findByText(/platform economics/i)).toBeTruthy();
    expect(screen.queryByText(/hidden for your role/i)).toBeNull();
  });
});

describe("failure and alerting", () => {
  it("renders the server message rather than a blank panel", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "internal_error", message: "Upstream failed." } }, 500),
    );
    render(<AdminDashboard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Upstream failed.")).toBeTruthy();
  });

  it("flags operational trouble instead of burying it in a count", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({
        ...BASE,
        esims: { total: 6, live: 5, failed: 1 },
        operations: { ...BASE.operations, supplier_jobs_manual_review: 2 },
      }),
    );
    const { container } = render(<AdminDashboard />);
    await screen.findByText(/operations/i);
    await waitFor(() =>
      expect(container.querySelectorAll(".text-destructive").length).toBeGreaterThan(0),
    );
  });
});
