// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useSession } from "@/features/auth/use-session.client";

/**
 * The session store. Auth is an HttpOnly cookie, so "am I signed in?" can only be
 * answered by asking the server — which makes request de-duplication a real
 * concern rather than a micro-optimisation.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER = { id: "u1", email: "a@b.com", first_name: "Ada" };

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("load", () => {
  it("resolves the signed-in account", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(USER));
    expect(await useSession.getState().load()).toMatchObject({ email: "a@b.com" });
    expect(useSession.getState().user.email).toBe("a@b.com");
  });

  // A 403 here is the ordinary anonymous case, not an error to surface.
  it("treats 403 as signed out rather than a failure", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403),
    );
    expect(await useSession.getState().load()).toBeNull();
    expect(useSession.getState().user).toBeNull();
  });

  it("does not re-ask once the answer is known", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(USER));
    await useSession.getState().load();
    await useSession.getState().load();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("re-asks when forced, for use after sign-in", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(USER));
    await useSession.getState().load();
    await useSession.getState().load({ force: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  /**
   * Several components mount together and each asks independently. Without a
   * single-flight guard they all fire before any has set state — which duplicated
   * the request, and for an anonymous visitor duplicated the 403 logged to console.
   */
  it("collapses concurrent callers into one request", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(USER));
    const { load } = useSession.getState();
    const [a, b, c] = await Promise.all([load(), load(), load()]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  /**
   * A transport failure means the answer is UNKNOWN, not "signed out". Latching to
   * null on any error told a signed-in admin they'd been logged out — a real bug,
   * hit when the backend blipped mid-session — and nothing retried.
   */
  it("leaves the session undetermined on a transport failure", async () => {
    globalThis.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await useSession.getState().load();
    expect(useSession.getState().user).toBeUndefined();
    expect(useSession.getState().error).toBeTruthy();
  });

  it("does not latch: retry recovers once the server answers", async () => {
    globalThis.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await useSession.getState().load();
    expect(useSession.getState().error).toBeTruthy();

    globalThis.fetch.mockResolvedValue(jsonResponse(USER));
    expect(await useSession.getState().retry()).toMatchObject({ email: "a@b.com" });
    expect(useSession.getState().user.email).toBe("a@b.com");
    expect(useSession.getState().error).toBeNull();
  });

  it("only an auth response marks the user signed out", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "internal_error", message: "Boom." } }, 500),
    );
    await useSession.getState().load();
    expect(useSession.getState().user).not.toBeNull();
    expect(useSession.getState().error).toBeTruthy();
  });
});

describe("signOut", () => {
  /**
   * A logout that never reached the server may have left the session cookie alive,
   * so the failure must not be swallowed. The contract is therefore: clear local
   * state (this tab is done with the account) AND reject, so the caller can warn.
   */
  it("clears the user but still rejects when the logout call fails", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(useSession.getState().signOut()).rejects.toBeTruthy();
    expect(useSession.getState().user).toBeNull();
  });

  it("clears the user on a successful logout", async () => {
    useSession.setState({ user: USER });
    globalThis.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await useSession.getState().signOut();
    expect(useSession.getState().user).toBeNull();
  });
});
