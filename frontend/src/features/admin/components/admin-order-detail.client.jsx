"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchAdminOrder } from "@/lib/api/admin";
import { AdminRefundPanel } from "@/features/admin/components/admin-refund-panel.client";
import { fromMinor, formatBytes, planAllowance, usageRatio } from "@/lib/format/units";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";

/**
 * One order, for support and finance.
 *
 * The detail endpoint nests items, payments and eSIMs, so this is a single call.
 * Activation credentials are NOT in that payload and are not fetched here —
 * revealing them is a separately permissioned, audited, rate-limited action, so
 * it stays on the eSIMs screen rather than happening as a side effect of opening
 * an order.
 *
 * `wholesale_amount_minor` is absent from per-row payloads by design, so there is
 * no cost or margin column for any role.
 */
export function AdminOrderDetail({ orderId }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAdminOrder(orderId)
      .then((data) => active && setOrder(data))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [orderId]);

  if (error) {
    return error.status === 404 ? (
      <EmptyState
        title="Order not found"
        body="No order matches that reference."
        action={{ label: "Back to orders", href: `${routes.admin()}/orders` }}
      />
    ) : (
      <ErrorState error={error} title="We couldn't load this order" />
    );
  }

  if (!order) {
    return (
      <div className="min-h-[22rem] space-y-3" aria-busy="true">
        <div className="h-24 animate-pulse rounded-card bg-muted" />
        <div className="h-40 animate-pulse rounded-card bg-muted" />
      </div>
    );
  }

  const items = order.items || [];
  const payments = order.payments || [];
  const esims = order.esims || [];

  return (
    <div className="space-y-6">
      <Link
        href={`${routes.admin()}/orders`}
        className="inline-flex items-center gap-1.5 text-label-bold text-primary hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> All orders
      </Link>

      <section className="rounded-card border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-headline-md text-foreground">{order.order_number}</h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              {order.customer_email}
              {order.placed_at ? ` · placed ${new Date(order.placed_at).toLocaleString()}` : ""}
            </p>
            {order.referring_organization_name ? (
              <p className="mt-1 text-body-sm text-muted-foreground">
                Referred by {order.referring_organization_name}
                {order.promo_code_snapshot ? ` (${order.promo_code_snapshot})` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={order.status} />
            <StatusBadge status={order.payment_status} />
            <StatusBadge status={order.fulfillment_status} />
          </div>
        </div>

        <dl className="mt-6 grid gap-3 border-t border-border pt-4 text-body-md sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd><Money minor={order.subtotal_minor} currency={order.currency} /></dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Discount</dt>
            <dd>
              {order.discount_minor > 0 ? (
                <span className="text-success-text">
                  −<Money minor={order.discount_minor} currency={order.currency} />
                </span>
              ) : (
                <Money minor={0} currency={order.currency} />
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Tax</dt>
            <dd><Money minor={order.tax_minor} currency={order.currency} /></dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-3 sm:border-0 sm:pt-0">
            <dt className="font-semibold text-foreground">Total</dt>
            <dd className="font-display text-headline-md text-primary">
              <Money minor={order.total_minor} currency={order.currency} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-card border border-border bg-white p-6">
        <h3 className="mb-4 font-display text-headline-md text-foreground">
          Items ({items.length})
        </h3>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.product_name}</p>
                <p className="mt-0.5 text-body-sm text-muted-foreground">
                  {item.product_code} · {item.country_name}
                  {planAllowance(item) ? ` · ${planAllowance(item)}` : ""}
                  {item.validity_days ? ` · ${item.validity_days} days` : ""}
                </p>
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

      <section className="rounded-card border border-border bg-white p-6">
        <h3 className="mb-4 font-display text-headline-md text-foreground">
          Payments ({payments.length})
        </h3>
        {payments.length ? (
          <ul className="divide-y divide-border">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{payment.provider}</p>
                  <p className="text-body-sm text-muted-foreground">
                    {payment.paid_at
                      ? new Date(payment.paid_at).toLocaleString()
                      : `created ${new Date(payment.created_at).toLocaleString()}`}
                    {payment.failure_code ? ` · ${payment.failure_code}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={payment.status} />
                  <span className="font-medium text-foreground">
                    <Money minor={payment.amount_minor} currency={payment.currency || order.currency} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-muted-foreground">No payment has been taken yet.</p>
        )}
      </section>

      <section className="rounded-card border border-border bg-white p-6">
        <h3 className="mb-4 font-display text-headline-md text-foreground">
          eSIMs ({esims.length})
        </h3>
        {esims.length ? (
          <>
            <ul className="divide-y divide-border">
              {esims.map((esim) => {
                const ratio = usageRatio(esim.remaining_data_bytes, esim.total_data_bytes);
                return (
                  <li key={esim.id} className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{esim.product_name}</p>
                      <p className="text-body-sm text-muted-foreground">
                        {esim.iccid_last4 ? `ICCID ••••${esim.iccid_last4}` : "Not yet provisioned"}
                        {ratio !== null
                          ? ` · ${formatBytes(esim.remaining_data_bytes)} of ${formatBytes(esim.total_data_bytes)}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={esim.status} />
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-body-sm text-muted-foreground">
              Activation credentials aren&apos;t shown here. Reveal them from the{" "}
              <Link href={`${routes.admin()}/esims`} className="text-primary hover:underline">
                eSIMs screen
              </Link>{" "}
              — that action is audited and rate limited.
            </p>
          </>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            No eSIM has been provisioned for this order yet.
          </p>
        )}
      </section>

      <AdminRefundPanel order={order} items={items} />
    </div>
  );
}
