// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The payment step.
 *
 * Stripe is REAL (test mode): the backend returns a genuine `pi_…_secret_…`,
 * verified live. The failure this file exists to prevent is the one that was
 * actually shipped — creating that PaymentIntent and then abandoning it, so the
 * order sat at `pending_payment` forever and no eSIM was ever provisioned.
 *
 * The second rule is unchanged: this screen must NEVER mark an order paid.
 * `confirmPayment` returning cleanly only means Stripe accepted the card;
 * settlement is the signed webhook, which the confirmation screen polls for.
 */

// The publishable key is read at module scope, so it must exist before the
// component module is imported — hoisted above the import graph.
const { confirmPayment } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_dummy";
  return { confirmPayment: vi.fn() };
});

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({ id: "stripe" })),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children, options }) => (
    <div data-testid="stripe-elements" data-client-secret={options?.clientSecret}>
      {children}
    </div>
  ),
  PaymentElement: ({ onReady }) => {
    onReady?.();
    return <div data-testid="payment-element" />;
  },
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({ id: "elements" }),
}));

const { PaymentView } = await import("./payment-view.client");
const { saveOrderContext, clearOrderContext } = await import("@/features/checkout/order-context");
const { routerMock, navigationState } = await import("../../../../vitest.setup");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const INTENT = {
  payment_id: "pay-1",
  client_secret: "pi_3TzD7tF2w_secret_abc123",
  amount_minor: 1699,
  currency: "USD",
};

function mockApi(respond) {
  globalThis.fetch = vi.fn(() => Promise.resolve(respond ? respond() : jsonResponse(INTENT, 200)));
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");
const pay = async () => userEvent.click(await screen.findByRole("button", { name: /^pay/i }));

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  navigationState.searchParams = new URLSearchParams("order=ord-1");
  clearOrderContext();
  confirmPayment.mockReset();
  confirmPayment.mockResolvedValue({});
});

afterEach(() => vi.restoreAllMocks());

