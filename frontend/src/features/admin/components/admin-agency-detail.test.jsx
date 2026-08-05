// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminAgencyDetail } from "@/features/admin/components/admin-agency-detail.client";

/**
 * One agency: profile, staff, tracking codes.
 *
 * Three contracts fail quietly if broken:
 *  - lifecycle is an ACTION (`POST …/suspend/`), never `PATCH {status}` — the
 *    detail serializer accepts the field and discards it;
 *  - members and tracking codes come back as PLAIN ARRAYS, not `{results}`;
 *  - a tracking code carries NO discount, so no discount input may ever appear.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ORG = {
  id: "org-1",
  name: "Sunrise Travel",
  organization_type: "travel_agency",
  billing_email: "ops@sunrise.test",
  country: "AE",
  status: "active",
  member_count: 2,
  suspension_reason: null,
};

const MEMBERS = [
  {
    id: "m1",
    email: "owner@sunrise.test",
    first_name: "Dana",
    last_name: "Reyes",
    role: "owner",
    status: "active",
    created_at: "2026-01-04T10:00:00Z",
  },
  {
    id: "m2",
    email: "agent@sunrise.test",
    first_name: "",
    last_name: "",
    role: "viewer",
    status: "active",
    created_at: "2026-02-11T10:00:00Z",
  },
];

const CODES = [
  {
    id: "c1",
    code: "SUNRISE20",
    commission_type: "percentage_bps",
    commission_value: 2000,
    usage_limit: null,
    redemption_count: 7,
    is_active: true,
  },
];

function mockApi({ org = ORG, members = MEMBERS, codes = CODES, write } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    const href = String(url);
    if (init?.method && init.method !== "GET") {
      return Promise.resolve(write ? write(href, init) : new Response(null, { status: 204 }));
    }
    if (href.includes("/members/")) return Promise.resolve(jsonResponse(members));
    if (href.includes("/tracking-codes/")) return Promise.resolve(jsonResponse(codes));
    if (org instanceof Response) return Promise.resolve(org.clone());
    return Promise.resolve(jsonResponse(org));
  });
}

const writes = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method && c[1].method !== "GET");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("profile", () => {
  it("reads the plain-array member and code lists rather than a paginated envelope", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);

    expect(await screen.findByText("Sunrise Travel")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /staff \(2\)/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /tracking codes \(1\)/i })).toBeTruthy();
  });

  it("says why an agency is suspended, not just that it is", async () => {
    mockApi({ org: { ...ORG, status: "suspended", suspension_reason: "fraud review" } });
    render(<AdminAgencyDetail orgId="org-1" />);
    expect(await screen.findByText("fraud review")).toBeTruthy();
  });

  it("offers a way back instead of a dead end when the agency is gone", async () => {
    mockApi({ org: jsonResponse({ detail: "Not found." }, 404) });
    render(<AdminAgencyDetail orgId="org-1" />);
    expect(await screen.findByText(/agency not found/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to agencies/i })).toBeTruthy();
  });
});

describe("lifecycle is an action, not a field edit", () => {
  it("only offers the moves legal from the current state", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    expect(screen.getByRole("button", { name: /^suspend$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^close$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
  });

  it("posts to the action endpoint, never PATCHing status", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [href, init] = writes()[0];
    expect(init.method).toBe("POST");
    expect(String(href)).toContain("/organizations/org-1/close/");
  });

  it("requires a reason before it will suspend", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^suspend$/i }));
    expect(writes()).toHaveLength(0);

    const reason = await screen.findByLabelText(/reason/i);
    await userEvent.type(reason, "fraud review");
    await userEvent.click(screen.getByRole("button", { name: /confirm suspend/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    expect(JSON.parse(writes()[0][1].body)).toEqual({ reason: "fraud review" });
  });

  it("says plainly that a closed agency has nowhere left to go", async () => {
    mockApi({ org: { ...ORG, status: "closed" } });
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    expect(screen.getByText(/no further lifecycle changes/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^close$/i })).toBeNull();
  });

  // The 409 names which moves ARE allowed — replacing it with something vaguer
  // leaves the operator with no next step.
  it("shows the server's refusal verbatim", async () => {
    mockApi({
      write: () =>
        jsonResponse(
          {
            error: {
              code: "invalid_status_transition",
              message: "An organization in state 'active' cannot be approved.",
            },
          },
          409,
        ),
    });
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(
      await screen.findByText("An organization in state 'active' cannot be approved."),
    ).toBeTruthy();
  });
});

describe("staff", () => {
  it("falls back to the email when a member has no name on file", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    expect(screen.getByText("Dana Reyes")).toBeTruthy();
    expect(screen.getByText("agent@sunrise.test")).toBeTruthy();
  });

  it("adds by email and role", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    const form = screen.getByLabelText(/email address/i).closest("form");
    await userEvent.type(within(form).getByLabelText(/email address/i), "new@sunrise.test");
    await userEvent.selectOptions(within(form).getByLabelText(/^role$/i), "buyer");
    await userEvent.click(within(form).getByRole("button", { name: /add/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [href, init] = writes()[0];
    expect(String(href)).toContain("/organizations/org-1/members/");
    expect(JSON.parse(init.body)).toEqual({ email: "new@sunrise.test", role: "buyer" });
  });

  /**
   * The backend adds an EXISTING user; there is no invite flow. A bare 404 would
   * read as "the agency is missing", which is the wrong thing to go fix.
   */
  it("explains a 404 as the person having no account yet", async () => {
    mockApi({ write: () => jsonResponse({ detail: "Not found." }, 404) });
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    const form = screen.getByLabelText(/email address/i).closest("form");
    await userEvent.type(within(form).getByLabelText(/email address/i), "ghost@sunrise.test");
    await userEvent.click(within(form).getByRole("button", { name: /add/i }));

    expect(await screen.findByText(/needs an eSIMFlys account/i)).toBeTruthy();
  });

  it("changes a role by PATCH on that member", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.selectOptions(screen.getByLabelText(/role for agent@sunrise\.test/i), "admin");

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [href, init] = writes()[0];
    expect(init.method).toBe("PATCH");
    expect(String(href)).toContain("/organizations/org-1/members/m2/");
    expect(JSON.parse(init.body)).toEqual({ role: "admin" });
  });

  it("removes a member by DELETE on that member", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /remove agent@sunrise\.test/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [href, init] = writes()[0];
    expect(init.method).toBe("DELETE");
    expect(String(href)).toContain("/organizations/org-1/members/m2/");
  });

  // An agency must keep an owner; the server refuses and explains why.
  it("surfaces the last-owner refusal", async () => {
    mockApi({
      write: () =>
        jsonResponse(
          {
            error: {
              code: "last_owner_protected",
              message: "An organization must keep at least one owner.",
            },
          },
          409,
        ),
    });
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    await userEvent.click(screen.getByRole("button", { name: /remove owner@sunrise\.test/i }));

    expect(
      await screen.findByText("An organization must keep at least one owner."),
    ).toBeTruthy();
  });
});

