// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutView } from "@/features/checkout/components/checkout-view.client";
import { useCart } from "@/features/cart/use-cart.client";
import { routerMock } from "../../../../vitest.setup";

/**
 * Checkout in one call. There is no server-side cart: `POST /checkout/direct/` names
 * WHAT is bought and the server prices every line itself, so the totals rendered here
 * are indicative and nothing derived on this screen may be treated as the charge.
 *
 * Two rules these tests exist to protect:
 *  - the idempotency key — one per purchase ATTEMPT, so a response lost in flight
 *    cannot become a second order;
 *  - identity before payment — an eSIM is delivered by email, so an order with no
 *    address is not an order.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ORDER = {
  id: "ord-1",
  order_number: "EF-2026-0001",
  customer_email: "traveller@example.com",
  status: "pending_payment",
};

/** One eSIM per line — the store has no way to produce anything else. */
const ITEM = {
  productCode: "SA-10GB-30D-V1",
  displayName: "10 GB",
  countryName: "Saudi Arabia",
  countrySlug: "saudi-arabia",
  usd: 14.99,
  quantity: 1,
};

/** A second destination, for the cases that need more than one eSIM in the order. */
const ITEM_2 = {
  productCode: "TH-5GB-30D-V1",
  displayName: "5 GB",
  countryName: "Thailand",
  countrySlug: "thailand",
  usd: 9.5,
  quantity: 1,
};

/** The anonymous /account/me/ probe, plus whatever checkout should answer. */
function mockApi({ signedInAs = null, account, checkout } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    const u = String(url);
    if (u.includes("/account/me/")) {
      return Promise.resolve(
        signedInAs || account
          ? jsonResponse(account || { id: "u1", email: signedInAs })
          : jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403),
      );
    }
    if (init?.method === "POST" && u.includes("/checkout/direct/")) {
      return Promise.resolve(checkout ? checkout() : jsonResponse(ORDER, 201));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

const checkoutCalls = () =>
  globalThis.fetch.mock.calls.filter(
    ([url, init]) => init?.method === "POST" && String(url).includes("/checkout/direct/"),
  );

const body = (index = 0) => JSON.parse(checkoutCalls()[index][1].body);
const select = (...items) => useCart.setState({ items, hydrated: true });

/** Waits past the mount effect, which hydrates the store and probes the session. */
const ready = () => screen.findByText(/Saudi Arabia · 10 GB/);

/**
 * Two pay buttons render: one in the summary card, one in the bar pinned to the
 * bottom on mobile. They share a form, so either places the same order.
 */
const payButtons = () =>
  // Matches the in-flight label too, so a query does not evaporate mid-submit.
  screen.getAllByRole("button", { name: /proceed to payment|placing order/i });
const pay = (which = 0) => userEvent.click(payButtons()[which]);

/** One field and a Continue button — the whole of guest identity. */
async function fillGuest({ mail = "traveller@example.com" } = {}) {
  const box = await screen.findByLabelText(/email address/i);
  if (mail) await userEvent.type(box, mail);
  await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
}

async function submitAsGuest(details) {
  await ready();
  await fillGuest(details);
  await pay();
}

let uuid = 0;

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  window.sessionStorage.clear();
  useCart.setState({ items: [], hydrated: true });
  uuid = 0;
  // Deterministic, and distinct per call, so "reused the same key" is a real assertion.
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => `key-${++uuid}`);
});

afterEach(() => vi.restoreAllMocks());

describe("nothing selected", () => {
  it("offers a way out instead of an empty form", async () => {
    mockApi();
    render(<CheckoutView />);
    expect(await screen.findByText(/no plan selected yet/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /browse destinations/i })).toBeTruthy();
  });
});

