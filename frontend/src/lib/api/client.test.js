import { describe, it, expect, vi, afterEach } from "vitest";
import { toList, apiFetch } from "@/lib/api/client";

afterEach(() => vi.restoreAllMocks());

// Catalogue routes return a plain array; orders/esims/admin return a paginated
// envelope (API.md §2c). Screens must never have to know which.
describe("toList", () => {
  it("normalises a plain array from the catalogue endpoints", () => {
    const list = toList([{ slug: "saudi-arabia" }, { slug: "thailand" }]);
    expect(list.results).toHaveLength(2);
    expect(list.count).toBe(2);
    expect(list.next).toBeNull();
  });

  it("passes a paginated envelope through with its cursors intact", () => {
    const list = toList({
      count: 57,
      next: "http://localhost:3000/api/v1/orders/?page=2",
      previous: null,
      results: [{ id: "a" }],
    });
    expect(list.results).toHaveLength(1);
    expect(list.count).toBe(57);
    expect(list.next).toContain("page=2");
  });

  it("yields an empty list rather than throwing on null or an unexpected shape", () => {
    expect(toList(null).results).toEqual([]);
    expect(toList(undefined).count).toBe(0);
    expect(toList({ detail: "nope" }).results).toEqual([]);
  });
});

/**
 * Non-JSON error bodies.
 *
 * A short plain-text line from a proxy is a usable message. A traceback is not:
 * Django's technical 500 returns a PLAIN-TEXT stack dump when the request accepts
 * JSON, and the previous slice(0,200) pasted the top of it straight into the UI —
 * verified live when a stub gateway rejected a payment intent.
 */
describe("error bodies that are not JSON", () => {
  const respond = (body, type, status = 500) =>
    new Response(body, { status, statusText: "Internal Server Error", headers: { "content-type": type } });

  /**
   * "Bad Gateway" is an HTTP status phrase, not a sentence. It reads as information
   * to a developer and as nothing to the customer who just pressed Buy, so it must
   * not become the visible message — while the status and code stay intact for
   * diagnostics and for `actionForError` to route on.
   */
  it("does not put a gateway status phrase in front of the user", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(respond("Bad Gateway", "text/plain", 502)));
    const error = await apiFetch("/admin/orders/").catch((e) => e);

    expect(error.message).not.toContain("Bad Gateway");
    expect(error.message).toMatch(/our side/i);
    expect(error.status).toBe(502);
    expect(error.code).toBe("internal_error");
  });

  it("drops a multi-line traceback and falls back to the status text", async () => {
    const traceback =
      "InvalidRequestError at /api/v1/admin/orders/x/refunds/\n" +
      "Request req_a9cw0t1GmEtW3n: No such payment_intent: 'pi_devfixture01'\n\n" +
      "Request Method: POST\nRequest URL: http://127.0.0.1:8000/...";
    globalThis.fetch = vi.fn(() => Promise.resolve(respond(traceback, "text/plain")));

    const error = await apiFetch("/admin/orders/").catch((e) => e);
    expect(error.message).toMatch(/our side/i);
    expect(error.message).not.toContain("payment_intent");
    expect(error.message).not.toContain("Request Method");
  });

  it("drops an HTML error page rather than rendering markup", async () => {
    const page = "<!doctype html>\n<html><body><h1>502 Bad Gateway</h1></body></html>";
    globalThis.fetch = vi.fn(() => Promise.resolve(respond(page, "text/html", 502)));

    const error = await apiFetch("/admin/orders/").catch((e) => e);
    expect(error.message).not.toContain("<");
  });

  it("still reports a failure when the body is empty", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(respond("", "text/plain")));
    const error = await apiFetch("/admin/orders/").catch((e) => e);
    expect(error.status).toBe(500);
    expect(error.message).toMatch(/our side/i);
  });
});
