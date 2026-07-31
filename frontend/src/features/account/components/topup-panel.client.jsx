"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Info } from "lucide-react";
import { listTopups, createTopupOrder } from "@/lib/api/esims";
import { saveOrderContext } from "@/features/checkout/order-context";
import { fromMinor, formatDataMb } from "@/lib/format/units";
import { StatusBadge } from "@/components/data/status-badge";
import { Price } from "@/components/currency/price";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";

/**
 * Buy more data for an existing eSIM.
 *
 * A top-up is an ordinary order, so this hands off to the same payment flow as a
 * first purchase rather than reimplementing it — and the eSIM's balance only
 * changes after the worker fulfils it, never on this click.
 *
 * `available` is empty whenever the profile's supplier offers no top-up, which is
 * a normal state and is worded as such.
 */
export function TopupPanel({ esimId, esimReady }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [buying, setBuying] = useState(null);
  const [buyError, setBuyError] = useState(null);

  useEffect(() => {
    let active = true;
    listTopups(esimId)
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [esimId]);

  async function buy(product) {
    setBuying(product.product_code);
    setBuyError(null);
    try {
      const order = await createTopupOrder(esimId, product.product_code);
      saveOrderContext({
        orderId: order.id,
        orderNumber: order.order_number,
        email: order.customer_email || null,
      });
      router.push(`${routes.payment()}?order=${encodeURIComponent(order.id)}`);
    } catch (err) {
      setBuyError(
        err?.code === "topup_not_supported"
          ? "This plan can't be topped up. You can buy a new eSIM for the same destination instead."
          : err?.message || "We couldn't start that top-up. Please try again.",
      );
      setBuying(null);
    }
  }

  if (error) {
    return (
      <section className="mt-8">
        <ErrorState error={error} title="We couldn't load top-ups" />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mt-8 rounded-card border border-border bg-white p-6">
        <div className="h-24 animate-pulse rounded-md bg-muted" aria-busy="true" />
      </section>
    );
  }

  const { available, history } = data;

  return (
    <section className="mt-8 rounded-card border border-border bg-white p-6">
      <h2 className="mb-4 font-display text-headline-md text-foreground">Add more data</h2>

      {!available.length ? (
        <p className="text-body-md text-muted-foreground">
          No top-ups are offered for this plan. You can buy another eSIM for the same destination
          whenever you need more data.
        </p>
      ) : !esimReady ? (
        <div className="flex gap-3 rounded-md border border-border bg-muted p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <p className="text-body-sm text-muted-foreground">
            Top-ups become available once this eSIM has finished provisioning.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {available.map((product) => (
            <li
              key={product.product_code}
              className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{product.name}</p>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  {formatDataMb(product.data_amount_mb)}
                  {product.validity_days ? ` · valid ${product.validity_days} days` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="font-display text-headline-md text-primary">
                  <Price usd={fromMinor(product.retail_amount_minor)} />
                </span>
                <button
                  type="button"
                  onClick={() => buy(product)}
                  disabled={Boolean(buying)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
                >
                  <Plus size={16} aria-hidden />
                  {buying === product.product_code ? "Starting…" : "Buy top-up"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {buyError ? (
        <p role="alert" className="mt-4 text-body-sm text-destructive">
          {buyError}
        </p>
      ) : null}

      {history.length ? (
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="mb-3 font-display text-lg font-semibold text-foreground">
            Previous top-ups
          </h3>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 text-body-sm">
                <span className="min-w-0 text-foreground">{entry.product_name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={entry.status} />
                  <span className="text-muted-foreground">
                    {new Date(entry.completed_at || entry.created_at).toLocaleDateString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