describe("with a selection", () => {
  it("renders the line items from the local selection", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    // Priced from the committed catalogue.
    expect(screen.getAllByText("$14.99").length).toBeGreaterThan(0);
  });

  /** An internal SKU means nothing to a shopper and competes with the plan name. */
  it("does not show the internal product code", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    expect(screen.queryByText("SA-10GB-30D-V1")).toBeNull();
  });

  it("pluralises the eSIM count across destinations", async () => {
    mockApi();
    select(ITEM, ITEM_2);
    render(<CheckoutView />);
    await ready();
    expect(screen.getAllByText(/2 eSIMs/).length).toBeGreaterThan(0);
  });

  it("says eSIM singular for one", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    expect(screen.getAllByText(/1 eSIM(?!s)/).length).toBeGreaterThan(0);
  });

  /**
   * There is no quantity stepper: one plan is one eSIM, and the only edit available on
   * a line is removing it. Asserted as an absence because the controls existed here
   * until they were taken out, and a revert would otherwise pass silently.
   */
  it("offers no quantity controls", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    expect(screen.queryByRole("button", { name: /increase quantity/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /decrease quantity/i })).toBeNull();
    expect(screen.getByRole("button", { name: /remove 10 GB/i })).toBeTruthy();
  });

  /** A second destination is picked from the catalogue, not from inside checkout. */
  it("does not offer to add another destination from here", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    expect(screen.queryByRole("link", { name: /add another destination/i })).toBeNull();
  });

  it("removes a line locally and falls back to the empty state", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    await userEvent.click(screen.getByRole("button", { name: /remove 10 GB/i }));

    expect(await screen.findByText(/no plan selected yet/i)).toBeTruthy();
  });
});

/**
 * The bar pinned to the bottom on mobile exists because the summary is otherwise the
 * last thing on a long page. It is not a second checkout — it drives the same form.
 */
describe("the pinned mobile bar", () => {
  it("repeats the total and the pay button", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    expect(payButtons()).toHaveLength(2);
    expect(screen.getAllByText("$14.99").length).toBeGreaterThanOrEqual(2);
  });

  it("places the same order from either button", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    await fillGuest();
    await pay(1);

    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(body().items[0].product_code).toBe("SA-10GB-30D-V1");
  });

  // One `submitting` flag drives both, so neither can be double-submitted.
  it("disables both while the order is in flight", async () => {
    let release;
    mockApi({ checkout: () => new Promise((resolve) => { release = () => resolve(jsonResponse(ORDER, 201)); }) });
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await waitFor(() => expect(payButtons()[0].disabled).toBe(true));
    for (const button of payButtons()) expect(button.disabled).toBe(true);
    release();
  });
});

