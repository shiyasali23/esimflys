"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Info } from "lucide-react";
import { createPaymentIntent, isStubSecret, isZeroTotal } from "@/lib/api/payments";
import { readOrderContext } from "@/features/checkout/order-context";
import { fromMinor } from "@/lib/format/units";
import { Price } from "@/components/currency/price";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * Creates the PaymentIntent for the placed order.
 *
 * The gateway is a stand-in today: `client_secret` arrives as `pi_fake_…`, which
 * must not be given to Stripe.js. Crucially, nothing here may mark the order paid
 * — settlement is the server's webhook. The confirmation screen polls for the
 * real state, so an unsettled order shows as unsettled instead of a false success.
 */
export function PaymentView() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const usesStubGateway = isStubSecret(intent);

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
            <p className="text-body-sm text-muted-foreground">Charged in {intent?.currency || "USD"}</p>
          </div>
          <div className="font-display text-headline-md text-primary">
            <Price usd={fromMinor(intent?.amount_minor)} />
          </div>
        </div>

        {usesStubGateway ? (
          <div className="mb-6 flex gap-3 rounded-md border border-border bg-muted p-4">
            <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <p className="text-body-sm text-muted-foreground">
              The live card gateway isn&apos;t connected yet, so no card can be charged here. Continue
              to see your order&apos;s real status — it will stay unpaid until the payment provider
              confirms it.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => router.push(routes.confirmation())}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-4 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110"
        >
          <Lock size={18} aria-hidden /> Continue
        </button>
        <p className="mt-3 text-center text-body-sm text-muted-foreground">
          Charged in USD · SSL secured
        </p>
      </div>
    </Container>
  );
}
