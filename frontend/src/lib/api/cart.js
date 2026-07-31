import { api } from "./client";
import { clearCartToken } from "./cart-token";

/**
 * Cart (API.md §6.3). The server is authoritative: it reprices at checkout, so
 * anything here is indicative. The `X-Cart-Token` that identifies a guest cart is
 * captured and replayed by the API client — call sites never handle it.
 */

export function getCart() {
  return api.get("/cart/");
}

/** First call creates the cart and issues the token. */
export function addCartItem({ productCode, quantity = 1 }) {
  return api.post("/cart/items/", { product_code: productCode, quantity });
}

export function updateCartItem(itemId, quantity) {
  return api.patch(`/cart/items/${encodeURIComponent(itemId)}/`, { quantity });
}

export function removeCartItem(itemId) {
  return api.delete(`/cart/items/${encodeURIComponent(itemId)}/`);
}

/**
 * Preview only — the server does NOT persist the code. It must be sent again to
 * /checkout/ or the discount is silently lost. Rate limited to 30/min.
 */
export function previewPromoCode({ code, customerEmail }) {
  return api.post("/cart/promo-code/", {
    code,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
  });
}

/** An empty cart comes back as {id: null, items: [], subtotal_minor: 0}. */
export function isCartEmpty(cart) {
  return !cart || !cart.id || !Array.isArray(cart.items) || cart.items.length === 0;
}

/** After a completed checkout the token refers to a consumed cart. */
export function forgetCart() {
  clearCartToken();
}
