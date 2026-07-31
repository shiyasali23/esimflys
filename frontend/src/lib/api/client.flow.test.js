// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiFetch, api, readCsrfToken } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { clearCartToken, readCartToken } from "@/lib/api/cart-token";

/**
 * Transport behaviour the API contract depends on. These are the rules no call
 * site should have to remember, so they are asserted once, here.
 */

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function lastCall() {
  return globalThis.fetch.mock.calls.at(-1);
}

/**
 * jsdom in this setup ships no working localStorage, and cart-token.js treats a
 * missing store as non-fatal — so without a shim the capture/replay logic would
 * silently no-op and these tests would pass for the wrong reason.
 */
function installMemoryStorage() {
  const data = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
      clear: () => data.clear(),
    },
  });
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "csrftoken=tok123; path=/";
  installMemoryStorage();
  clearCartToken();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("credentials and URL shape", () => {
  it("sends credentials on every request, so the session cookie travels", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse([]));
    await api.get("/catalog/countries/");
    expect(lastCall()[1].credentials).toBe("include");
  });

  it("calls a relative path in the browser, so the proxy keeps it same-origin", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse([]));
    await api.get("/catalog/countries/");
    expect(lastCall()[0]).toBe("/api/v1/catalog/countries/");
  });

  it("does not double the /api/v1 prefix when a caller includes it", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse([]));
    await api.get("/api/v1/cart/");
    expect(lastCall()[0]).toBe("/api/v1/cart/");
  });
});

describe("CSRF", () => {
  it("reads the token from the cookie", () => {
    expect(readCsrfToken()).toBe("tok123");
  });

  it("sends X-CSRFToken on unsafe methods", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ ok: true }, { status: 201 }));
    await api.post("/cart/items/", { product_code: "SA-10GB-30D-V1" });
    expect(lastCall()[1].headers["X-CSRFToken"]).toBe("tok123");
  });

  it("omits it on safe methods, which Django does not check", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse([]));
    await api.get("/catalog/countries/");
    expect(lastCall()[1].headers["X-CSRFToken"]).toBeUndefined();
  });

  // Django rotates csrftoken on login; a cached value would be stale afterwards.
  it("re-reads the cookie per request rather than caching it", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({}, { status: 201 }));
    await api.post("/cart/items/", {});
    document.cookie = "csrftoken=rotated456; path=/";
    await api.post("/cart/items/", {});
    expect(lastCall()[1].headers["X-CSRFToken"]).toBe("rotated456");
  });
});

describe("X-Cart-Token", () => {
  // The server issues it once, as a response header, and never repeats it.
  it("captures the token off the response and persists it", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ id: "cart-1" }, { status: 201, headers: { "X-Cart-Token": "cart-tok-abc" } }),
    );
    await api.post("/cart/items/", { product_code: "X" });
    expect(readCartToken()).toBe("cart-tok-abc");
  });

  it("replays the stored token on later calls, or the guest cart is lost", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({}, { status: 201, headers: { "X-Cart-Token": "cart-tok-abc" } }),
    );
    await api.post("/cart/items/", {});
    globalThis.fetch.mockResolvedValue(jsonResponse({ id: "cart-1" }));
    await api.get("/cart/");
    expect(lastCall()[1].headers["X-Cart-Token"]).toBe("cart-tok-abc");
  });

  it("honours an explicit null, for calls that must not carry a cart", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({}, { status: 201, headers: { "X-Cart-Token": "cart-tok-abc" } }),
    );
    await api.post("/cart/items/", {});
    globalThis.fetch.mockResolvedValue(jsonResponse({}));
    await apiFetch("/orders/", { cartToken: null });
    expect(lastCall()[1].headers["X-Cart-Token"]).toBeUndefined();
  });
});

describe("error handling", () => {
  it("turns the error envelope into an ApiError", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse(
        { error: { code: "plan_unavailable", message: "That plan is gone.", fields: {} } },
        { status: 409 },
      ),
    );
    await expect(api.get("/cart/")).rejects.toMatchObject({
      name: "ApiError",
      code: "plan_unavailable",
      message: "That plan is gone.",
      status: 409,
    });
  });

  it("captures Retry-After on a 429 so callers can back off correctly", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "rate_limited", message: "Slow down." } }, {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    );
    await api.get("/orders/").catch((error) => {
      expect(error.retryAfter).toBe(45);
    });
    expect.assertions(1);
  });

  it("reports a transport failure as a network error, not a server error", async () => {
    globalThis.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await api.get("/catalog/countries/").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNetwork).toBe(true);
    expect(error.status).toBe(0);
  });

  // An HTML error page must not surface as "[object Object]".
  it("degrades a non-JSON body to readable text", async () => {
    globalThis.fetch.mockResolvedValue(
      new Response("<html><body>Bad Gateway</body></html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );
    const error = await api.get("/cart/").catch((e) => e);
    expect(error.message).toContain("Bad Gateway");
    expect(error.message).not.toContain("[object Object]");
  });
});

describe("204 No Content", () => {
  it("resolves to null instead of failing to parse an empty body", async () => {
    globalThis.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete("/cart/items/abc/")).resolves.toBeNull();
  });
});
