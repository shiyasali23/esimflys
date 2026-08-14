// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { useSession } from "@/features/auth/use-session.client";
import { useAgency } from "@/features/agency/use-agency.client";

/**
 * Tenant resolution and access states.
 *
 * Two bugs are locked here, both found by hand:
 *  - a "Not found" flash while the membership list was still loading, which told
 *    users their own agency didn't exist;
 *  - a failed session probe rendering as signed-out, which told a signed-in user
 *    they had been logged out with nothing to retry.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ORG = { id: "org-1", name: "Sunrise Travel", status: "active" };
const USER = { id: "u1", email: "a@b.com" };

beforeEach(() => {
  globalThis.fetch = vi.fn(() => new Promise(() => {})); // never settles unless overridden
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
  useAgency.setState({ organizations: undefined, error: null });
});

afterEach(() => vi.restoreAllMocks());

describe("while resolving", () => {
  /**
   * The regression: `findOrganization` returns null on an undefined list, so an
   * unguarded check rendered "Not found" before the answer arrived.
   */
  it("does not claim the agency is missing before the memberships load", () => {
    useSession.setState({ user: USER });
    render(<AgencyShell orgId="org-1">content</AgencyShell>);
    expect(screen.queryByText(/not found/i)).toBeNull();
  });

  it("renders the nav immediately, since it only needs the org id", () => {
    useSession.setState({ user: USER });
    render(<AgencyShell orgId="org-1">content</AgencyShell>);
    expect(screen.getByRole("navigation", { name: /agency sections/i })).toBeTruthy();
  });

  it("shows a placeholder for the name rather than an empty heading", () => {
    useSession.setState({ user: USER });
    const { container } = render(<AgencyShell orgId="org-1">content</AgencyShell>);
    expect(container.querySelector('h1 [aria-busy="true"]')).toBeTruthy();
  });
});

describe("resolved states", () => {
  it("renders the organization and its children once known", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG] });
    render(<AgencyShell orgId="org-1">the content</AgencyShell>);
    expect(await screen.findByText("Sunrise Travel")).toBeTruthy();
    expect(screen.getByText("the content")).toBeTruthy();
  });

  /**
   * The backend answers 404 for another tenant's data precisely so its existence
   * is never confirmed. The UI must not undo that by naming the organization.
   */
  it("shows a generic not-found for a tenant that isn't theirs", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG] });
    render(<AgencyShell orgId="someone-elses-org">content</AgencyShell>);
    expect(await screen.findByText(/not found/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("someone-elses-org");
    expect(document.body.textContent).not.toMatch(/permission|not allowed|access denied/i);
  });

  it("prompts sign-in only when the server actually says signed out", async () => {
    useSession.setState({ user: null });
    useAgency.setState({ organizations: [] });
    render(<AgencyShell orgId="org-1">content</AgencyShell>);
    expect(await screen.findByText(/sign in to your agency/i)).toBeTruthy();
  });
});

describe("session probe failure", () => {
  /**
   * The Phase A bug: any error latched the UI to signed-out. A 500 means the
   * answer is unknown — offer a retry, don't assert a logout.
   */
  it("offers retry instead of a false sign-in prompt", async () => {
    useSession.setState({ user: undefined, error: { message: "Upstream is down." } });
    useAgency.setState({ organizations: [] });
    render(<AgencyShell orgId="org-1">content</AgencyShell>);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Upstream is down.")).toBeTruthy();
    expect(screen.queryByText(/sign in to your agency/i)).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });
});

describe("tenant switcher", () => {
  it("stays hidden for a single membership", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG] });
    render(<AgencyShell orgId="org-1">content</AgencyShell>);
    await screen.findByText("Sunrise Travel");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  // Queried by heading: with a switcher present the name also appears as an
  // <option>, and a plain text query rejects on multiple matches.
  it("appears when the user belongs to more than one", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({
      organizations: [ORG, { id: "org-2", name: "Blue Skies", status: "active" }],
    });
    render(<AgencyShell orgId="org-1">content</AgencyShell>);
    await screen.findByRole("heading", { name: /sunrise travel/i });
    const select = screen.getByRole("combobox");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Sunrise Travel", "Blue Skies"]);
    expect(select.value).toBe("org-1");
  });
});

describe("navigation", () => {
  /*
   * The tabs are sibling static pages carrying `?org=`, not path segments beneath the
   * org id — a static export can only emit pages for ids known at build time, and org
   * ids are not. What still has to hold is that every tab carries the tenant, because a
   * tab that loses it lands on the "choose an organization" state mid-session.
   */
  it("carries the tenant on every section link", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG] });
    render(<AgencyShell orgId="org-1">content</AgencyShell>);
    await screen.findByText("Sunrise Travel");
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/agency/portal?org=org-1");
    expect(links).toContain("/agency/sales?org=org-1");
    expect(links.every((h) => h.startsWith("/agency/") && h.endsWith("?org=org-1"))).toBe(true);
  });
});