describe("tracking codes", () => {
  /**
   * A database constraint forbids a discount on these codes. An input for one
   * would collect a value the server can only reject.
   */
  it("offers no discount field, and says the customer pays full price", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    expect(screen.queryByLabelText(/discount/i)).toBeNull();
    expect(screen.getByText(/no discount/i)).toBeTruthy();
  });

  it("issues a code with commission in basis points", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    const form = screen.getByLabelText(/^code$/i).closest("form");
    await userEvent.type(within(form).getByLabelText(/^code$/i), "monsoon25");
    await userEvent.click(within(form).getByRole("button", { name: /issue code/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [href, init] = writes()[0];
    expect(String(href)).toContain("/organizations/org-1/tracking-codes/");
    // Upper-cased so the operator's casing can't create a near-duplicate code.
    expect(JSON.parse(init.body)).toMatchObject({ code: "MONSOON25", commission_bps: 2000 });
  });

  it("renders basis points as a percentage an operator can read", async () => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");

    expect(await screen.findByText(/20\.00%/)).toBeTruthy();
    expect(screen.getByText(/7 uses/i)).toBeTruthy();
  });
});

/**
 * Issuing agency credentials.
 *
 * Agencies have no signup, no Google login, and a password-reset request for an
 * agency address returns the normal success message while silently doing nothing
 * (contract §7). This form is the only route in — without it a member who forgets
 * their password is permanently locked out.
 */
describe("setting a member's password", () => {
  const openFor = async (email) => {
    mockApi();
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`set password for ${email}`, "i") }));
  };

  it("posts to that member's set-password action", async () => {
    await openFor("agent@sunrise\\.test");
    await userEvent.type(await screen.findByLabelText(/new password/i), "Correct-Horse-9");
    await userEvent.click(screen.getByRole("button", { name: /^set password$/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [href, init] = writes()[0];
    expect(String(href)).toContain("/organizations/org-1/members/m2/set-password/");
    expect(JSON.parse(init.body)).toEqual({ password: "Correct-Horse-9" });
  });

  /** Nothing is emailed — console-only mail. Saying otherwise strands the member. */
  it("says the password is not emailed and must be sent by hand", async () => {
    await openFor("agent@sunrise\\.test");
    expect(await screen.findByText(/nothing is emailed/i)).toBeTruthy();
    expect(screen.getByText(/cannot reset their own/i)).toBeTruthy();
  });

  it("confirms which member it applied to", async () => {
    await openFor("agent@sunrise\\.test");
    await userEvent.type(await screen.findByLabelText(/new password/i), "Correct-Horse-9");
    await userEvent.click(screen.getByRole("button", { name: /^set password$/i }));

    expect(await screen.findByText(/password set for agent@sunrise\.test/i)).toBeTruthy();
  });

  it("surfaces a rejected password against the form", async () => {
    mockApi({
      write: () =>
        jsonResponse(
          {
            error: {
              code: "validation_error",
              message: "Invalid.",
              fields: { password: ["This password is too common."] },
            },
          },
          400,
        ),
    });
    render(<AdminAgencyDetail orgId="org-1" />);
    await screen.findByText("Sunrise Travel");
    await userEvent.click(screen.getByRole("button", { name: /set password for agent@sunrise\.test/i }));
    await userEvent.type(await screen.findByLabelText(/new password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /^set password$/i }));

    expect(await screen.findByText(/too common/i)).toBeTruthy();
  });

  it("can be abandoned without setting anything", async () => {
    await openFor("agent@sunrise\\.test");
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText(/new password/i)).toBeNull();
    expect(writes()).toHaveLength(0);
  });
});
