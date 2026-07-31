// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { useSession } from "@/features/auth/use-session.client";

/**
 * Admin access gating.
 *
 * `is_staff` alone grants nothing on this API — access needs membership of a
 * platform role group — so the panel probes the dashboard rather than inferring
 * permission from the account payload. A 403 is a real answer ("no access"); any
 * other failure means the answer is unknown and must not read as a denial.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER = { id: "u1", email: "staff@example.com" };
const DASHBOARD = { currency: "USD", revenue: {}, orders: {}, esims: {}, commissions: {}, operations: {} };

beforeEach(() => {
  globalThis.fetch = vi.fn(() => new Promise(() => {}));
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("signed out", () => {
  it("asks the visitor to sign in", async () => {
    useSession.setState({ user: null });
    render(<AdminShell title="Dashboard">content</AdminShell>);
    expect(await screen.findByText(/sign in to continue/i)).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
  });
});

describe("signed in without a platform role", () => {
  it("says no access when the probe returns 403", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "permission_denied", message: "Nope." } }, 403),
    );
    render(<AdminShell title="Dashboard">content</AdminShell>);
    expect(await screen.findByText(/no access/i)).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
  });

  it("suggests the remedy rather than dead-ending", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "permission_denied", message: "Nope." } }, 403),
    );
    render(<AdminShell title="Dashboard">content</AdminShell>);
    await screen.findByText(/no access/i);
    expect(screen.getByText(/ask an owner to grant them/i)).toBeTruthy();
  });
});

describe("signed in with access", () => {
  it("renders the children", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockResolvedValue(jsonResponse(DASHBOARD));
    render(<AdminShell title="Dashboard">the content</AdminShell>);
    expect(await screen.findByText("the content")).toBeTruthy();
  });

  it("renders the nav on first paint, before the probe resolves", () => {
    useSession.setState({ user: USER });
    render(<AdminShell title="Dashboard">content</AdminShell>);
    expect(screen.getByRole("navigation", { name: /admin sections/i })).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
  });

  it("links every section under /admin", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockResolvedValue(jsonResponse(DASHBOARD));
    render(<AdminShell title="Dashboard">content</AdminShell>);
    await screen.findByText("content");
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith("/admin"));
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/admin/orders");
    expect(hrefs).toContain("/admin/audit");
  });
});

describe("probe failure is not a denial", () => {
  /**
   * A 500 means we couldn't tell. Rendering "no access" would tell a legitimate
   * admin they'd lost permission because the server hiccuped.
   */
  it("does not claim no access when the probe fails for a non-auth reason", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "internal_error", message: "Boom." } }, 500),
    );
    render(<AdminShell title="Dashboard">content</AdminShell>);
    await waitFor(() => expect(screen.queryByText("content")).toBeTruthy());
    expect(screen.queryByText(/no access/i)).toBeNull();
  });

  it("offers retry when the session itself couldn't be verified", async () => {
    useSession.setState({ user: undefined, error: { message: "Upstream is down." } });
    render(<AdminShell title="Dashboard">content</AdminShell>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Upstream is down.")).toBeTruthy();
    expect(screen.queryByText(/sign in to continue/i)).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });
});
