// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Elements, PaymentElement } from "@stripe/react-stripe-js";

/**
 * Pins ONE fact about react-stripe-js, against the real library rather than our mock.
 *
 * The intuitive belief — and the reason `payment-view.client.jsx` hoists its
 * `appearance` object — is that passing a fresh `options` literal to `<Elements>` on
 * every render re-creates the Payment Element and throws away digits the customer has
 * already typed. That belief is WRONG, and acting on it leads to pointless `useMemo`
 * churn on the one screen where money changes hands.
 *
 * react-stripe-js compares `options` by VALUE (`isEqual` recurses through plain
 * objects) and applies real differences with `elements.update()`, which mutates the
 * existing group. Nothing unmounts.
 *
 * If a future version of the library switches to identity comparison, this test fails
 * and the comment in payment-view stops being true — which is exactly when someone
 * needs to know.
 */
function stripeStub() {
  const element = {
    mount: vi.fn(),
    destroy: vi.fn(),
    update: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  };
  const group = { create: vi.fn(() => element), getElement: vi.fn(() => null), update: vi.fn() };
  // `isStripe()` in react-stripe-js sanity-checks these four methods before it will
  // accept the prop at all, so the stub has to carry them even though only
  // `elements` is exercised here.
  const stripe = {
    elements: vi.fn(() => group),
    createToken: vi.fn(),
    createPaymentMethod: vi.fn(),
    confirmCardPayment: vi.fn(),
    _registerWrapper: vi.fn(),
    registerAppInfo: vi.fn(),
  };
  return { stripe, group, element };
}

const OPTIONS = () => ({
  clientSecret: "pi_1_secret_abc",
  appearance: { theme: "stripe", variables: { colorPrimary: "#2563eb" } },
});

describe("a fresh options object on <Elements>", () => {
  it("does not re-create the Elements group or destroy the mounted element", () => {
    const { stripe, element } = stripeStub();
    const view = render(
      <Elements stripe={stripe} options={OPTIONS()}>
        <PaymentElement />
      </Elements>,
    );

    // A brand-new object with identical values — what an inline literal produces.
    view.rerender(
      <Elements stripe={stripe} options={OPTIONS()}>
        <PaymentElement />
      </Elements>,
    );

    expect(stripe.elements).toHaveBeenCalledTimes(1);
    expect(element.destroy).not.toHaveBeenCalled();
  });

  it("issues no update at all when only the object identity changed", () => {
    const { stripe, group } = stripeStub();
    const view = render(
      <Elements stripe={stripe} options={OPTIONS()}>
        <PaymentElement />
      </Elements>,
    );
    group.update.mockClear();

    view.rerender(
      <Elements stripe={stripe} options={OPTIONS()}>
        <PaymentElement />
      </Elements>,
    );

    expect(group.update).not.toHaveBeenCalled();
  });

  /** And a genuine change is a mutation, not a rebuild — the other half of the claim. */
  it("mutates the existing group when a value really changes", () => {
    const { stripe, group, element } = stripeStub();
    const view = render(
      <Elements stripe={stripe} options={OPTIONS()}>
        <PaymentElement />
      </Elements>,
    );
    group.update.mockClear();

    view.rerender(
      <Elements
        stripe={stripe}
        options={{ ...OPTIONS(), appearance: { theme: "night", variables: {} } }}
      >
        <PaymentElement />
      </Elements>,
    );

    expect(group.update).toHaveBeenCalledWith(
      expect.objectContaining({ appearance: { theme: "night", variables: {} } }),
    );
    expect(stripe.elements).toHaveBeenCalledTimes(1);
    expect(element.destroy).not.toHaveBeenCalled();
  });
});
