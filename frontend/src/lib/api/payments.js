import { api } from "./client";

/**
 * Payments (API.md §6.5).
 *
 * Stripe is real (test mode): `client_secret` comes back as a genuine
 * `pi_…_secret_…` and is handed to Stripe.js. Going live is a key change, not a
 * code change. Payment is settled by the server's signed webhook, so nothing
 * here decides that a payment succeeded.
 */

/** Idempotent per order: repeat calls return the same payment_id and secret. */
export function createPaymentIntent(orderId) {
  return api.post("/payments/payment-intent/", { order_id: orderId });
}

/**
 * A 100%-discount order is already settled and has no intent to confirm —
 * the response is {zero_total: true, client_secret: null, payment_status: "paid"}.
 */
export function isZeroTotal(intent) {
  return Boolean(intent?.zero_total);
}
