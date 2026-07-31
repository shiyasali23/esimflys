// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileView } from "./profile-view.client";
import { useSession } from "@/features/auth/use-session.client";
import { routerMock } from "../../../../vitest.setup";

/**
 * The account profile.
 *
 * `PATCH /account/me/` accepts only name and preferred currency. An email field
 * here would collect a change the backend silently discards — the user would be
 * told nothing and believe their address had moved.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER = {
  id: "u1",
  email: "traveller@example.com",
  first_name: "Amira",
  last_name: "Haddad",
  preferred_currency: "USD",
};

function mockApi(respond) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method && init.method !== "GET") {
      return Promise.resolve(respond ? respond() : jsonResponse({ ...USER, first_name: "Amira" }));
    }
    return Promise.resolve(jsonResponse(USER));
  });
}

const writes = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method && c[1].method !== "GET");
const signedIn = () => useSession.setState({ user: USER, error: null, loading: false });

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("what can be changed", () => {
  it("prefills the editable fields from the account", async () => {
    signedIn();
    mockApi();
    render(<ProfileView />);

    await waitFor(() => expect(screen.getByLabelText(/first name/i).value).toBe("Amira"));
    expect(screen.getByLabelText(/last name/i).value).toBe("Haddad");
  });

  /**
   * The backend ignores an email in this payload. Offering the field would look
   * like it worked and quietly change nothing.
   */
  it("offers no editable email field, because the endpoint would discard it", async () => {
    signedIn();
    mockApi();
    render(<ProfileView />);

    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeTruthy());
    const email = screen.queryByLabelText(/email/i);
    expect(email === null || email.disabled || email.readOnly).toBe(true);
  });

  it("still shows the address so the user knows which account this is", async () => {
    signedIn();
    mockApi();
    render(<ProfileView />);

    expect(await screen.findByText("traveller@example.com")).toBeTruthy();
  });
});

describe("saving", () => {
  it("sends only the fields the endpoint accepts", async () => {
    signedIn();
    mockApi();
    render(<ProfileView />);
    await waitFor(() => expect(screen.getByLabelText(/first name/i).value).toBe("Amira"));

    await userEvent.clear(screen.getByLabelText(/first name/i));
    await userEvent.type(screen.getByLabelText(/first name/i), "Dana");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const body = JSON.parse(writes()[0][1].body);
    expect(body.first_name).toBe("Dana");
    expect(Object.hasOwn(body, "email")).toBe(false);
  });

  it("confirms a successful save", async () => {
    signedIn();
    mockApi();
    render(<ProfileView />);
    await waitFor(() => expect(screen.getByLabelText(/first name/i).value).toBe("Amira"));

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("surfaces a per-field rejection against that field", async () => {
    signedIn();
    mockApi(() =>
      jsonResponse(
        {
          error: {
            code: "validation_error",
            message: "Invalid.",
            fields: { first_name: ["This field may not be blank."] },
          },
        },
        400,
      ),
    );
    render(<ProfileView />);
    await waitFor(() => expect(screen.getByLabelText(/first name/i).value).toBe("Amira"));

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/may not be blank/i)).toBeTruthy();
  });

  it("does not claim success when the save failed", async () => {
    signedIn();
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<ProfileView />);
    await waitFor(() => expect(screen.getByLabelText(/first name/i).value).toBe("Amira"));

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("signing out", () => {
  /**
   * signOut clears local state and rethrows if the server call failed. We navigate
   * either way — the account is already gone from this tab — but the failure is
   * surfaced rather than swallowed, because a logout that never reached the server
   * leaves a live session behind.
   */
  /**
   * `signOut` clears local state in a `finally`, so the user is signed out here
   * even when the request fails — and the component then renders its signed-out
   * branch. The warning must survive that switch, because it is the only thing
   * telling someone a live session may still exist on the server.
   */
  it("keeps warning the user when the server was never reached", async () => {
    signedIn();
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<ProfileView />);
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(await screen.findByText(/couldn't reach the server/i)).toBeTruthy();
    expect(screen.getByText(/close your browser/i)).toBeTruthy();
    // Local state IS cleared regardless — that half already worked.
    expect(useSession.getState().user).toBeNull();
  });

  it("does not pretend the sign-out reached the server", async () => {
    signedIn();
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<ProfileView />);
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await screen.findByText(/couldn't reach the server/i);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("clears the session locally on success", async () => {
    signedIn();
    mockApi(() => jsonResponse({}));
    render(<ProfileView />);
    await waitFor(() => expect(screen.getByLabelText(/first name/i)).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(useSession.getState().user).toBeNull());
  });
});

describe("signed out", () => {
  it("asks for sign-in rather than rendering an empty form", () => {
    useSession.setState({ user: null, error: null, loading: false });
    mockApi();
    render(<ProfileView />);

    expect(screen.queryByLabelText(/first name/i)).toBeNull();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeTruthy();
  });
});
