// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthCard } from "./auth-card.client";
import { useSession } from "@/features/auth/use-session.client";
import { routerMock } from "../../../../vitest.setup";

/**
 * Sign-in and sign-up.
 *
 * Success leaves an HttpOnly session cookie — there is no token for this code to
 * hold, and nothing may be persisted client-side. The credentials themselves must
 * reach exactly one place, the auth endpoint, and appear nowhere else: not in a
 * URL, not in storage, not in a re-render.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER = { id: "u1", email: "traveller@example.com", first_name: "", last_name: "" };
const PASSWORD = "correct-horse-battery";

function mockApi(respond) {
  globalThis.fetch = vi.fn(() => Promise.resolve(respond ? respond() : jsonResponse(USER, 200)));
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

async function fillAndSubmit({ email = "traveller@example.com", password = PASSWORD } = {}) {
  await userEvent.type(screen.getByLabelText(/email address/i), email);
  await userEvent.type(screen.getByLabelText(/^password$/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in|create account/i }));
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("signing in", () => {
  it("posts the credentials to the login endpoint", async () => {
    mockApi();
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();

    await waitFor(() => expect(posts().length).toBeGreaterThan(0));
    expect(String(posts()[0][0])).toContain("/auth/login/");
    expect(JSON.parse(posts()[0][1].body)).toEqual({
      email: "traveller@example.com",
      password: PASSWORD,
    });
  });

  it("registers instead when in signup mode", async () => {
    mockApi(() => jsonResponse(USER, 201));
    render(<AuthCard mode="signup" />);
    await fillAndSubmit();

    await waitFor(() => expect(posts().length).toBeGreaterThan(0));
    expect(String(posts()[0][0])).toContain("/auth/register/");
  });

  it("trims a stray space off the email but never the password", async () => {
    mockApi();
    render(<AuthCard mode="signin" />);
    await fillAndSubmit({ email: "  traveller@example.com  ", password: " padded " });

    await waitFor(() => expect(posts().length).toBeGreaterThan(0));
    const body = JSON.parse(posts()[0][1].body);
    expect(body.email).toBe("traveller@example.com");
    // Trimming a password would silently change what the user typed.
    expect(body.password).toBe(" padded ");
  });

  it("records the signed-in user and moves on to the account", async () => {
    mockApi();
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/account"));
    expect(useSession.getState().user).toMatchObject({ email: "traveller@example.com" });
  });
});

describe("what must never happen to the password", () => {
  it("is not written to storage", async () => {
    mockApi();
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    const dumped = JSON.stringify([
      Object.entries(window.localStorage),
      Object.entries(window.sessionStorage),
    ]);
    expect(dumped).not.toContain(PASSWORD);
  });

  it("is not put in the URL", async () => {
    mockApi();
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    for (const [target] of routerMock.push.mock.calls) {
      expect(String(target)).not.toContain(PASSWORD);
    }
    expect(window.location.search).not.toContain(PASSWORD);
  });

  it("starts masked and is only revealed deliberately", async () => {
    mockApi();
    render(<AuthCard mode="signin" />);

    const field = screen.getByLabelText(/^password$/i);
    expect(field.getAttribute("type")).toBe("password");

    await userEvent.click(screen.getByRole("button", { name: /show password|reveal/i }));
    expect(screen.getByLabelText(/^password$/i).getAttribute("type")).toBe("text");
  });
});

describe("when the server refuses", () => {
  /** The message must not say WHICH half was wrong — that enumerates accounts. */
  it("reports a bad credential pair without revealing which part failed", async () => {
    mockApi(() =>
      jsonResponse(
        { error: { code: "invalid_credentials", message: "No active account found." } },
        400,
      ),
    );
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/email and password don't match an account/i);
    expect(alert.textContent).not.toMatch(/no account with that email|wrong password/i);
  });

  it("surfaces per-field validation against the field itself", async () => {
    mockApi(() =>
      jsonResponse(
        {
          error: {
            code: "validation_error",
            message: "Invalid input.",
            fields: { email: ["A user with this email already exists."] },
          },
        },
        400,
      ),
    );
    render(<AuthCard mode="signup" />);
    await fillAndSubmit();

    expect(await screen.findByText(/already exists/i)).toBeTruthy();
  });

  it("explains a rate limit rather than looking broken", async () => {
    mockApi(() => jsonResponse({ detail: "Throttled." }, 429));
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();

    expect(await screen.findByText(/too many attempts/i)).toBeTruthy();
  });

  it("lets the user try again after a failure", async () => {
    mockApi(() => jsonResponse({ detail: "Throttled." }, 429));
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();
    await screen.findByRole("alert");

    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button.disabled).toBe(false);
  });

  it("does not claim a session it never got", async () => {
    mockApi(() => jsonResponse({ detail: "Bad request" }, 400));
    render(<AuthCard mode="signin" />);
    await fillAndSubmit();

    await screen.findByRole("alert");
    expect(useSession.getState().user).toBeUndefined();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe("Google sign-in", () => {
  /**
   * A full-page navigation, not a fetch: the OAuth handshake needs real redirects,
   * so this must stay an <a href>. Turning it into a button with a fetch would
   * silently break the flow.
   */
  it("is a real link to the allauth entry point", () => {
    mockApi();
    render(<AuthCard mode="signin" />);

    const link = screen.getByRole("link", { name: /continue with google/i });
    expect(link.getAttribute("href")).toBe("/accounts/google/login/");
  });
});
