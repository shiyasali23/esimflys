/**
 * Guest carts are identified by an opaque token the server returns exactly ONCE —
 * as the `X-Cart-Token` response header on the first `POST /cart/items/` (API.md §4).
 * Lose it and the guest's cart is unreachable, so it is captured centrally by the
 * API client and persisted here.
 *
 * Logged-in users don't need it; their cart is tied to the account.
 */

const STORAGE_KEY = "esimflys-cart-token";

/** localStorage throws in Safari private mode and when quota is exhausted. */
function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCartToken() {
  try {
    return storage()?.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function writeCartToken(token) {
  if (typeof token !== "string" || !token) return;
  try {
    storage()?.setItem(STORAGE_KEY, token);
  } catch {
    /* non-fatal: the cart still works for this page view */
  }
}

/** Call after a completed checkout, or on `cart_expired`. */
export function clearCartToken() {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}
