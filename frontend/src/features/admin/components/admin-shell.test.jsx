// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * Staff sign in HERE, in place, rather than being bounced to the storefront login.
 * That page offers Google, a sign-up link and a password reset — three routes that
 * cannot create or recover a staff account — and it loses whichever admin page the
 * visitor was trying to reach.
 */
describe("signed out", () => {
  it("shows a staff sign-in form instead of the customer login", async () => {
    useSession.setState({ user: null });
    render(<AdminShell title="Dashboard">content</AdminShell>);

    expect(await screen.findByRole("heading", { name: /staff sign in/i })).toBeTruthy();
    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
  });

  it("offers nothing that cannot create or recover a staff account", async () => {
    useSession.setState({ user: null });
    const { container } = render(<AdminShell title="Dashboard">content</AdminShell>);
    await screen.findByRole("heading", { name: /staff sign in/i });

    expect(screen.queryByText(/continue with google/i)).toBeNull();
    expect(container.querySelector('a[href*="signup"]')).toBeNull();
    expect(container.querySelector('a[href*="forgot-password"]')).toBeNull();
    expect(screen.getByText(/reset on the server/i)).toBeTruthy();
  });

  /** The form is public — naming which half was wrong would enumerate staff. */
  it("does not reveal which credential was wrong", async () => {
    useSession.setState({ user: null });
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: "invalid_credentials", message: "No active account." } }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    render(<AdminShell title="Dashboard">content</AdminShell>);
    await screen.findByRole("heading", { name: /staff sign in/i });

    await userEvent.type(screen.getByLabelText(/username/i), "someone@esimflys.com");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/don't match a staff account/i);
    expect(alert.textContent).not.toMatch(/no such user|wrong password|not staff/i);
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

  /* The panel moved to /superuser so its name stops colliding with Django's own
     /admin on the backend host. /admin still resolves — the Worker 308s it. */
  it("links every section under /superuser", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockResolvedValue(jsonResponse(DASHBOARD));
    render(<AdminShell title="Dashboard">content</AdminShell>);
    await screen.findByText("content");
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith("/superuser"));
    expect(hrefs).toContain("/superuser");
    expect(hrefs).toContain("/superuser/orders");
    expect(hrefs).toContain("/superuser/audit");
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
