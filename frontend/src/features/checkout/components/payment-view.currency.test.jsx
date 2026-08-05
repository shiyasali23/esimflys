// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The amount shown on the payment step.
 *
 * A PaymentIntent's `amount_minor` is ALREADY denominated in `intent.currency` — it
 * is the exact figure Stripe will debit. Two ways to get it wrong, both of which
 * show a number that is not what the customer pays:
 *
 *   1. Running it through `<Price usd={…} />`, which treats its input as USD and
 *      converts it into every display currency. An INR amount gets multiplied by
 *      the INR rate a second time.
 *   2. Dividing by 100 unconditionally. JPY has no minor unit, so Y1,140 becomes
 *      Y11.40 — a 100x error, and invisible in every 2-decimal currency.
 */

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_dummy";
});

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({ id: "stripe" })),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }) => <div data-testid="stripe-elements">{children}</div>,
  PaymentElement: ({ onReady }) => {
    onReady?.();
    return <div data-testid="payment-element" />;
  },
  useStripe: () => ({ confirmPayment: vi.fn() }),
  useElements: () => ({ id: "elements" }),
}));

const { PaymentView } = await import("./payment-view.client");
const { useCurrency } = await import("@/components/currency/use-currency.client");
const { navigationState } = await import("../../../../vitest.setup");

function intentResponse(intent) {
  return new Response(JSON.stringify(intent), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderWithIntent(intent) {
  globalThis.fetch = vi.fn(() => Promise.resolve(intentResponse(intent)));
  return render(<PaymentView />);
}

/** The "amount due" figure, read from its own container so no other price matches. */
async function amountDue() {
  const heading = await screen.findByText(/amount due/i);
  return heading.closest("div").parentElement.textContent;
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  navigationState.searchParams = new URLSearchParams("order=ord-1");
  useCurrency.setState({ currency: "USD", explicit: false });
});

afterEach(() => vi.restoreAllMocks());

describe("the amount is shown in the currency it will be charged in", () => {
  it("formats a USD intent as dollars", async () => {
    renderWithIntent({ client_secret: "pi_x_secret_y", amount_minor: 1699, currency: "USD" });
    expect(await amountDue()).toContain("$16.99");
  });

  /**
   * The regression this file was written for. With the INR rate at 83.2, converting
   * an already-INR amount again would render roughly Rs 51,000 for a Rs 599 charge.
   */
  it("does not convert an INR intent a second time", async () => {
    useCurrency.setState({ currency: "INR" });
    renderWithIntent({ client_secret: "pi_x_secret_y", amount_minor: 59900, currency: "INR" });

    const text = await amountDue();
    expect(text).toContain("₹599.00");
    // The old code rendered the figure through <Price>, which emits it as USD.
    // Asserting on "599.00" alone would pass either way; the symbol is the tell.
    expect(text).not.toContain("$");
  });

  it("does not divide a zero-decimal currency by 100", async () => {
    useCurrency.setState({ currency: "JPY" });
    renderWithIntent({ client_secret: "pi_x_secret_y", amount_minor: 1140, currency: "JPY" });

    const text = await amountDue();
    expect(text).toMatch(/[¥￥]1,140/);
    expect(text).not.toMatch(/11\.40/);
    expect(text).not.toContain("$");
  });

  it("names the charge currency, taken from the intent", async () => {
    renderWithIntent({ client_secret: "pi_x_secret_y", amount_minor: 59900, currency: "inr" });
    expect(await screen.findByText(/charged in inr/i)).toBeTruthy();
  });
});

describe("when the charge currency is not the one being browsed in", () => {
  /**
   * The server falls back to USD when a rate is stale or the converted total is
   * under Stripe's minimum. Silence there means someone shops in rupees and sees a
   * dollar line on their statement, which is how a good charge gets disputed.
   */
  it("says so plainly", async () => {
    useCurrency.setState({ currency: "INR" });
    renderWithIntent({ client_secret: "pi_x_secret_y", amount_minor: 1699, currency: "USD" });

    const notice = await screen.findByText(/prices are shown in/i);
    expect(notice.textContent).toMatch(/shown in INR/);
    expect(notice.textContent).toMatch(/charged in\s+USD/);
  });

  it("stays quiet when they agree", async () => {
    useCurrency.setState({ currency: "USD" });
    renderWithIntent({ client_secret: "pi_x_secret_y", amount_minor: 1699, currency: "USD" });

    await screen.findByTestId("stripe-elements");
    expect(screen.queryByText(/prices are shown in/i)).toBeNull();
  });

  /** Case from the API must not produce a spurious mismatch. */
  it("compares case-insensitively", async () => {
    useCurrency.setState({ currency: "USD" });
    renderWithIntent({ client_secret: "pi_x_secret_y", amount_minor: 1699, currency: "usd" });

    await screen.findByTestId("stripe-elements");
    expect(screen.queryByText(/prices are shown in/i)).toBeNull();
  });
});
