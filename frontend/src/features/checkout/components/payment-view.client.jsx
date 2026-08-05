"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { createPaymentIntent, isZeroTotal } from "@/lib/api/payments";
import { StripePaymentForm } from "./stripe-payment-form.client";
import { readOrderContext } from "@/features/checkout/order-context";
import { formatMinor } from "@/lib/format/money";
import { useCurrency } from "@/components/currency/use-currency.client";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * Creates the PaymentIntent for the placed order and mounts Stripe Elements.
 *
 * Stripe is real (test mode) — `client_secret` comes back as a genuine
 * `pi_…_secret_…` and must reach Stripe.js, or the intent is created and
 * abandoned and the order can never be paid.
 *
 * `loadStripe` is called at MODULE scope, once, per Stripe's documented
 * requirement. Calling it per render re-initialises the SDK on every state change.
 *
 * Nothing here marks the order paid — settlement is the server's signed webhook.
 * The confirmation screen polls for the real state, so an unsettled order shows as
 * unsettled rather than a false success.
 */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;
export function PaymentView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayCurrency = useCurrency((s) => s.currency);
  const [intent, setIntent] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = searchParams.get("order") || readOrderContext()?.orderId || null;
    setOrderId(id);
    if (!id) {
      setLoading(false);
      return;
    }

    let active = true;
    createPaymentIntent(id)
      .then((result) => {
        if (!active) return;
        // A fully discounted order is already settled — there is nothing to pay.
        if (isZeroTotal(result)) {
          router.replace(routes.confirmation());
          return;
        }
        setIntent(result);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        if (err?.code === "payment_already_completed") {
          router.replace(routes.confirmation());
          return;
        }
        setError(err?.message || "We couldn't start the payment. Please try again.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [searchParams, router]);

  if (loading) {
    return (
      <Container className="py-12">
        <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  if (!orderId) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Nothing to pay for"
          body="We couldn't find an order to pay. Your cart may already have been checked out."
          action={{ label: "Browse destinations", href: routes.destinations() }}
        />
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Payment couldn't be started"
          body={error}
          action={{ label: "Back to checkout", href: routes.checkout() }}
        />
      </Container>
    );
  }

  /**
   * The intent's amount is ALREADY denominated in `intent.currency` — it is what
   * Stripe will debit. It must not go through `<Price usd={…} />`, which treats its
   * input as USD and converts it into every display currency: an INR amount would
   * be multiplied by the INR rate a second time.
   *
   * `formatMinor` also reads the decimal count from the currency rather than
   * assuming two, so a zero-decimal currency is not shown at 1/100th of its value.
   */
  const chargeCurrency = intent?.currency?.toUpperCase() || "USD";
  const amount = formatMinor(intent?.amount_minor, chargeCurrency);
  const showsDifferentCurrency = displayCurrency !== chargeCurrency;

  return (
    <Container className="max-w-2xl py-12">
      <h1 className="mb-2 font-display text-headline-lg uppercase text-foreground">Payment</h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Your order is placed and awaiting payment. It is confirmed by our payment provider on the
        server — never from this page.
      </p>

      <div className="rounded-lg border border-border bg-white p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="font-display text-headline-md text-foreground">Amount due</p>
            <p className="text-body-sm text-muted-foreground">Charged in {chargeCurrency}</p>
          </div>
          <div className="font-display text-headline-md text-primary">{amount}</div>
        </div>

        {/**
          * The charge currency can differ from the one being browsed in: a rate can
          * go stale, or the converted total can fall under Stripe's minimum, and the
          * server falls back to USD rather than fail at the payment step.
          *
          * Said plainly rather than dressed up as an error, because nothing has gone
          * wrong — but it must not be silent either. Seeing one currency all the way
          * through checkout and a different one on the card statement is how a
          * legitimate charge gets reported as fraud.
          */}
        {showsDifferentCurrency ? (
          <p className="mb-6 rounded-md border border-border bg-muted p-3 text-body-sm text-muted-foreground">
            Prices are shown in {displayCurrency}, but this order is charged in{" "}
            <strong className="text-foreground">{chargeCurrency}</strong>. Your bank may apply its
            own conversion rate.
          </p>
        ) : null}

        {/* No publishable key means Stripe.js cannot mount. Say so rather than
            rendering a card form that silently cannot take money. */}
        {!stripePromise ? (
          <div role="alert" className="flex gap-3 rounded-md border border-border bg-muted p-4">
            <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <p className="text-body-sm text-muted-foreground">
              Card payments aren&apos;t configured on this deployment, so this order can&apos;t be
              paid here yet. Your order is saved — contact support with{" "}
              <strong className="text-foreground">{orderId}</strong> to complete it.
            </p>
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: intent.client_secret, appearance: { theme: "stripe" } }}
          >
            <StripePaymentForm amount={amount} />
          </Elements>
        )}
      </div>
    </Container>
  );
}
