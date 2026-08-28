// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminOrderDetail } from "@/features/admin/components/admin-order-detail.client";

/**
 * Cancelling an order from the panel.
 *
 * The endpoint existed for a day with no way to reach it, which left 56 unpaid orders on
 * production that only an API call could clear. These tests cover the button and, more
 * importantly, when it must NOT be offered: a paid order is a refund, and a cancel
 * button on one can only ever return 409 and make an operator think the panel is broken.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const order = (overrides) => ({
  id: "ord-1",
  order_number: "ESF-TEST0001",
  customer_email: "buyer@example.com",
  currency: "USD",
  subtotal_minor: 399,
  discount_minor: 0,
  tax_minor: 0,
  total_minor: 399,
  status: "pending_payment",
  payment_status: "pending",
  fulfillment_status: "pending",
  placed_at: "2026-08-01T00:00:00Z",
  created_at: "2026-08-01T00:00:00Z",
  promo_code_snapshot: null,
  referring_organization_name: null,
  item_count: 1,
  items: [],
  payments: [],
  esims: [],
  ...overrides,
});

function mockApi({ detail = order(), write } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method && init.method !== "GET") {
      return Promise.resolve(write ? write(String(url), init) : jsonResponse(detail));
    }
    return Promise.resolve(jsonResponse(detail));
  });
}

const writes = () =>
  globalThis.fetch.mock.calls.filter((c) => c[1]?.method && c[1].method !== "GET");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  globalThis.fetch = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("cancelling an unpaid order", () => {
  it("offers the action while the order is unpaid", async () => {
    mockApi();
    render(<AdminOrderDetail orderId="ord-1" />);
    expect(await screen.findByRole("button", { name: /cancel this order/i })).toBeTruthy();
  });

  it("posts to the cancel endpoint", async () => {
    mockApi({ write: () => jsonResponse(order({ status: "cancelled", payment_status: "cancelled" })) });
    render(<AdminOrderDetail orderId="ord-1" />);

    await userEvent.click(await screen.findByRole("button", { name: /cancel this order/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [url, init] = writes()[0];
    expect(init.method).toBe("POST");
    expect(String(url)).toContain("/admin/orders/ord-1/cancel/");
  });

  it("hides the action once the order is cancelled", async () => {
    mockApi({ write: () => jsonResponse(order({ status: "cancelled", payment_status: "cancelled" })) });
    render(<AdminOrderDetail orderId="ord-1" />);

    await userEvent.click(await screen.findByRole("button", { name: /cancel this order/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /cancel this order/i })).toBeNull(),
    );
  });

  /**
   * The server's 409 names the reason — "carries a payment in processing", "an eSIM was
   * already provisioned". Replacing it with something vaguer throws away the only part
   * an operator can act on.
   */
  it("shows the server's refusal verbatim", async () => {
    mockApi({
      write: () =>
        jsonResponse(
          {
            error: {
              code: "conflict",
              message: "This order cannot be cancelled: an eSIM was already provisioned.",
            },
          },
          409,
        ),
    });
    render(<AdminOrderDetail orderId="ord-1" />);

    await userEvent.click(await screen.findByRole("button", { name: /cancel this order/i }));

    expect(await screen.findByText(/an eSIM was already provisioned/i)).toBeTruthy();
  });
});

describe("orders that took money", () => {
  it("offers no cancel button on a paid order", async () => {
    mockApi({ detail: order({ status: "paid", payment_status: "paid" }) });
    render(<AdminOrderDetail orderId="ord-1" />);

    await screen.findByText("ESF-TEST0001");
    expect(screen.queryByRole("button", { name: /cancel this order/i })).toBeNull();
  });

  it("offers no cancel button on a refunded order", async () => {
    mockApi({ detail: order({ status: "refunded", payment_status: "refunded" }) });
    render(<AdminOrderDetail orderId="ord-1" />);

    await screen.findByText("ESF-TEST0001");
    expect(screen.queryByRole("button", { name: /cancel this order/i })).toBeNull();
  });
});