describe("identity", () => {
  /**
   * One field, because the order needs exactly one thing: somewhere to send the QR
   * code. Name and phone are optional to the backend, and every extra box on a
   * checkout screen is a chance to abandon the purchase.
   */
  it("asks for an email and nothing else", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    expect(await screen.findByLabelText(/email address/i)).toBeTruthy();
    expect(screen.queryByLabelText(/first name/i)).toBeNull();
    expect(screen.queryByLabelText(/last name/i)).toBeNull();
    expect(screen.queryByLabelText(/phone/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  /** OAuth needs a full-page redirect, so it must be an anchor, not a fetch button. */
  it("offers Google below the email box, not above it", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    const google = await screen.findByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toBe("/accounts/google/login/");

    const box = screen.getByLabelText(/email address/i);
    // DOCUMENT_POSITION_FOLLOWING === Google comes after the email field in the page.
    expect(box.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("points people with an account at sign-in", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    expect((await screen.findByRole("link", { name: /^sign in$/i })).getAttribute("href")).toBe(
      "/auth/signin",
    );
  });

  it("uses the account instead of asking, when signed in", async () => {
    mockApi({ signedInAs: "a@b.com" });
    select(ITEM);
    render(<CheckoutView />);
    expect(await screen.findByText("a@b.com")).toBeTruthy();
    expect(screen.queryByLabelText(/email address/i)).toBeNull();
  });

  /** Someone on a shared machine must be able to buy without the wrong account. */
  it("lets a signed-in customer hand over to someone else", async () => {
    mockApi({ signedInAs: "a@b.com" });
    select(ITEM);
    render(<CheckoutView />);
    await screen.findByText("a@b.com");

    await userEvent.click(screen.getByRole("button", { name: /use another account|change/i }));

    expect(await screen.findByLabelText(/email address/i)).toBeTruthy();
  });

  /**
   * `fetchMeOrNull` only swallows 401/403. A backend that is down answers 500 through
   * the proxy, which used to surface as an unhandled rejection and left the page with no
   * way to buy at all.
   */
  it("falls back to guest checkout when the session probe fails outright", async () => {
    globalThis.fetch = vi.fn((url) =>
      String(url).includes("/account/me/")
        ? Promise.resolve(new Response("Internal Server Error", { status: 500 }))
        : Promise.resolve(jsonResponse({})),
    );
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    expect(await screen.findByLabelText(/email address/i)).toBeTruthy();
  });

  it("shows neither form nor account until the session probe answers", async () => {
    let release;
    globalThis.fetch = vi.fn((url) =>
      String(url).includes("/account/me/")
        ? new Promise((resolve) => {
            release = () =>
              resolve(jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403));
          })
        : Promise.resolve(jsonResponse({})),
    );
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    expect(screen.queryByLabelText(/email address/i)).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    release();
  });

  /** Both routes in collapse to the same card: where the QR code is going. */
  it("collapses to the delivery address once confirmed, and can be reopened", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    await fillGuest();

    expect(await screen.findByText("traveller@example.com")).toBeTruthy();
    expect(screen.getByText(/we'll send your eSIM QR code here/i)).toBeTruthy();
    expect(screen.queryByLabelText(/email address/i)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /use another account|change/i }));
    expect(screen.getByLabelText(/email address/i).value).toBe("traveller@example.com");
  });

  it("survives a reload, like the selection does", async () => {
    window.sessionStorage.setItem("esimflys-guest", JSON.stringify("saved@example.com"));
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    expect(screen.getByLabelText(/email address/i).value).toBe("saved@example.com");
  });

  /** A tab left open across the change still holds the old multi-field record. */
  it("reads an email out of the previous stored shape", async () => {
    window.sessionStorage.setItem(
      "esimflys-guest",
      JSON.stringify({ firstName: "Jordan", lastName: "Lee", email: "old@example.com", phone: "" }),
    );
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    expect(screen.getByLabelText(/email address/i).value).toBe("old@example.com");
  });
});

describe("identity is required before paying", () => {
  it("refuses to place an order with no address to deliver to", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    await pay();

    expect(await screen.findByText(/tell us where to send your eSIM/i)).toBeTruthy();
    expect(checkoutCalls()).toHaveLength(0);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("brings the field into view and focuses it", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    await pay();

    await screen.findByText(/enter the email address/i);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText(/email address/i));
  });

  it("will not confirm an address that is not an email", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    await fillGuest({ mail: "jordan@" });

    expect(await screen.findByText(/enter the email address/i)).toBeTruthy();
    expect(screen.getByLabelText(/email address/i).getAttribute("aria-invalid")).toBe("true");
    expect(checkoutCalls()).toHaveLength(0);
  });
});

describe("what the order request carries", () => {
  it("sends product codes, quantities and the delivery address", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(body()).toMatchObject({
      items: [{ product_code: "SA-10GB-30D-V1", quantity: 1 }],
      customer_email: "traveller@example.com",
    });
    expect(checkoutCalls()[0][1].headers["X-Cart-Token"]).toBeUndefined();
  });

  /** The account owns the address; asking again would be a second source of truth. */
  it("uses the account email for a signed-in customer", async () => {
    mockApi({ signedInAs: "a@b.com" });
    select(ITEM);
    render(<CheckoutView />);
    await screen.findByText("a@b.com");
    await pay();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(body().customer_email).toBe("a@b.com");
  });

  it("sends a promo code when one is typed", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();
    await userEvent.click(screen.getByRole("button", { name: /have a promo code/i }));
    await userEvent.type(screen.getByLabelText(/promo code/i), "SUNRISE20");
    await submitAsGuest();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(body().promo_code).toBe("SUNRISE20");
  });

  it("omits promo_code entirely when the field is left empty", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(body()).not.toHaveProperty("promo_code");
  });

  /**
   * Most shoppers have no code, so the field stays behind a link. It must not be in the
   * accessibility tree until asked for, or a screen-reader user meets an empty
   * required-looking box on the way to the pay button.
   */
  it("keeps the promo field out of the page until it is asked for", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await ready();

    expect(screen.queryByLabelText(/promo code/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /have a promo code/i }));
    expect(screen.getByLabelText(/promo code/i)).toBeTruthy();
  });
});

/**
 * The reason the endpoint takes a key at all: if the 201 is lost in flight the order
 * still exists, and the second attempt has to resolve to it rather than charge twice.
 */
