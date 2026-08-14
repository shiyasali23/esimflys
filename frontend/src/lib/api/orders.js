import { api, toList } from "./client";

/**
 * Checkout, orders, and the fulfilment poll (API.md §6.4, §6.6).
 *
 * Payment truth is the server's webhook, never the browser: after paying we poll
 * until the order reports `payment_status: "paid"` and then
 * `fulfillment_status: "delivered"`. Nothing here may mark an order paid locally.
 */

/**
 * Create an order straight from a list of products — no server-side cart.
 *
 * `items` names WHAT is bought, never what it costs. The server prices every line
 * itself and ignores any amount sent, which is what makes a stale `catalog.json`
 * a misquote rather than a mischarge.
 *
 * `idempotencyKey` is required rather than optional on purpose. If the response is
 * lost in flight the order still exists, and retrying with the SAME key returns that
 * original order instead of creating a second one. A fresh key per retry defeats the
 * whole mechanism, so the caller owns the key for the lifetime of one attempt.

 *
 * Quantity N expands into N order items — one eSIM each.
 */
export function checkoutDirect({
  items,
  customerEmail,
  firstName,
  lastName,
  phone,
  promoCode,
  currency,
  idempotencyKey,
}) {
  return api.post(
    "/checkout/direct/",
    {
      items: items.map((item) => ({
        product_code: item.productCode,
        quantity: item.quantity,
      })),
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      // Optional everywhere: delivery is by email, and a signed-in customer is never
      // asked for them. Omitted rather than sent blank so the payload says nothing it
      // does not mean.
      ...(firstName ? { customer_first_name: firstName } : {}),
      ...(lastName ? { customer_last_name: lastName } : {}),
      ...(phone ? { customer_phone: phone } : {}),
      ...(promoCode ? { promo_code: promoCode } : {}),
      ...(currency ? { currency } : {}),
    },
    idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined,
  );
}

/** Authenticated owners only — a guest who placed the order still gets 403 here. */
export function getOrder(orderId, options) {
  return api.get(`/orders/${encodeURIComponent(orderId)}/`, options);
}

/** Paginated, newest first, own orders only. DRF page size is 24. */
export async function listOrders({ page = 1, ...options } = {}) {
  const query = page > 1 ? `?page=${encodeURIComponent(page)}` : "";
  return toList(await api.get(`/orders/${query}`, options));
}

/**
 * The guest retrieval path, and the ONLY way a guest can see their own order.
 * Returns the order plus its eSIMs including activation credentials. Rate
 * limited to 10/min, which sets the guest polling interval. Wrong email → 404.
 */
export function lookupOrder({ orderNumber, email }) {
  return api.post("/orders/lookup/", { order_number: orderNumber, email });
}

const ORDER_PAID = "paid";
const FULFILLMENT_DELIVERED = "delivered";

const TERMINAL_PAYMENT = new Set(["failed", "cancelled", "refunded", "partially_refunded"]);
const TERMINAL_FULFILLMENT = new Set(["failed", "cancelled"]);

export function isPaid(order) {
  return order?.payment_status === ORDER_PAID;
}

export function isDelivered(order) {
  return order?.fulfillment_status === FULFILLMENT_DELIVERED;
}

/** True when waiting can no longer change the outcome. */
export function isTerminalFailure(order) {
  return (
    TERMINAL_PAYMENT.has(order?.payment_status) || TERMINAL_FULFILLMENT.has(order?.fulfillment_status)
  );
}

/**
 * Poll until the order is delivered, fails, or we run out of patience.
 *
 * Guests must poll `lookupOrder` because `getOrder` 403s for them — verified
 * against the running backend. The slower guest interval respects the 10/min limit
 * on that endpoint.
 *
 * @param {{orderId?: string, orderNumber?: string, email?: string,
 *          onUpdate?: (order: any, esims: any[]) => void, signal?: AbortSignal,
 *          timeoutMs?: number}} params
 * @returns {Promise<{order: any, esims: any[], timedOut: boolean}>}
 */
export async function pollOrderUntilDelivered({
  orderId,
  orderNumber,
  email,
  onUpdate,
  signal,
  timeoutMs = 90_000,
}) {
  const asGuest = Boolean(orderNumber && email);
  const baseInterval = asGuest ? 7000 : 3000;
  const startedAt = Date.now();

  let order = null;
  let esims = [];
  let wait = baseInterval;

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      if (asGuest) {
        const result = await lookupOrder({ orderNumber, email });
        order = result?.order ?? null;
        esims = Array.isArray(result?.esims) ? result.esims : [];
      } else {
        order = await getOrder(orderId, { signal });
        esims = [];
      }
      wait = baseInterval;
      onUpdate?.(order, esims);

      if (isTerminalFailure(order)) return { order, esims, timedOut: false };
      if (isPaid(order) && isDelivered(order)) return { order, esims, timedOut: false };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // 429 means we polled too eagerly; anything else may be a blip worth retrying.
      if (error?.status === 429) wait = Math.max(wait, (error.retryAfter || 30) * 1000);
      else if (error?.status === 404 || error?.status === 403) throw error;
      else wait = Math.min(wait * 2, 15_000);
    }

    await sleep(wait, signal);
  }

  return { order, esims, timedOut: true };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
