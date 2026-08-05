"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";
import { routes } from "@/config/routes";

/**
 * Collects the card and confirms the PaymentIntent.
 *
 * This component does NOT decide that the order is paid. `confirmPayment`
 * returning without an error only means Stripe accepted the card — settlement is
 * the signed webhook, and the confirmation screen polls the server for it
 * (contract §5.5, §14.4). Nothing here writes an order status.
 *
 * `redirect: "if_required"` keeps the common card path on-page; 3-D Secure and
 * redirect-based methods still leave and come back, which is why `return_url`
 * has to point at the poller rather than at this form.
 *
 * `return_url` is built from `window.location.origin`, NOT from `SITE.baseUrl`.
 * The two differ in exactly the case that matters: `SITE.baseUrl` falls back to
 * `http://localhost:3000` when `NEXT_PUBLIC_SITE_URL` is missing at build time, and
 * a production deploy that forgot it would take a UPI payment and then strand the
 * customer on a dead localhost URL — charged, with no confirmation and no eSIM.
 * UPI is redirect-based, so this is the normal path for Indian buyers, not an edge
 * case. The browser's own origin is correct by construction on every host.
 */
export function StripePaymentForm({ amount }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    // Stripe.js loads asynchronously; until both are present there is nothing to confirm.
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${routes.confirmation()}` },
      redirect: "if_required",
    });

    if (stripeError) {
      // card_error and validation_error are the user's to fix and are safe to show.
      // Anything else is ours, and its message may leak internals — keep it generic.
      const isUserFixable =
        stripeError.type === "card_error" || stripeError.type === "validation_error";
      setError(
        isUserFixable
          ? stripeError.message
          : "We couldn't process that payment. Your card has not been charged.",
      );
      setSubmitting(false);
      return;
    }

    // No error means Stripe accepted it. The order is NOT paid yet — confirmation polls.
    router.push(routes.confirmation());
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/**
       * Reserved height, not decoration. The Payment Element mounts at zero height
       * and grows as its iframe loads, which shoved the Pay button and the page
       * footer down by ~172px — measured, not guessed. A floor absorbs that first
       * mount so nothing below it jumps while someone is reading the amount.
       *
       * It is a MIN height: Stripe settles taller than this once Link's optional
       * fields appear, and the element is free to grow. We cannot remove the
       * remaining shift — the iframe's height is Stripe's to decide, not ours.
       */}
      <div className="relative min-h-[19rem]">
        {/**
          * The Payment Element takes a couple of seconds to mount: Stripe.js loads,
          * then its iframe negotiates which methods this currency and account allow.
          * Until it paints there is nothing on screen at all, and a blank white box
          * above a disabled Pay button reads as broken rather than as loading.
          *
          * The skeleton sits inside the reserved height and is absolutely positioned,
          * so it occupies no space of its own and adds no layout shift when it goes.
          */}
        {!ready ? (
          <div className="absolute inset-0 space-y-4" aria-hidden>
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
            <div className="flex gap-4">
              <div className="h-11 w-1/2 animate-pulse rounded-md bg-muted" />
              <div className="h-11 w-1/2 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
          </div>
        ) : null}
        {/* Screen readers get a status instead of the decorative skeleton above. */}
        {!ready ? (
          <p role="status" className="sr-only">
            Loading payment methods…
          </p>
        ) : null}
        <PaymentElement onReady={() => setReady(true)} />
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || !ready || submitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-4 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
      >
        <Lock size={18} aria-hidden />
        {submitting ? "Paying…" : <>Pay {amount}</>}
      </button>

      <p className="mt-3 text-center text-body-sm text-muted-foreground">
        Your card is handled by Stripe. We never see or store the number.
      </p>
    </form>
  );
}
