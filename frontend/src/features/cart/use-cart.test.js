// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCart, cartIsEmpty } from "@/features/cart/use-cart.client";

/**
 * The cart store. The server owns pricing and quantities, so this only mirrors
 * what the API returns — the point of these tests is that it never invents or
 * retains state the server has not confirmed.
 */

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const CART = {
  id: "cart-1",
  currency: "USD",
  status: "active",
  items: [
    {
      id: "item-1",
      product_code: "SA-10GB-30D-V1",
      display_name: "Saudi Arabia 10 GB — 30 Days",
      quantity: 2,
      unit_amount_minor: 1499,
      line_total_minor: 2998,
    },
  ],
  subtotal_minor: 2998,
  item_count: 2,
};

const EMPTY_CART = { id: null, items: [], subtotal_minor: 0, item_count: 0 };

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "csrftoken=t; path=/";
  useCart.setState({ cart: null, loading: false, error: null, pendingItemId: null });
});

afterEach(() => vi.restoreAllMocks());

describe("cartIsEmpty", () => {
  // The backend represents an empty cart as {id: null, items: []}, not a 404.
  it("recognises the server's empty-cart shape", () => {
    expect(cartIsEmpty(EMPTY_CART)).toBe(true);
    expect(cartIsEmpty(null)).toBe(true);
    expect(cartIsEmpty(CART)).toBe(false);
  });
});

describe("refresh", () => {
  it("mirrors the server cart", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(CART));
    await useCart.getState().refresh();
    const { cart, loading } = useCart.getState();
    expect(cart.subtotal_minor).toBe(2998);
    expect(cart.items[0].quantity).toBe(2);
    expect(loading).toBe(false);
  });

  it("records the error without wiping the last known cart", async () => {
    useCart.setState({ cart: CART });
    globalThis.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await useCart.getState().refresh();
    expect(useCart.getState().error).toBeTruthy();
    expect(useCart.getState().cart).toEqual(CART);
  });
});

describe("add", () => {
  it("adopts the cart the server returns", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(CART, 201));
    const cart = await useCart.getState().add({ productCode: "SA-10GB-30D-V1", quantity: 2 });
    expect(cart.item_count).toBe(2);
    expect(useCart.getState().cart.item_count).toBe(2);
  });

  // The caller navigates on success, so a rejection must reach it.
  it("rethrows so the page does not navigate on failure", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "plan_unavailable", message: "Gone." } }, 409),
    );
    await expect(
      useCart.getState().add({ productCode: "X" }),
    ).rejects.toMatchObject({ code: "plan_unavailable" });
    expect(useCart.getState().error.code).toBe("plan_unavailable");
  });
});

describe("setQuantity", () => {
  it("applies the server's recalculated totals", async () => {
    const updated = { ...CART, item_count: 3, subtotal_minor: 4497 };
    globalThis.fetch.mockResolvedValue(jsonResponse(updated));
    await useCart.getState().setQuantity("item-1", 3);
    expect(useCart.getState().cart.subtotal_minor).toBe(4497);
    expect(useCart.getState().pendingItemId).toBeNull();
  });

  // Dropping to zero is a removal, not a zero-quantity line.
  it("removes the line when quantity falls below one", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(EMPTY_CART));
    await useCart.getState().setQuantity("item-1", 0);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(url).toContain("/cart/items/item-1/");
    expect(cartIsEmpty(useCart.getState().cart)).toBe(true);
  });

  it("clears the pending marker even when the update fails", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "cart_expired", message: "Start again." } }, 409),
    );
    await useCart.getState().setQuantity("item-1", 5);
    expect(useCart.getState().pendingItemId).toBeNull();
    expect(useCart.getState().error.code).toBe("cart_expired");
  });
});

describe("remove", () => {
  it("re-reads the cart afterwards rather than mutating it locally", async () => {
    globalThis.fetch
      .mockResolvedValueOnce(jsonResponse(null, 204))
      .mockResolvedValueOnce(jsonResponse(EMPTY_CART));
    await useCart.getState().remove("item-1");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch.mock.calls[1][1].method).toBe("GET");
    expect(cartIsEmpty(useCart.getState().cart)).toBe(true);
  });
});

describe("reset", () => {
  it("drops local state after checkout consumes the cart server-side", () => {
    useCart.setState({ cart: CART, error: new Error("x"), pendingItemId: "item-1" });
    useCart.getState().reset();
    expect(useCart.getState()).toMatchObject({
      cart: null,
      error: null,
      pendingItemId: null,
      loading: false,
    });
  });
});
