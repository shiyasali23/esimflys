// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pollOrderUntilDelivered } from "@/lib/api/orders";

/**
 * The fulfilment poll. This is the loop that decides whether a customer is told
 * their eSIM is ready, so its stopping conditions matter more than its speed.
 *
 * Each case resolves on the FIRST poll, so no timer advancing is needed — the
 * loop only sleeps when it intends to poll again.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const DELIVERED = {
  id: "o1",
  order_number: "ESF-AAA",
  payment_status: "paid",
  fulfillment_status: "delivered",
};

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("stopping conditions", () => {
  it("resolves once the order is paid AND delivered", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(DELIVERED));
    const result = await pollOrderUntilDelivered({ orderId: "o1" });
    expect(result.timedOut).toBe(false);
    expect(result.order.fulfillment_status).toBe("delivered");
  });

  // Paid but not yet provisioned must NOT end the poll, or the QR never appears.
  it("keeps waiting while payment is settled but fulfilment is pending", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ ...DELIVERED, fulfillment_status: "pending" }),
    );
    const result = await pollOrderUntilDelivered({ orderId: "o1", timeoutMs: 1 });
    expect(result.timedOut).toBe(true);
    expect(result.order.fulfillment_status).toBe("pending");
  });

  it("stops immediately on a terminal failure rather than waiting out the timeout", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ ...DELIVERED, payment_status: "failed", fulfillment_status: "pending" }),
    );
    const result = await pollOrderUntilDelivered({ orderId: "o1" });
    expect(result.timedOut).toBe(false);
    expect(result.order.payment_status).toBe("failed");
  });

  it("reports a timeout without inventing an outcome", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ ...DELIVERED, payment_status: "pending" }));
    const result = await pollOrderUntilDelivered({ orderId: "o1", timeoutMs: 1 });
    expect(result.timedOut).toBe(true);
  });
});

describe("guest vs account path", () => {
  // GET /orders/{id}/ returns 403 for a guest — verified against the running
  // backend — so a guest poll must go through the lookup endpoint instead.
  it("uses POST /orders/lookup/ when an order number and email are supplied", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ order: DELIVERED, esims: [] }));
    await pollOrderUntilDelivered({
      orderId: "o1",
      orderNumber: "ESF-AAA",
      email: "a@b.com",
    });
    const [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toContain("/orders/lookup/");
    expect(init.method).toBe("POST");
  });

  it("uses GET /orders/{id}/ for an account holder", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(DELIVERED));
    await pollOrderUntilDelivered({ orderId: "o1" });
    const [url, init] = globalThis.fetch.mock.calls.at(-1);
    expect(url).toContain("/orders/o1/");
    expect(init.method).toBe("GET");
  });

  it("surfaces the guest's eSIM credentials, which only lookup returns", async () => {
    const esims = [{ status: "ready", credentials: { qr_payload: "LPA:1$smdp$code" } }];
    globalThis.fetch.mockResolvedValue(jsonResponse({ order: DELIVERED, esims }));
    const result = await pollOrderUntilDelivered({
      orderId: "o1",
      orderNumber: "ESF-AAA",
      email: "a@b.com",
    });
    expect(result.esims[0].credentials.qr_payload).toBe("LPA:1$smdp$code");
  });
});

describe("failure handling", () => {
  it("gives up on 404 instead of hammering a missing order", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "not_found", message: "No such order." } }, 404),
    );
    await expect(pollOrderUntilDelivered({ orderId: "nope" })).rejects.toMatchObject({
      status: 404,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up on 403 rather than retrying an unauthorised read", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "permission_denied", message: "Nope." } }, 403),
    );
    await expect(pollOrderUntilDelivered({ orderId: "o1" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("honours an abort signal so a unmounted view stops polling", async () => {
    const controller = new AbortController();
    controller.abort();
    globalThis.fetch.mockResolvedValue(jsonResponse(DELIVERED));
    await expect(
      pollOrderUntilDelivered({ orderId: "o1", signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
  });

  it("reports progress through onUpdate as it polls", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(DELIVERED));
    const seen = [];
    await pollOrderUntilDelivered({ orderId: "o1", onUpdate: (o) => seen.push(o.payment_status) });
    expect(seen).toEqual(["paid"]);
  });
});