describe("finding the order to pay for", () => {
  it("uses the order id from the query string", async () => {
    mockApi();
    render(<PaymentView />);

    await screen.findByTestId("stripe-elements");
    expect(JSON.parse(posts()[0][1].body)).toEqual({ order_id: "ord-1" });
  });

  /** A guest's email must never travel in a URL, so checkout hands over via storage. */
  it("falls back to the stored order context when the query string is bare", async () => {
    navigationState.searchParams = new URLSearchParams();
    saveOrderContext({ orderId: "ord-ctx", orderNumber: "ESF-1", email: "a@b.test" });
    mockApi();
    render(<PaymentView />);

    await screen.findByTestId("stripe-elements");
    expect(JSON.parse(posts()[0][1].body)).toEqual({ order_id: "ord-ctx" });
  });

  it("offers a way out when there is no order at all", async () => {
    navigationState.searchParams = new URLSearchParams();
    mockApi();
    render(<PaymentView />);

    expect(await screen.findByText(/nothing to pay for/i)).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
});

describe("mounting Stripe", () => {
  /** The whole point: the real secret has to reach Stripe.js. */
  it("hands the client_secret to Elements", async () => {
    mockApi();
    render(<PaymentView />);

    const elements = await screen.findByTestId("stripe-elements");
    expect(elements.getAttribute("data-client-secret")).toBe(INTENT.client_secret);
    expect(screen.getByTestId("payment-element")).toBeTruthy();
  });

  it("shows the amount in major units from the minor-unit payload", async () => {
    mockApi();
    render(<PaymentView />);

    await screen.findByTestId("stripe-elements");
    // 1699 minor units is $16.99 — not $1,699.
    expect(screen.getAllByText("$16.99").length).toBeGreaterThan(0);
  });

  it("never claims the order is already paid", async () => {
    mockApi();
    render(<PaymentView />);

    await screen.findByTestId("stripe-elements");
    expect(screen.getByText(/confirmed by our payment provider on the server/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/payment (successful|complete|received)/i);
  });
});

describe("confirming the payment", () => {
  it("confirms with Stripe and only then moves to confirmation", async () => {
    mockApi();
    render(<PaymentView />);
    await pay();

    await waitFor(() => expect(confirmPayment).toHaveBeenCalledTimes(1));
    expect(confirmPayment.mock.calls[0][0]).toMatchObject({
      elements: { id: "elements" },
      redirect: "if_required",
    });
    expect(routerMock.push).toHaveBeenCalledWith("/checkout/confirmation");
  });

  /**
   * 3-D Secure leaves the page; it must return to the poller, not to this form.
   *
   * The origin has to come from the live page, not from `SITE.baseUrl` — that falls
   * back to localhost when `NEXT_PUBLIC_SITE_URL` is missing at build time, and a
   * deploy that forgot it would take a UPI payment and strand the buyer on a dead
   * URL. UPI is redirect-based, so that is the ordinary path for Indian customers.
   */
  it("sends redirect-based methods back to the confirmation poller on this origin", async () => {
    mockApi();
    render(<PaymentView />);
    await pay();

    await waitFor(() => expect(confirmPayment).toHaveBeenCalled());
    const { return_url: returnUrl } = confirmPayment.mock.calls[0][0].confirmParams;
    expect(returnUrl).toBe(`${window.location.origin}/checkout/confirmation`);
  });

  /**
   * The single most important assertion here: confirming a card is not the same
   * as being paid. Only the intent POST may ever leave this screen.
   */
  it("issues no request that could mark the order paid", async () => {
    mockApi();
    render(<PaymentView />);
    await pay();

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    expect(posts()).toHaveLength(1);
    expect(String(posts()[0][0])).toContain("/payments/payment-intent/");
  });

  it("keeps the user on the page when the card is declined", async () => {
    mockApi();
    confirmPayment.mockResolvedValue({
      error: { type: "card_error", message: "Your card was declined." },
    });
    render(<PaymentView />);
    await pay();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Your card was declined.")).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  /** A non-card Stripe error may carry internals; show something safe instead. */
  it("does not surface an internal Stripe error verbatim", async () => {
    mockApi();
    confirmPayment.mockResolvedValue({
      error: { type: "api_error", message: "No such payment_intent: pi_internal_xyz" },
    });
    render(<PaymentView />);
    await pay();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/card has not been charged/i);
    expect(alert.textContent).not.toContain("pi_internal_xyz");
  });

  it("lets the user try again after a decline", async () => {
    mockApi();
    confirmPayment.mockResolvedValue({
      error: { type: "card_error", message: "Your card was declined." },
    });
    render(<PaymentView />);
    await pay();

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /^pay/i }).disabled).toBe(false);
  });
});

describe("orders with nothing to charge", () => {
  /** A 100%-discount order is already settled; calling Stripe would fail. */
  it("skips Stripe entirely on a zero total", async () => {
    mockApi(() =>
      jsonResponse({ zero_total: true, client_secret: null, payment_status: "paid" }, 200),
    );
    render(<PaymentView />);

    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith("/checkout/confirmation"));
    expect(confirmPayment).not.toHaveBeenCalled();
    expect(screen.queryByTestId("stripe-elements")).toBeNull();
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
    expect(confirmPayment).not.toHaveBeenCalled();
  });
});

describe("when the intent cannot be created", () => {
  it("explains a refusal and offers the way back", async () => {
    mockApi(() =>
      jsonResponse({ error: { code: "conflict", message: "This order was cancelled." } }, 409),
    );
    render(<PaymentView />);

    expect(await screen.findByText(/payment couldn't be started/i)).toBeTruthy();
    expect(screen.getByText("This order was cancelled.")).toBeTruthy();
    expect(screen.queryByTestId("stripe-elements")).toBeNull();
  });

  it("does not strand the user on a spinner", async () => {
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<PaymentView />);

    await waitFor(() => expect(document.querySelector("[aria-busy='true']")).toBeNull());
  });
});
