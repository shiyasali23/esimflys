"use client";

/**
 * Carries the just-placed order between checkout → payment → confirmation.
 *
 * A guest can only read their own order via `POST /orders/lookup/`, which needs
 * the order number AND the email. That email must never travel in a URL, so the
 * handoff goes through sessionStorage: it survives a refresh and the back button,
 * and dies with the tab.
 */

const KEY = "esimflys-order-context";

function store() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveOrderContext({ orderId, orderNumber, email }) {
  try {
    store()?.setItem(KEY, JSON.stringify({ orderId, orderNumber, email: email || null }));
  } catch {
    /* non-fatal — confirmation falls back to the manual lookup page */
  }
}

export function readOrderContext() {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.orderId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearOrderContext() {
  try {
    store()?.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
