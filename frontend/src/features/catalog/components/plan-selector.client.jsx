"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Price } from "@/components/currency/price";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/features/cart/use-cart.client";
import { cn } from "@/lib/cn";
import { routes } from "@/config/routes";

export function PlanSelector({ country, plans }) {
  const router = useRouter();
  const addToCart = useCart((s) => s.add);
  const defaultId =
    plans.find((p) => p.isDefaultSelected)?.product_id || plans[0]?.product_id;
  const [selectedId, setSelectedId] = useState(defaultId);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const selected = plans.find((p) => p.product_id === selectedId) || plans[0];

  async function handleContinue() {
    setAdding(true);
    setError(null);
    try {
      await addToCart({ productCode: selected.product_id, quantity: 1 });
      router.push(routes.checkout());
    } catch (err) {
      // plan_unavailable means the catalogue moved under us — a reload re-reads it.
      setError(
        err?.code === "plan_unavailable"
          ? "That plan just became unavailable. Refresh to see current plans."
          : err?.message || "We couldn't add that plan. Please try again.",
      );
      setAdding(false);
    }
  }

  const label = (p) => (p.isUnlimited ? "Unlimited" : `${p.data_gb} GB`);
  const sub = (p) =>
    p.isUnlimited ? `${p.perDayGb} GB/day · ${p.validity_days} days` : `Valid ${p.validity_days} days`;

  if (!selected) return null;

  const networks = country.networks || [];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-8">
        <h2 className="mb-4 font-display text-headline-md uppercase text-foreground">Choose your plan</h2>
        <fieldset>
          <legend className="sr-only">Choose a data plan for {country.name}</legend>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {plans.map((p) => {
              const isSel = p.product_id === selectedId;
              return (
                <label
                  key={p.product_id}
                  className={cn(
                    "relative flex cursor-pointer flex-col rounded-2xl border bg-card p-4 transition-all hover:border-primary/50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    isSel ? "border-primary bg-muted ring-1 ring-primary" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p.product_id}
                    checked={isSel}
                    onChange={() => setSelectedId(p.product_id)}
                    className="sr-only"
                  />
                  <div className="flex min-h-6 items-start justify-between gap-1">
                    {p.badge ? (
                      <Badge
                        tone={p.badge === "value" ? "essential" : "highlight"}
                        className="px-2 py-0.5 text-[10px]"
                      >
                        {p.badge}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        isSel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-transparent",
                      )}
                    >
                      <Check size={12} />
                    </span>
                  </div>
                  <div className="mt-2 font-display text-2xl leading-none text-foreground">{label(p)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{sub(p)}</p>
                  <div className="mt-3 font-display text-xl leading-none text-primary">
                    <Price usd={p.retail_price_usd} />
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div
          data-checkout-bar
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-4 pt-3 shadow-l3 backdrop-blur lg:hidden"
        >
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your plan</p>
                <p className="truncate font-display text-lg leading-tight text-foreground">
                  {label(selected)} · {selected.validity_days} days
                </p>
              </div>
              <div aria-live="polite" className="font-display text-2xl leading-none text-primary">
                <Price usd={selected.retail_price_usd} />
              </div>
            </div>
            <button
              type="button"
              onClick={handleContinue}
              disabled={adding}
              className="mt-2.5 flex w-full items-center justify-center rounded-full bg-cta px-6 py-3 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
            >
              {adding ? "Adding…" : "Continue to checkout"}
            </button>
            <p className="mt-1.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
              Secure checkout
            </p>
          </div>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="lg:sticky lg:top-24">
          <div className="rounded-card border border-border bg-card p-6 shadow-l2">
            <h2 className="mb-5 font-display text-headline-md uppercase text-foreground">Purchase summary</h2>
            <dl className="space-y-3 text-body-md">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-semibold text-foreground">{label(selected)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Validity</dt>
                <dd className="font-semibold text-foreground">{selected.validity_days} days</dd>
              </div>
              {networks.length ? (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">
                    Network{networks.length > 1 ? "s" : ""}
                  </dt>
                  <dd className="text-right font-medium text-foreground">{networks.join(", ")}</dd>
                </div>
              ) : null}
              <div className="flex items-end justify-between border-t border-border pt-4">
                <dt className="font-display text-headline-md text-foreground">Total</dt>
                <dd aria-live="polite" className="font-display text-headline-lg text-primary">
                  <Price usd={selected.retail_price_usd} />
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={handleContinue}
              disabled={adding}
              className="mt-5 flex w-full items-center justify-center rounded-full bg-cta px-6 py-3.5 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
            >
              {adding ? "Adding…" : "Continue to checkout"}
            </button>
            {error ? (
              <p role="alert" className="mt-3 text-center text-body-sm text-destructive">
                {error}
              </p>
            ) : null}
            <p className="mt-3 text-center text-label-caps uppercase text-muted-foreground">Secure checkout</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
