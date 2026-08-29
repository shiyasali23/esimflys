// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminAgencies } from "@/features/admin/components/admin-agencies.client";

/**
 * Organization lifecycle.
 *
 * Status is not a field: `PATCH {status}` is accepted and silently discarded, so
 * every change goes through an action endpoint. Only legal moves may be offered —
 * anything else earns a 409 the operator cannot act on — and suspending REQUIRES
 * a reason, which the server enforces and the audit trail records.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const org = (overrides) => ({
  id: "org-1",
  name: "Sunrise Travel",
  organization_type: "travel_agency",
  billing_email: "ops@sunrise.test",
  country: "AE",
  status: "active",
  member_count: 3,
  suspension_reason: null,
  ...overrides,
});

const listBody = (results) => ({ count: results.length, next: null, previous: null, results });

function mockApi(orgs, action) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method === "POST") return Promise.resolve(action ? action() : jsonResponse({}));
    return Promise.resolve(jsonResponse(listBody(orgs)));
  });
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("only legal transitions are offered", () => {
  it("an active agency can be suspended or closed — not approved", async () => {
    mockApi([org({ status: "active" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    expect(screen.getByRole("button", { name: /^suspend$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^close$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
  });

  it("a pending agency is approved, not activated", async () => {
    mockApi([org({ status: "pending" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    expect(screen.getByRole("button", { name: /^approve$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^activate$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeTruthy();
  });

  it("a suspended agency is reactivated with activate", async () => {
    mockApi([org({ status: "suspended" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    expect(screen.getByRole("button", { name: /^activate$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
  });

  it("a closed agency offers nothing — it is terminal", async () => {
    mockApi([org({ status: "closed" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    expect(screen.getByText(/terminal/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^close$/i })).toBeNull();
  });
});

describe("suspension requires a reason", () => {
  it("asks for one instead of firing the request", async () => {
    mockApi([org({ status: "active" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));

    expect(await screen.findByLabelText(/reason/i)).toBeTruthy();
    const posts = globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(posts).toHaveLength(0);
  });

  it("explains the consequence before the operator commits", async () => {
    mockApi([org({ status: "active" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));
    expect(await screen.findByText(/stops their commission on new sales/i)).toBeTruthy();
    expect(screen.getByText(/recorded in the audit trail/i)).toBeTruthy();
  });

  it("sends the reason to the suspend action once given", async () => {
    mockApi([org({ status: "active" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));
    const reason = await screen.findByLabelText(/reason/i);
    await userEvent.type(reason, "fraud review");

    // Scoped to the form: the row's Suspend button is also on screen, and it
    // re-opens the prompt rather than submitting it.
    const submit = within(reason.closest("form")).getByRole("button", { name: /^suspend$/i });
    await userEvent.click(submit);

    await waitFor(() => {
      const posts = globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");
      expect(posts.length).toBeGreaterThan(0);
      expect(String(posts[0][0])).toContain("/organizations/org-1/suspend/");
      expect(JSON.parse(posts[0][1].body)).toEqual({ reason: "fraud review" });
    });
  });

  it("can be abandoned without acting", async () => {
    mockApi([org({ status: "active" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByLabelText(/reason/i)).toBeNull());
    expect(globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(0);
  });
});

describe("refusals", () => {
  /**
   * The 409 message names which transitions ARE allowed, so it is shown verbatim
   * rather than replaced with something vaguer.
   */
  it("surfaces the server's explanation of an illegal move", async () => {
    mockApi([org({ status: "active" })], () =>
      jsonResponse(
        {
          error: {
            code: "invalid_status_transition",
            message: "An organization in state 'active' cannot be approved.",
          },
        },
        409,
      ),
    );
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText("An organization in state 'active' cannot be approved."),
    ).toBeTruthy();
  });
});

describe("display", () => {
  it("shows why an agency is suspended, not just that it is", async () => {
    mockApi([org({ status: "suspended", suspension_reason: "fraud review" })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");
    expect(screen.getByText("fraud review")).toBeTruthy();
  });
});

describe("demo agencies", () => {
  /**
   * A demo agency is excluded from every platform figure, so from this row it looks
   * exactly like a real agency that has sold nothing. The badge is what stops an
   * operator investigating a discrepancy that is intentional.
   */
  it("labels an agency whose sales are excluded from the platform totals", async () => {
    mockApi([org({ is_demo: true })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");
    expect(screen.getByText(/^demo$/i)).toBeTruthy();
  });

  it("does not label a real agency", async () => {
    mockApi([org({ is_demo: false })]);
    render(<AdminAgencies />);
    await screen.findByText("Sunrise Travel");
    expect(screen.queryByText(/^demo$/i)).toBeNull();
  });
});
