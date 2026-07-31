// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgencyStaff } from "@/features/agency/components/agency-staff.client";
import { useSession } from "@/features/auth/use-session.client";

/**
 * Staff management and its two server rules.
 *
 * A member may only grant roles STRICTLY BELOW their own, and the last active
 * owner cannot be demoted or removed (`409 last_owner_protected`). Both are
 * enforced server-side regardless of what renders — these tests are about the UI
 * not *inviting* a refusal, and not hiding one when it happens.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const OWNER = { id: "m1", email: "owner@agency.com", first_name: "Ada", last_name: "L", role: "owner", status: "active" };
const ADMIN = { id: "m2", email: "admin@agency.com", first_name: "", last_name: "", role: "admin", status: "active" };
const VIEWER = { id: "m3", email: "viewer@agency.com", first_name: "", last_name: "", role: "viewer", status: "invited" };

/** The role lookup matches the signed-in email against the roster. */
function mockRoster(members) {
  globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(members)));
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: { id: "u1", email: OWNER.email }, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("role granting", () => {
  it("offers an owner only the roles below owner", async () => {
    mockRoster([OWNER, ADMIN, VIEWER]);
    render(<AgencyStaff orgId="org-1" />);
    await screen.findByText(/add a colleague/i);

    const select = screen.getAllByRole("combobox")[0];
    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(["admin", "buyer", "viewer"]);
    expect(values).not.toContain("owner");
  });

  it("offers an admin only the roles below admin", async () => {
    useSession.setState({ user: { id: "u2", email: ADMIN.email } });
    mockRoster([OWNER, ADMIN, VIEWER]);
    render(<AgencyStaff orgId="org-1" />);
    await screen.findByText(/add a colleague/i);

    const values = [...screen.getAllByRole("combobox")[0].options].map((o) => o.value);
    expect(values).toEqual(["buyer", "viewer"]);
    expect(values).not.toContain("admin");
  });

  it("hides the invite form entirely from a viewer", async () => {
    useSession.setState({ user: { id: "u3", email: VIEWER.email } });
    mockRoster([OWNER, ADMIN, VIEWER]);
    render(<AgencyStaff orgId="org-1" />);
    await screen.findByText(OWNER.email);
    expect(screen.queryByText(/add a colleague/i)).toBeNull();
  });

  it("states which roles the viewer may grant", async () => {
    mockRoster([OWNER, ADMIN, VIEWER]);
    render(<AgencyStaff orgId="org-1" />);
    expect(await screen.findByText(/roles below your own \(owner\)/i)).toBeTruthy();
  });
});

describe("editing existing members", () => {
  /**
   * An owner row must not be editable by another owner-level actor through this
   * UI — `assignableRoles` excludes the viewer's own tier, so the row renders as
   * plain text rather than a control that would earn a 409.
   */
  it("does not offer a role control for a peer-level member", async () => {
    mockRoster([OWNER, ADMIN]);
    render(<AgencyStaff orgId="org-1" />);
    await screen.findByText(OWNER.email);
    expect(screen.queryByRole("combobox", { name: /role for owner@agency\.com/i })).toBeNull();
  });

  it("offers a role control for members below the viewer", async () => {
    mockRoster([OWNER, ADMIN]);
    render(<AgencyStaff orgId="org-1" />);
    await screen.findByText(ADMIN.email);
    expect(screen.getByRole("combobox", { name: /role for admin@agency\.com/i })).toBeTruthy();
  });

  it("labels the remove control per member, not just with an icon", async () => {
    mockRoster([OWNER, ADMIN]);
    render(<AgencyStaff orgId="org-1" />);
    await screen.findByText(ADMIN.email);
    expect(screen.getByRole("button", { name: /remove admin@agency\.com/i })).toBeTruthy();
  });
});

describe("display", () => {
  it("shows a name when there is one and falls back to the email", async () => {
    mockRoster([OWNER, ADMIN]);
    render(<AgencyStaff orgId="org-1" />);
    expect(await screen.findByText("Ada L")).toBeTruthy();
    expect(screen.getByText(ADMIN.email)).toBeTruthy();
  });

  it("surfaces a load failure with the server's message", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ error: { code: "internal_error", message: "Roster unavailable." } }, 500),
      ),
    );
    render(<AgencyStaff orgId="org-1" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Roster unavailable.")).toBeTruthy();
  });
});
