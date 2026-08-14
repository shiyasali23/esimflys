"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOrder } from "@/lib/api/orders";
import { useSession } from "@/features/auth/use-session.client";
import { ErrorState } from "@/components/feedback/error-state";
import { fromMinor, formatDataMb } from "@/lib/format/units";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * A single order: line items, money breakdown, and current state.
 *
 * Activation credentials are deliberately absent — those live on the eSIM detail
 * route, so a receipt page never exposes a QR. Totals come straight from the
 * server's stored figures; nothing is recomputed here.
 */
export function OrderDetail({ orderId }) {
  const user = useSession((s) => s.user);
  const loadSession = useSession((s) => s.load);
  const sessionError = useSession((s) => s.error);
  const retrySession = useSession((s) => s.retry);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getOrder(orderId)
      .then((data) => active && setOrder(data))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [user, orderId]);

  /**
   * A session that could not be verified is NOT a signed-out session. The store only
   * sets `user = null` when the server said 401/403; any other failure leaves it
   * `undefined`, which used to render the loading skeleton forever — no message, no
   * retry, nothing to act on. Same treatment as `admin-shell`.
   */
  if (sessionError) {
    return (
      <ErrorState
        error={sessionError}
        title="We couldn't verify your session"
        onRetry={retrySession}
      />
    );
  }

  if (user === undefined) {
    return (
      <Container className="py-16">
        <div className="mx-auto h-64 max-w-3xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  if (user === null) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Sign in to view this order"
          body="Order details are only shown to the account that placed them."
          action={{ label: "Sign in", href: routes.signin() }}
        />
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-16">
        {error.status === 404 ? (
          <EmptyState
            title="Order not found"
            body="We couldn't find that order on your account."
            action={{ label: "Back to orders", href: routes.accountOrders() }}
          />
        ) : (
          <ErrorState error={error} title="We couldn't load this order" />
        )}
      </Container>
    );
  }

  if (!order) {
    return (
      <Container className="py-16">
        <div className="mx-auto h-72 max-w-3xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  const items = order.items || [];

  return (
    <Container className="max-w-3xl py-12">
      <Link
        href={routes.accountOrders()}
        className="mb-6 inline-flex items-center gap-1.5 text-label-bold text-primary hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> Your orders
      </Link>

      <h1 className="font-display text-headline-lg uppercase text-foreground">{order.order_number}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.payment_status} />
        <StatusBadge status={order.fulfillment_status} />
        {order.placed_at ? (
          <span className="text-body-sm text-muted-foreground">
            Placed {new Date(order.placed_at).toLocaleString()}
          </span>
        ) : null}
      </div>

      <section className="mt-8 rounded-card border border-border bg-white p-6">
        <h2 className="mb-4 font-display text-headline-md text-foreground">
          {items.length} {items.length === 1 ? "eSIM" : "eSIMs"}
        </h2>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.product_name}</p>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  {item.country_name}
                  {item.validity_days ? ` · ${item.validity_days} days` : ""}
                  {formatDataMb(item.data_limit_mb) ? ` · ${formatDataMb(item.data_limit_mb)}` : ""}
                </p>
                {item.network_names?.length ? (
                  <p className="mt-0.5 text-body-sm text-muted-foreground">
                    {item.network_names.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge status={item.status} />
                <span className="font-medium text-foreground">
                  <Money minor={item.unit_amount_minor} currency={order.currency} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-card border border-border bg-white p-6">
        <h2 className="mb-4 font-display text-headline-md text-foreground">Payment</h2>
        <dl className="space-y-3 text-body-md">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd><Money minor={order.subtotal_minor} currency={order.currency} /></dd>
          </div>
          {order.discount_minor > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Discount{order.promo_code_snapshot ? ` (${order.promo_code_snapshot})` : ""}
              </dt>
              <dd className="text-success-text">−<Money minor={order.discount_minor} currency={order.currency} /></dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax</dt>
            <dd><Money minor={order.tax_minor} currency={order.currency} /></dd>
          </div>
          <div className="flex items-end justify-between border-t border-border pt-4">
            <dt className="font-display text-headline-md text-foreground">Total</dt>
            <dd className="font-display text-headline-md text-primary">
              <Money minor={order.total_minor} currency={order.currency} />
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-6 text-center text-body-sm text-muted-foreground">
        Looking for your QR code?{" "}
        <Link href={routes.accountEsims()} className="text-primary hover:underline">
          Open My eSIMs
        </Link>
      </p>
    </Container>
  );
}
