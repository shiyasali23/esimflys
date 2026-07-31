// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfirmationView } from "@/features/checkout/components/confirmation-view.client";
import { saveOrderContext, clearOrderContext } from "@/features/checkout/order-context";

/**
 * The screen that tells a customer whether they have paid.
 *
 * It used to invent an order number with Math.random() and declare success
 * unconditionally. These tests assert the opposite property: nothing is claimed
 * that the server hasn't confirmed.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PENDING = {
  order: {
    id: "o1",
    order_number: "ESF-REAL123",
    payment_status: "pending",
    fulfillment_status: "pending",
    total_minor: 2998,
  },
  esims: [],
};

const DELIVERED = {
  order: { ...PENDING.order, payment_status: "paid", fulfillment_status: "delivered" },
  esims: [
    {
      status: "ready",
      product_name: "Saudi Arabia 10 GB",
      credentials: {
        iccid: "8944138302270011502",
        smdp_address: "smdp.fake-esim.example.com",
        activation_code: "13317BD174",
        qr_payload: "LPA:1$smdp.fake-esim.example.com$13317BD174",
      },
    },
  ],
};

beforeEach(() => {
  globalThis.fetch = vi.fn(() => new Promise(() => {}));
  document.cookie = "csrftoken=t; path=/";
  clearOrderContext();
});

afterEach(() => vi.restoreAllMocks());

describe("no order in this session", () => {
  it("says so and points at the lookup, rather than inventing one", async () => {
    render(<ConfirmationView />);
    expect(await screen.findByText(/no recent order/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /find my order/i });
    expect(link.getAttribute("href")).toBe("/orders/lookup");
  });
});

describe("before the server confirms payment", () => {
  beforeEach(() => {
    saveOrderContext({ orderId: "o1", orderNumber: "ESF-REAL123", email: "a@b.com" });
  });

  it("does not claim the order is confirmed", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(PENDING));
    render(<ConfirmationView />);
    expect(await screen.findByText(/waiting for your payment/i)).toBeTruthy();
    expect(screen.queryByText(/your esim is ready/i)).toBeNull();
  });

  it("shows the server's order number, not a generated one", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(PENDING));
    render(<ConfirmationView />);
    expect(await screen.findByText("ESF-REAL123")).toBeTruthy();
  });

  it("shows no QR until there is one to show", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(PENDING));
    render(<ConfirmationView />);
    await screen.findByText(/waiting for your payment/i);
    expect(screen.queryByRole("img", { name: /qr/i })).toBeNull();
    expect(screen.getByText(/appears here once the order is paid/i)).toBeTruthy();
  });
});

describe("once paid and provisioned", () => {
  beforeEach(() => {
    saveOrderContext({ orderId: "o1", orderNumber: "ESF-REAL123", email: "a@b.com" });
  });

  it("reports success and renders the real activation details", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(DELIVERED));
    render(<ConfirmationView />);
    expect(await screen.findByText(/your esim is ready/i)).toBeTruthy();
    expect(screen.getByText("smdp.fake-esim.example.com")).toBeTruthy();
    expect(screen.getByText("13317BD174")).toBeTruthy();
  });
});

describe("terminal failure", () => {
  beforeEach(() => {
    saveOrderContext({ orderId: "o1", orderNumber: "ESF-REAL123", email: "a@b.com" });
  });

  it("says the order needs attention and that no eSIM was issued", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({
        order: { ...PENDING.order, payment_status: "failed" },
        esims: [],
      }),
    );
    render(<ConfirmationView />);
    expect(await screen.findByText(/order needs attention/i)).toBeTruthy();
    expect(screen.getByText(/no esim has been issued/i)).toBeTruthy();
  });
});

describe("guest vs account routing", () => {
  /**
   * `GET /orders/{id}/` returns 403 for a guest — verified against the running
   * backend — so a guest must be polled through the lookup endpoint instead.
   */
  it("polls the lookup endpoint when an email is held for the order", async () => {
    saveOrderContext({ orderId: "o1", orderNumber: "ESF-REAL123", email: "a@b.com" });
    globalThis.fetch.mockResolvedValue(jsonResponse(DELIVERED));
    render(<ConfirmationView />);
    await screen.findByText(/your esim is ready/i);
    const called = globalThis.fetch.mock.calls.map((c) => c[0]);
    expect(called.some((u) => String(u).includes("/orders/lookup/"))).toBe(true);
  });
});
