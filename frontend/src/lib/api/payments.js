import { api } from "./client";

/**
 * Payments (API.md §6.5).
 *
 * The gateway is a stand-in today: `client_secret` comes back as `pi_fake_…`,
 * which must NOT be handed to Stripe.js. The flow below is the real one — when
 * live keys land, only the confirmation step changes. Payment is settled by the
 * server webhook, so nothing here decides that a payment succeeded.
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

export function isStubSecret(intent) {
  return typeof intent?.client_secret === "string" && intent.client_secret.startsWith("pi_fake_");
}
