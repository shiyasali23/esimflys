// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { apiFetch, api, readCsrfToken } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

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

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "csrftoken=tok123; path=/";
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
    await api.get("/api/v1/orders/");
    expect(lastCall()[0]).toBe("/api/v1/orders/");
  });
});

describe("CSRF", () => {
  it("reads the token from the cookie", () => {
    expect(readCsrfToken()).toBe("tok123");
  });

  it("sends X-CSRFToken on unsafe methods", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ ok: true }, { status: 201 }));
    await api.post("/checkout/direct/", { items: [] });
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
    await api.post("/checkout/direct/", {});
    document.cookie = "csrftoken=rotated456; path=/";
    await api.post("/checkout/direct/", {});
    expect(lastCall()[1].headers["X-CSRFToken"]).toBe("rotated456");
  });
});
