// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgencyProfile } from "@/features/agency/components/agency-profile.client";
import { useSession } from "@/features/auth/use-session.client";

/**
 * Read-only enforcement on the agency profile.
 *
 * `status` and the commission fields are read-only server-side — sending them is
 * accepted and silently DISCARDED, confirmed against the running backend. An
 * input that throws the typed value away is worse than no input, so these must
 * render as facts. That property is what's asserted here.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PROFILE = {
  id: "org-1",
  name: "Sunrise Travel",
  organization_type: "travel_agency",
  status: "active",
  billing_email: "ops@sunrise.test",
  support_email: "help@sunrise.test",
  country: "AE",
  default_commission_type: "percentage_bps",
  default_commission_value: 2000,
  commission_currency: "USD",
  created_at: "2026-07-28T17:56:40Z",
};

const MEMBERS = [{ id: "m1", email: "owner@agency.com", role: "owner", status: "active" }];

/** Roster first (role lookup), profile after. */
function mockAs(role) {
  const roster = [{ ...MEMBERS[0], role }];
  globalThis.fetch = vi.fn((url) =>
    Promise.resolve(
      jsonResponse(String(url).includes("/members/") ? roster : PROFILE),
    ),
  );
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: { id: "u1", email: "owner@agency.com" }, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("what is editable", () => {
  it("exposes exactly the four writable fields as inputs", async () => {
    mockAs("owner");
    render(<AgencyProfile orgId="org-1" />);
    await screen.findByDisplayValue("Sunrise Travel");

    const labels = screen
      .getAllByRole("textbox")
      .map((i) => i.closest("label")?.textContent?.trim().split("\n")[0]);
    expect(labels).toEqual([
      "Agency name",
      "Billing email",
      "Support email",
      "Country (ISO-2)",
    ]);
  });

  it("renders status and commission as facts, never as inputs", async () => {
    mockAs("owner");
    render(<AgencyProfile orgId="org-1" />);
    await screen.findByDisplayValue("Sunrise Travel");

    const inputLabels = screen
      .getAllByRole("textbox")
      .map((i) => (i.closest("label")?.textContent || "").toLowerCase());
    expect(inputLabels.some((l) => l.includes("status"))).toBe(false);
    expect(inputLabels.some((l) => l.includes("commission"))).toBe(false);

    // ...but both are still shown, under the platform-managed panel.
    expect(screen.getByText(/account status/i)).toBeTruthy();
    expect(screen.getByText(/commission rate/i)).toBeTruthy();
    expect(screen.getByText("20.00%")).toBeTruthy();
  });

  it("says who set the read-only values", async () => {
    mockAs("owner");
    render(<AgencyProfile orgId="org-1" />);
    await screen.findByDisplayValue("Sunrise Travel");
    expect(screen.getByText(/set by the platform/i)).toBeTruthy();
    expect(screen.getByText(/contact your account manager/i)).toBeTruthy();
  });
});

describe("role gating", () => {
  it("disables every field for a viewer and explains why", async () => {
    mockAs("viewer");
    render(<AgencyProfile orgId="org-1" />);
    await screen.findByDisplayValue("Sunrise Travel");

    expect(screen.getAllByRole("textbox").every((i) => i.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
    expect(screen.getByText(/only an owner or admin can change these details/i)).toBeTruthy();
  });

  it("lets an owner edit and save", async () => {
    mockAs("owner");
    render(<AgencyProfile orgId="org-1" />);
    await screen.findByDisplayValue("Sunrise Travel");
    expect(screen.getAllByRole("textbox").every((i) => !i.disabled)).toBe(true);
    expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy();
  });
});

describe("failure", () => {
  it("surfaces a load failure with the server's message", async () => {
    globalThis.fetch = vi.fn((url) =>
      Promise.resolve(
        String(url).includes("/members/")
          ? jsonResponse(MEMBERS)
          : jsonResponse({ error: { code: "internal_error", message: "Profile unavailable." } }, 500),
      ),
    );
    render(<AgencyProfile orgId="org-1" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Profile unavailable.")).toBeTruthy();
  });
});
