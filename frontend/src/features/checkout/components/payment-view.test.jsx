// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentView } from "./payment-view.client";
import { saveOrderContext, clearOrderContext } from "@/features/checkout/order-context";
import { routerMock, navigationState } from "../../../../vitest.setup";

/**
 * The payment step.
 *
 * The single rule this screen exists to honour: it must NEVER mark an order paid.
 * Settlement is the server's webhook, and the gateway is currently a stand-in that
 * returns `pi_fake_…` — a secret that must not reach Stripe.js. A screen that
 * optimistically showed success would tell someone their eSIM is on the way when
 * no money has moved.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INTENT = {
  payment_id: "pay-1",
  client_secret: "pi_fake_abc123",
  amount_minor: 1699,
  currency: "USD",
  payment_status: "pending",
  zero_total: false,
};

function mockApi(respond) {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(respond ? respond() : jsonResponse(INTENT, 201)),
  );
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  navigationState.searchParams = new URLSearchParams("order=ord-1");
  clearOrderContext();
});

afterEach(() => vi.restoreAllMocks());

describe("finding the order to pay for", () => {
  it("uses the order id from the query string", async () => {
    mockApi();
    render(<PaymentView />);

    await screen.findByText(/amount due/i);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ order_id: "ord-1" });
  });

  /**
   * A guest's email must never travel in a URL, so checkout hands the order over
   * through sessionStorage. Without that fallback a refresh would strand them.
   */
  it("falls back to the stored order context when the query string is bare", async () => {
    navigationState.searchParams = new URLSearchParams();
    saveOrderContext({ orderId: "ord-ctx", orderNumber: "ESF-1", email: "a@b.test" });
    mockApi();
    render(<PaymentView />);

    await screen.findByText(/amount due/i);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ order_id: "ord-ctx" });
  });

  it("offers a way out when there is no order at all", async () => {
    navigationState.searchParams = new URLSearchParams();
    mockApi();
    render(<PaymentView />);

    expect(await screen.findByText(/nothing to pay for/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /browse destinations/i })).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
});

describe("the amount", () => {
  it("is shown in major units from the minor-unit payload", async () => {
    mockApi();
    render(<PaymentView />);

    await screen.findByText(/amount due/i);
    // 1699 minor units is $16.99 — not $1,699.
    expect(screen.getByText("$16.99")).toBeTruthy();
    expect(screen.queryByText(/1,699/)).toBeNull();
  });
});

describe("the stand-in gateway", () => {
  /**
   * `pi_fake_…` is not a chargeable secret. Saying so is the honest thing: the
   * alternative is a card form that silently cannot take money.
   */
  it("says plainly that no card can be charged", async () => {
    mockApi();
    render(<PaymentView />);

    expect(await screen.findByText(/live card gateway isn't connected yet/i)).toBeTruthy();
    expect(screen.getByText(/stay unpaid until the payment provider confirms/i)).toBeTruthy();
  });

  it("drops that notice once a real secret arrives", async () => {
    mockApi(() => jsonResponse({ ...INTENT, client_secret: "pi_3Rk_secret_live" }, 201));
    render(<PaymentView />);

    await screen.findByText(/amount due/i);
    expect(screen.queryByText(/gateway isn't connected/i)).toBeNull();
  });

  it("never claims the order is paid", async () => {
    mockApi();
    render(<PaymentView />);

    await screen.findByText(/amount due/i);
    expect(screen.getByText(/confirmed by our payment provider on the server/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/payment (successful|complete|received)/i);
  });
});

describe("orders with nothing to charge", () => {
  /** A 100%-discount order is already settled; there is no intent to confirm. */
  it("skips straight to confirmation on a zero total", async () => {
    mockApi(() =>
      jsonResponse({ zero_total: true, client_secret: null, payment_status: "paid" }, 200),
    );
    render(<PaymentView />);

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/checkout/confirmation"));
    expect(screen.queryByText(/amount due/i)).toBeNull();
  });

  it("sends an already-paid order to confirmation rather than showing an error", async () => {
    mockApi(() =>
      jsonResponse(
        { error: { code: "payment_already_completed", message: "This order is already paid." } },
        409,
      ),
    );
    render(<PaymentView />);

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/checkout/confirmation"));
  });
});

describe("failures", () => {
  it("explains a refused intent and offers the way back", async () => {
    mockApi(() =>
      jsonResponse({ error: { code: "conflict", message: "This order was cancelled." } }, 409),
    );
    render(<PaymentView />);

    expect(await screen.findByText(/payment couldn't be started/i)).toBeTruthy();
    expect(screen.getByText("This order was cancelled.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to checkout/i })).toBeTruthy();
  });

  it("does not strand the user on a spinner when the request fails", async () => {
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<PaymentView />);

    await waitFor(() =>
      expect(document.querySelector("[aria-busy='true']")).toBeNull(),
    );
  });
});

describe("continuing", () => {
  /**
   * Continue navigates to confirmation, which polls the server for the REAL state.
   * It must not itself assert success.
   */
  it("hands off to confirmation without settling anything", async () => {
    mockApi();
    render(<PaymentView />);
    await screen.findByText(/amount due/i);

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(routerMock.push).toHaveBeenCalledWith("/checkout/confirmation");
    // Exactly one POST: the intent. Nothing that could mark the order paid.
    expect(posts()).toHaveLength(1);
    expect(String(posts()[0][0])).toContain("/payments/payment-intent/");
  });
});
