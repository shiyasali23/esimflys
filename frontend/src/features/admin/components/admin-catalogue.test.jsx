// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminCatalogue } from "@/features/admin/components/admin-catalogue.client";

/**
 * Catalogue management.
 *
 * Two rules that fail quietly:
 *  - plan status changes are ACTIONS (`POST …/activate|pause/`), never PATCH;
 *  - bulk endpoints don't abort, they report per-item outcomes — and the success
 *    key is `updated` here but `approved` for commissions. Reading one key only
 *    would report zero successes for the other endpoint.
 *
 * Pricing columns are also conditional: `wholesale_amount_minor` and
 * `margin_minor` are popped for roles without pricing capability.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PLAN = {
  id: "p1",
  product_code: "SA-10GB-30D-V1",
  display_name: "Saudi Arabia 10 GB — 30 Days",
  country_iso2: "SA",
  country_name: "Saudi Arabia",
  plan_type: "fixed",
  data_limit_mb: 10000,
  daily_high_speed_mb: null,
  validity_days: 30,
  retail_amount_minor: 1499,
  status: "paused",
};

const PLAN_WITH_PRICING = {
  ...PLAN,
  wholesale_amount_minor: 700,
  margin_minor: 799,
};

const listBody = (results) => ({ count: results.length, next: null, previous: null, results });

function mockApi({ plans = [PLAN], bulk } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method === "POST") {
      return Promise.resolve(bulk ? bulk() : jsonResponse({ updated: ["p1"], failed: [], status: "active" }));
    }
    return Promise.resolve(jsonResponse(listBody(plans)));
  });
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("pricing columns follow capability", () => {
  it("shows margin when the keys are present", async () => {
    mockApi({ plans: [PLAN_WITH_PRICING] });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toContain("Margin");
  });

  // The keys are ABSENT for support/finance — reading them would throw.
  it("omits the margin column entirely when the keys are absent", async () => {
    mockApi({ plans: [PLAN] });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).not.toContain("Margin");
    expect(document.body.textContent).not.toContain("7.99");
  });
});

describe("status is changed by action, not by editing a field", () => {
  it("offers activate for a paused plan and posts to the action endpoint", async () => {
    mockApi({ plans: [PLAN] });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");

    await userEvent.click(screen.getByRole("button", { name: /^activate$/i }));

    await waitFor(() => {
      const posts = globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");
      expect(posts.length).toBeGreaterThan(0);
      expect(String(posts[0][0])).toContain("/plans/p1/activate/");
    });
  });

  it("does not offer activate for a plan that is already active", async () => {
    mockApi({ plans: [{ ...PLAN, status: "active" }] });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    expect(screen.queryByRole("button", { name: /^activate$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^pause$/i })).toBeTruthy();
  });
});

describe("bulk results", () => {
  it("reports successes from the plans key", async () => {
    mockApi({
      plans: [PLAN],
      bulk: () => jsonResponse({ updated: ["p1", "p2"], failed: [], status: "active" }),
    });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");

    await userEvent.click(screen.getByRole("checkbox", { name: /select sa-10gb/i }));
    await userEvent.click(
      within(screen.getByText(/1 selected/i).closest("div")).getByRole("button", { name: /^activate$/i }),
    );

    expect(await screen.findByText(/updated 2 plan/i)).toBeTruthy();
  });

  /**
   * Bulk never aborts. An operator who activated 1 of 2 must see BOTH halves —
   * hiding the refusal reads as total success.
   */
  it("shows partial success and the reason each item refused", async () => {
    mockApi({
      plans: [PLAN],
      bulk: () =>
        jsonResponse({
          updated: ["p1"],
          failed: [{ id: "p2", error: "A plan in state 'active' cannot be activated." }],
          status: "active",
        }),
    });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");

    await userEvent.click(screen.getByRole("checkbox", { name: /select sa-10gb/i }));
    await userEvent.click(
      within(screen.getByText(/1 selected/i).closest("div")).getByRole("button", { name: /^activate$/i }),
    );

    expect(await screen.findByText(/updated 1 plan/i)).toBeTruthy();
    expect(screen.getByText(/1 refused/i)).toBeTruthy();
    expect(
      screen.getByText(/A plan in state 'active' cannot be activated\./i),
    ).toBeTruthy();
  });

  it("reports an all-failed batch as failure, not silence", async () => {
    mockApi({
      plans: [PLAN],
      bulk: () =>
        jsonResponse({
          updated: [],
          failed: [{ id: "p1", error: "not found" }],
          status: "active",
        }),
    });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");

    await userEvent.click(screen.getByRole("checkbox", { name: /select sa-10gb/i }));
    await userEvent.click(
      within(screen.getByText(/1 selected/i).closest("div")).getByRole("button", { name: /^activate$/i }),
    );

    expect(await screen.findByText(/1 refused/i)).toBeTruthy();
    expect(screen.queryByText(/updated \d+ plan/i)).toBeNull();
  });
});

describe("selection", () => {
  it("offers bulk actions only once something is selected", async () => {
    mockApi({ plans: [PLAN] });
    render(<AdminCatalogue />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");

    expect(screen.queryByText(/1 selected/i)).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: /select sa-10gb/i }));
    expect(screen.getByText(/1 selected/i)).toBeTruthy();
  });
});
