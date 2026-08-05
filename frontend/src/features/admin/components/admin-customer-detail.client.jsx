"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchAdminCustomer } from "@/lib/api/admin";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";

/**
 * One customer, for support.
 *
 * Opening this page is recorded as PII access in the audit trail, which is why
 * the list never preloads it.
 *
 * The payload is `{customer, orders}` and `orders` is a PLAIN ARRAY — the whole
 * history, unpaginated. Reading it as `{results}` yields nothing.
 */
export function AdminCustomerDetail({ customerId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAdminCustomer(customerId)
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [customerId]);

  if (error) {
    return error.status === 404 ? (
      <EmptyState
        title="Customer not found"
        body="No customer matches that reference."
        action={{ label: "Back to customers", href: `${routes.admin()}/customers` }}
      />
    ) : (
      <ErrorState error={error} title="We couldn't load this customer" />
    );
  }

  if (!data) {
    return (
      <div className="min-h-[22rem] space-y-3" aria-busy="true">
        <div className="h-24 animate-pulse rounded-card bg-muted" />
        <div className="h-40 animate-pulse rounded-card bg-muted" />
      </div>
    );
  }

  const customer = data.customer || {};
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  /**
   * Lifetime spend, kept per currency rather than summed.
   *
   * `total_minor` is denominated in whatever the customer paid in, so adding an INR
   * order to a USD one produces a number that is not money in any currency —
   * Rs 63,900 + 1699 cents = "65,599" of nothing. A single figure would need
   * `base_total_minor` (the USD equivalent the backend snapshots for exactly this
   * reason), and the admin order serializer does not expose it yet.
   *
   * Showing each currency on its own line is correct with what is available, and
   * reads normally in the common case where a customer has only ever used one.
   */
  const spendByCurrency = orders
    .filter((order) => order.payment_status === "paid")
    .reduce((totals, order) => {
      const code = order.currency || "USD";
      totals[code] = (totals[code] || 0) + (order.total_minor || 0);
      return totals;
    }, {});
  const spendEntries = Object.entries(spendByCurrency);

  return (
    <div className="space-y-6">
      <Link
        href={`${routes.admin()}/customers`}
        className="inline-flex items-center gap-1.5 text-label-bold text-primary hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> All customers
      </Link>

      <section className="rounded-card border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-headline-md text-foreground">
              {name || customer.email}
            </h2>
            {name ? (
              <p className="mt-1 text-body-sm text-muted-foreground">{customer.email}</p>
            ) : null}
          </div>
          <StatusBadge status={customer.is_active ? "active" : "disabled"} />
        </div>

        <dl className="mt-6 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Orders</dt>
            <dd className="mt-1 text-body-md text-foreground">{customer.order_count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Paid to date</dt>
            <dd className="mt-1 text-body-md text-foreground">
              {spendEntries.length ? (
                spendEntries.map(([code, minor], index) => (
                  <span key={code}>
                    {index > 0 ? <span className="text-muted-foreground"> · </span> : null}
                    <Money minor={minor} currency={code} />
                  </span>
                ))
              ) : (
                <Money minor={0} currency="USD" />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Email confirmed</dt>
            <dd className="mt-1 text-body-md text-foreground">
              {/* Null even for Google sign-ins — see contract §9. "Not verified"
                  would misreport a perfectly good account. */}
              {customer.email_verified_at
                ? new Date(customer.email_verified_at).toLocaleDateString()
                : "Not recorded"}
            </dd>
          </div>
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Joined</dt>
            <dd className="mt-1 text-body-md text-foreground">
              {customer.date_joined
                ? new Date(customer.date_joined).toLocaleDateString()
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-card border border-border bg-white p-6">
        <h3 className="mb-4 font-display text-headline-md text-foreground">
          Orders ({orders.length})
        </h3>

        {!orders.length ? (
          <p className="text-body-sm text-muted-foreground">
            This customer hasn&rsquo;t placed an order yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={routes.adminOrder(order.id)}
                    className="font-display text-lg tracking-wide text-primary hover:underline"
                  >
                    {order.order_number}
                  </Link>
                  <p className="mt-0.5 text-body-sm text-muted-foreground">
                    {order.placed_at ? new Date(order.placed_at).toLocaleDateString() : "Not placed"}
                    {` · ${order.item_count} item${order.item_count === 1 ? "" : "s"}`}
                    {order.referring_organization_name
                      ? ` · via ${order.referring_organization_name}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <span className="text-body-md font-medium text-foreground">
                    <Money minor={order.total_minor} currency={order.currency} />
                  </span>
                  <StatusBadge status={order.payment_status} />
                  <StatusBadge status={order.fulfillment_status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