describe("the idempotency key", () => {
  const failOnce = () => {
    let attempt = 0;
    mockApi({
      checkout: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse({ error: { code: "internal_error", message: "Boom." } }, 500)
          : jsonResponse(ORDER, 201);
      },
    });
  };

  it("sends one on the first attempt", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(checkoutCalls()[0][1].headers["Idempotency-Key"]).toBe("key-1");
  });

  /** The one that matters: a retry of the SAME attempt must not mint a new key. */
  it("reuses the same key when the first attempt fails and the user retries", async () => {
    failOnce();
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await screen.findByRole("alert");
    await pay();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(2));
    const keys = checkoutCalls().map(([, init]) => init.headers["Idempotency-Key"]);
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  /**
   * A changed selection is a different purchase. Holding the old key would make the
   * server answer with the order the PREVIOUS selection created.
   */
  it("mints a fresh key once the selection is edited", async () => {
    mockApi({ checkout: () => jsonResponse({ error: { code: "internal_error", message: "Boom." } }, 500) });
    select(ITEM, ITEM_2);
    render(<CheckoutView />);
    await submitAsGuest();
    await screen.findByRole("alert");

    // Dropping a line is the only edit the screen still offers.
    await userEvent.click(screen.getByRole("button", { name: /remove 5 GB/i }));
    await pay();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(2));
    const keys = checkoutCalls().map(([, init]) => init.headers["Idempotency-Key"]);
    expect(keys[1]).not.toBe(keys[0]);
  });

  /** So does a changed address — the eSIM would go to the wrong person otherwise. */
  it("mints a fresh key once the delivery email is edited", async () => {
    mockApi({ checkout: () => jsonResponse({ error: { code: "internal_error", message: "Boom." } }, 500) });
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: /use another account|change/i }));
    await userEvent.clear(screen.getByLabelText(/email address/i));
    await userEvent.type(screen.getByLabelText(/email address/i), "someone.else@example.com");
    await userEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await pay();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(2));
    const keys = checkoutCalls().map(([, init]) => init.headers["Idempotency-Key"]);
    expect(keys[1]).not.toBe(keys[0]);
    expect(body(1).customer_email).toBe("someone.else@example.com");
  });
});

describe("a placed order", () => {
  it("clears the selection and moves to payment with the order id", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith("/checkout/payment?order=ord-1"),
    );
    expect(useCart.getState().items).toEqual([]);
  });

  // The confirmation screen polls by id and shows the number; both come from here.
  it("records the order context for the screens that follow", async () => {
    mockApi();
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    const saved = JSON.parse(window.sessionStorage.getItem("esimflys-order-context"));
    expect(saved).toMatchObject({ orderId: "ord-1", orderNumber: "EF-2026-0001" });
  });
});

/**
 * The 50-unit ceiling is enforced when the order is created (contract §5.1). Neither
 * of these refusals can be cleared by pressing the button again, so neither message
 * may say "try again" without saying what has to change first.
 */
describe("refusals that a retry cannot fix", () => {
  const refuse = (code, message) =>
    mockApi({ checkout: () => jsonResponse({ error: { code, message } }, 409) });

  it("names the ceiling and the remedy", async () => {
    refuse("cart_limit_exceeded", "Cart limit exceeded.");
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/maximum of 50 eSIMs/i);
    expect(alert.textContent).toMatch(/remove some/i);
  });

  it("explains a plan withdrawn between browsing and buying", async () => {
    refuse("plan_unavailable", "Plan is not available.");
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    expect((await screen.findByRole("alert")).textContent).toMatch(/no longer available/i);
  });

  it("keeps the selection and re-enables the buttons, so the user is not stranded", async () => {
    refuse("plan_unavailable", "Plan is not available.");
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();
    await screen.findByRole("alert");

    expect(useCart.getState().items).toHaveLength(1);
    for (const button of payButtons()) expect(button.disabled).toBe(false);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  /** A field error belongs on the field, and the field is a long way up on mobile. */
  it("puts a rejected email back on the input and scrolls to it", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockApi({
      checkout: () =>
        jsonResponse(
          {
            error: {
              code: "validation_error",
              message: "Invalid.",
              fields: { customer_email: ["Enter a valid email address."] },
            },
          },
          400,
        ),
    });
    select(ITEM);
    render(<CheckoutView />);
    await submitAsGuest();

    await userEvent.click(await screen.findByRole("button", { name: /use another account|change/i }));
    expect(await screen.findByText(/enter a valid email address/i)).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
