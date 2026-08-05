// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AgencySignIn } from "./agency-sign-in.client";
import { useSession } from "@/features/auth/use-session.client";
import { useAgency } from "@/features/agency/use-agency.client";
import { routerMock } from "../../../../vitest.setup";

/**
 * The partner door at /agency.
 *
 * Agency credentials are issued by the platform: no signup, no Google, and a
 * password reset for an agency address returns the normal success message while
 * silently doing nothing. Offering any of those controls sends a partner down a
 * path that cannot work and looks like our bug.
 *
 * The other rule is about WHO gets through. The backend 404s every agency endpoint
 * unless the organization is active, so a suspended partner who is let in lands on
 * "We couldn't load your dashboard — Not found." — a broken site, not a suspension.
 */

const USER = { id: "u1", email: "owner@sunrise.test" };
const ORG = (status = "active") => ({ id: "org-1", name: "Sunrise Travel", status });

function mockApi() {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(USER), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
  useAgency.setState({ organizations: undefined, error: null });
  mockApi();
});

afterEach(() => vi.restoreAllMocks());

describe("the door offers nothing an agency cannot use", () => {
  it("has no Google button", () => {
    useSession.setState({ user: null });
    render(<AgencySignIn />);
    expect(screen.queryByText(/continue with google/i)).toBeNull();
  });

  it("has no sign-up link", () => {
    useSession.setState({ user: null });
    const { container } = render(<AgencySignIn />);
    expect(container.querySelector('a[href*="signup"]')).toBeNull();
  });

  /** A reset silently does nothing for an agency — offering it strands them. */
  it("has no password-reset link", () => {
    useSession.setState({ user: null });
    const { container } = render(<AgencySignIn />);
    expect(container.querySelector('a[href*="forgot-password"]')).toBeNull();
  });

  /**
   * Labelled "Username", not "Email address" — the platform hands out a username
   * and password, so the form should say what the partner was actually given, even
   * though the field carries an email underneath.
   */
  it("asks only for a username and a password", () => {
    useSession.setState({ user: null });
    const { container } = render(<AgencySignIn />);

    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    // Nothing else to fill in — no name, no company, no confirmation field.
    const inputs = [...container.querySelectorAll("input")].map((i) => i.name);
    expect(inputs.sort()).toEqual(["email", "password"]);
  });
});

describe("who gets through", () => {
  it("sends an active agency straight to its own dashboard", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG("active")] });
    render(<AgencySignIn />);

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/agency/org-1"));
  });

  /** The whole point of this gate. */
  it("refuses a suspended agency at the door instead of redirecting", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG("suspended")] });
    render(<AgencySignIn />);

    expect(await screen.findByText(/sunrise travel is suspended/i)).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it("never shows the broken-looking not-found wording to a suspended agency", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG("suspended")] });
    render(<AgencySignIn />);

    await screen.findByText(/is suspended/i);
    expect(document.body.textContent).not.toMatch(/not found|couldn't load/i);
  });

  it("tells a pending agency to wait rather than implying a fault", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG("pending")] });
    render(<AgencySignIn />);

    expect(await screen.findByText(/hasn.t been approved yet/i)).toBeTruthy();
    expect(screen.getByText(/no action needed from you/i)).toBeTruthy();
  });

  it("closes the portal for a closed account without losing their history", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [ORG("closed")] });
    render(<AgencySignIn />);

    expect(await screen.findByText(/sunrise travel is closed/i)).toBeTruthy();
    expect(screen.getByText(/past sales are safe/i)).toBeTruthy();
  });

  /**
   * A customer signing in here is authenticated but has no agency. The message must
   * not hint that some other organization exists — the backend refuses to
   * distinguish "not yours" from "doesn't exist" for exactly that reason.
   */
  it("dead-ends a customer without hinting other agencies exist", async () => {
    useSession.setState({ user: USER });
    useAgency.setState({ organizations: [] });
    render(<AgencySignIn />);

    expect(await screen.findByText(/no partner portal/i)).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/permission|forbidden|not authorised|belongs to/i);
  });
});
