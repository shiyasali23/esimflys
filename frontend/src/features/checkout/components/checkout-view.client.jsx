"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/features/cart/use-cart.client";
import { Price } from "@/components/currency/price";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * Checkout content — reads the cart (client store). Uses a mounted guard so the
 * server + first client render match (persisted store hydrates after mount → no
 * hydration mismatch). Empty cart → empty state; else order summary + identity.
 */
export function CheckoutView() {
  const [mounted, setMounted] = useState(false);
  const item = useCart((s) => s.item);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Container className="py-12">
        <div className="h-72 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  if (!item) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          body="Choose a destination and a data plan to get started."
          action={{ label: "Browse destinations", href: routes.destinations() }}
        />
      </Container>
    );
  }

  return (
    <Container className="py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-headline-lg uppercase text-foreground">Secure checkout</h1>
        <span className="rounded-full border border-success-text/20 bg-success-text/10 px-3 py-1 text-label-caps uppercase text-success-text">
          Secure SSL
        </span>
      </div>

      <div className="grid items-start gap-12 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          <section className="rounded-lg border border-border bg-white p-8">
            <h2 className="mb-4 font-display text-headline-md text-foreground">Your plan</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-headline-md text-foreground">
                  {item.countryName} · {item.dataLabel}
                </p>
                <p className="text-body-sm text-muted-foreground">
                  {item.isUnlimited ? `${item.perDayGb} GB/day · ` : ""}Valid for {item.validityDays} days
                </p>
              </div>
              <div className="font-display text-headline-md text-primary">
                <Price usd={item.usd} />
              </div>
            </div>
            <Link
              href={routes.country(item.countrySlug)}
              className="mt-4 inline-block text-label-bold text-primary hover:underline"
            >
              Change plan
            </Link>
          </section>

          <section className="rounded-lg border border-border bg-white p-8">
            <h2 className="mb-6 font-display text-headline-md text-foreground">1. Your identity</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                className="flex items-center justify-center gap-3 rounded-md border border-border bg-muted py-4 font-semibold text-foreground hover:bg-muted"
              >
                Continue with Google
              </button>
              <label className="block">
                <span className="sr-only">Email address</span>
                <input
                  type="email"
                  placeholder="Email address"
                  className="w-full rounded-md border border-border bg-muted px-4 py-4 text-body-md outline-none focus:border-primary"
                />
              </label>
            </div>
            <p className="mt-3 text-body-sm text-muted-foreground">
              Guest checkout — we'll email your eSIM QR code.
            </p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-span-5">
          <div className="rounded-lg border border-border bg-white p-8 shadow-sm">
            <h2 className="mb-6 font-display text-headline-md text-foreground">Order summary</h2>
            <dl className="mb-6 space-y-3 text-body-md">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{item.dataLabel} plan</dt>
                <dd>
                  <Price usd={item.usd} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">eSIM activation</dt>
                <dd className="font-semibold text-success-text">FREE</dd>
              </div>
              <div className="flex items-end justify-between border-t border-border pt-4">
                <dt className="font-display text-headline-md text-foreground">Total</dt>
                <dd className="font-display text-headline-md text-primary">
                  <Price usd={item.usd} />
                </dd>
              </div>
            </dl>
            <Link
              href={routes.payment()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-4 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110"
            >
              Proceed to payment <ArrowRight size={20} aria-hidden />
            </Link>
            <p className="mt-3 text-center text-body-sm text-muted-foreground">
              Charged in USD. Prices shown in your currency are indicative.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
