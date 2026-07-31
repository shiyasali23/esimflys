// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordForm } from "./forgot-password-form.client";
import { ResetPasswordForm } from "./reset-password-form.client";
import { navigationState } from "../../../../vitest.setup";

/**
 * The password reset pair.
 *
 * The security property worth protecting: requesting a reset always answers 200,
 * even for an address with no account, so the response cannot be used to discover
 * who has one. The confirmation must therefore never say whether the address was
 * recognised — a "no account with that email" message would turn this form into an
 * account-enumeration oracle.
 *
 * Setting the new password uses Django's signed-link flow: `{uid, token,
 * new_password}` come from the emailed URL, not from anything typed.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockApi(respond) {
  globalThis.fetch = vi.fn(() => Promise.resolve(respond ? respond() : jsonResponse({}, 200)));
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  navigationState.searchParams = new URLSearchParams();
});

afterEach(() => vi.restoreAllMocks());

describe("requesting a reset", () => {
  const request = async (email = "traveller@example.com") => {
    await userEvent.type(screen.getByLabelText(/email/i), email);
    await userEvent.click(screen.getByRole("button", { name: /send|reset link/i }));
  };

  it("posts the address to the reset endpoint", async () => {
    mockApi();
    render(<ForgotPasswordForm />);
    await request();

    await waitFor(() => expect(posts().length).toBeGreaterThan(0));
    expect(String(posts()[0][0])).toContain("/auth/password-reset/");
    expect(JSON.parse(posts()[0][1].body)).toEqual({ email: "traveller@example.com" });
  });

  /** The whole point: the same answer whether or not the account exists. */
  it("never reveals whether the address has an account", async () => {
    mockApi();
    render(<ForgotPasswordForm />);
    await request("nobody@nowhere.test");

    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/if that address has an eSIMFlys account/i);
    expect(status.textContent).not.toMatch(/we sent|no account|not found|doesn't exist/i);
  });

  it("tells the user to check spam, where reset mail usually lands", async () => {
    mockApi();
    render(<ForgotPasswordForm />);
    await request();

    expect(await screen.findByText(/spam folder/i)).toBeTruthy();
  });

  it("replaces the form once sent, so it cannot be fired repeatedly", async () => {
    mockApi();
    render(<ForgotPasswordForm />);
    await request();

    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    // getAll: a persistent "← Back to sign in" sits below the card, and the success
    // block adds its own — both are on screen at once.
    expect(screen.getAllByRole("link", { name: /back to sign in/i }).length).toBeGreaterThan(0);
  });

  it("explains a rate limit instead of looking broken", async () => {
    mockApi(() => jsonResponse({ detail: "Throttled." }, 429));
    render(<ForgotPasswordForm />);
    await request();

    expect(await screen.findByText(/too many requests/i)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not claim success when the request failed", async () => {
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<ForgotPasswordForm />);
    await request();

    await screen.findByRole("alert");
    expect(screen.queryByText(/reset link is on its way/i)).toBeNull();
  });
});

describe("setting the new password", () => {
  const withLink = () => {
    navigationState.searchParams = new URLSearchParams("uid=MQ&token=abc-123");
  };
  const submit = async (password = "correct-horse-battery") => {
    await userEvent.type(screen.getByLabelText(/new password/i), password);
    await userEvent.click(screen.getByRole("button", { name: /update|set|reset/i }));
  };

  it("sends uid and token from the emailed link, not from user input", async () => {
    withLink();
    mockApi();
    render(<ResetPasswordForm />);
    await submit();

    await waitFor(() => expect(posts().length).toBeGreaterThan(0));
    expect(String(posts()[0][0])).toContain("/auth/password-reset/confirm/");
    expect(JSON.parse(posts()[0][1].body)).toEqual({
      uid: "MQ",
      token: "abc-123",
      new_password: "correct-horse-battery",
    });
  });

  /**
   * Without uid+token there is nothing to submit. Showing the form anyway would
   * collect a new password and then fail, which reads as "my password is wrong".
   */
  it("refuses to show the form when the link is missing its credentials", () => {
    mockApi();
    render(<ResetPasswordForm />);

    expect(screen.getByRole("alert").textContent).toMatch(/needs the link from your reset email/i);
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
    expect(screen.getByRole("link", { name: /request a new link/i })).toBeTruthy();
  });

  it("treats a half-populated link as unusable", () => {
    navigationState.searchParams = new URLSearchParams("uid=MQ");
    mockApi();
    render(<ResetPasswordForm />);

    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("shows Django's own password rules against the field", async () => {
    withLink();
    mockApi(() =>
      jsonResponse(
        {
          error: {
            code: "validation_error",
            message: "Invalid input.",
            fields: { password: ["This password is too short. It must contain at least 8 characters."] },
          },
        },
        400,
      ),
    );
    render(<ResetPasswordForm />);
    await submit("short");

    expect(await screen.findByText(/at least 8 characters/i)).toBeTruthy();
  });

  /** The server's own wording wins over the local fallback — it is more specific. */
  it("shows the server's reason for refusing the link", async () => {
    withLink();
    mockApi(() => jsonResponse({ detail: "Invalid token." }, 400));
    render(<ResetPasswordForm />);
    await submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid token.");
  });

  it("falls back to explaining the link expired when the server says nothing useful", async () => {
    withLink();
    mockApi(() => new Response(null, { status: 400, statusText: "" }));
    render(<ResetPasswordForm />);
    await submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no longer valid|request a new one/i);
  });

  it("confirms success and points at sign-in", async () => {
    withLink();
    mockApi();
    render(<ResetPasswordForm />);
    await submit();

    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/password has been updated/i);
    expect(screen.getAllByRole("link", { name: /back to sign in/i }).length).toBeGreaterThan(0);
  });

  it("does not keep the new password anywhere after success", async () => {
    withLink();
    mockApi();
    render(<ResetPasswordForm />);
    await submit("correct-horse-battery");

    await screen.findByRole("status");
    const dumped = JSON.stringify([
      Object.entries(window.localStorage),
      Object.entries(window.sessionStorage),
    ]);
    expect(dumped).not.toContain("correct-horse-battery");
    expect(document.body.textContent).not.toContain("correct-horse-battery");
  });
});
