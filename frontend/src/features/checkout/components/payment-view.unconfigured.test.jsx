// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The payment screen with no Stripe publishable key.
 *
 * Separate file because the key is read at MODULE scope — one import graph can
 * only ever see one value for it.
 *
 * A deployment without the key must not render a card form. A form that cannot
 * charge is worse than no form: the customer fills it in, submits, and nothing
 * happens. Say it plainly and give them their order reference instead.
 */

vi.hoisted(() => {
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
});

const loadStripe = vi.fn(() => Promise.resolve({ id: "stripe" }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe }));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment: vi.fn() }),
  useElements: () => ({}),
}));

const { PaymentView } = await import("./payment-view.client");
const { navigationState } = await import("../../../../vitest.setup");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  navigationState.searchParams = new URLSearchParams("order=ord-1");
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      jsonResponse({
        payment_id: "pay-1",
        client_secret: "pi_3TzD7tF2w_secret_abc123",
        amount_minor: 1699,
        currency: "USD",
      }),
    ),
  );
});

afterEach(() => vi.restoreAllMocks());

describe("with no publishable key", () => {
  it("does not initialise Stripe at all", () => {
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it("renders no card form", async () => {
    render(<PaymentView />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("stripe-elements")).toBeNull();
    expect(screen.queryByTestId("payment-element")).toBeNull();
    expect(screen.queryByRole("button", { name: /^pay/i })).toBeNull();
  });

  it("says card payments are unavailable and gives the order reference", async () => {
    render(<PaymentView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/aren't configured/i);
    expect(alert.textContent).toContain("ord-1");
  });

  /** The order exists and is recoverable — do not imply it was lost. */
  it("reassures that the order is saved", async () => {
    render(<PaymentView />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/your order is saved/i);
  });
});
