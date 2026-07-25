"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useCart } from "@/features/cart/use-cart.client";
import { Price } from "@/components/currency/price";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * Payment step — DEMO mode. In production the backend creates a Stripe
 * PaymentIntent and this mounts Stripe's hosted Payment Element (blueprint §24).
 * No card data is collected here and no real charge is made.
 */
export function PaymentView() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const item = useCart((s) => s.item);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Container className="py-12">
        <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }
  if (!item) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Nothing to pay for"
          body="Your cart is empty."
          action={{ label: "Browse destinations", href: routes.destinations() }}
        />
      </Container>
    );
  }

  function pay() {
    setProcessing(true);
    // Simulate PSP round-trip, then land on confirmation.
    setTimeout(() => router.push(routes.confirmation()), 900);
  }

  return (
    <Container className="max-w-2xl py-12">
      <h1 className="mb-2 font-display text-headline-lg uppercase text-foreground">Payment</h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Demo mode — Stripe's hosted Payment Element is wired to the backend in production.
        No real payment is taken and no card data is collected here.
      </p>
      <div className="rounded-lg border border-border bg-white p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="font-display text-headline-md text-foreground">
              {item.countryName} · {item.dataLabel}
            </p>
            <p className="text-body-sm text-muted-foreground">Valid for {item.validityDays} days</p>
          </div>
          <div className="font-display text-headline-md text-primary">
            <Price usd={item.usd} />
          </div>
        </div>
        <button
          type="button"
          onClick={pay}
          disabled={processing}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-4 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
        >
          <Lock size={18} aria-hidden /> {processing ? "Processing…" : "Complete purchase (demo)"}
        </button>
        <p className="mt-3 text-center text-body-sm text-muted-foreground">Charged in USD · SSL secured</p>
      </div>
    </Container>
  );
}
