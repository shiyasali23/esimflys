"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { listOrders } from "@/lib/api/orders";
import { useSession } from "@/features/auth/use-session.client";
import { ErrorState } from "@/components/feedback/error-state";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * The customer's order history, newest first.
 *
 * `GET /orders/` is owner-scoped and returns 403 when signed out — that is the
 * normal anonymous case, not a failure, so it renders a sign-in prompt rather
 * than an error. Guests have no orders here at all; their route is the lookup page.
 */
export function OrderList() {
  const user = useSession((s) => s.user);
  const loadSession = useSession((s) => s.load);
  const sessionError = useSession((s) => s.error);
  const retrySession = useSession((s) => s.retry);
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const fetchPage = useCallback((nextPage) => {
    setLoading(true);
    setError(null);
    listOrders({ page: nextPage })
      .then((result) => {
        setList(result);
        setPage(nextPage);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) fetchPage(1);
  }, [user, fetchPage]);

  // The heading is rendered in every state, and the placeholder matches the table's
  // own skeleton, so resolving the session doesn't shift the page (CLS).
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
      <Container className="py-12">
        <h1 className="mb-8 font-display text-headline-lg uppercase text-foreground">Your orders</h1>
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </Container>
    );
  }

  if (user === null) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={Receipt}
          title="Sign in to see your orders"
          body="Your order history is tied to your account. Bought as a guest? Look the order up with your order number and email."
          action={{ label: "Sign in", href: routes.signin() }}
        />
        <p className="mt-6 text-center text-body-sm text-muted-foreground">
          <Link href={routes.orderLookup()} className="text-primary hover:underline">
            Find a guest order instead →
          </Link>
        </p>
      </Container>
    );
  }

  const columns = [
    {
      key: "order_number",
      header: "Order",
      render: (order) => (
        <span className="font-medium text-foreground">{order.order_number}</span>
      ),
    },
    {
      key: "placed_at",
      header: "Placed",
      render: (order) =>
        order.placed_at ? new Date(order.placed_at).toLocaleDateString() : "—",
    },
    {
      key: "item_count",
      header: "eSIMs",
      render: (order) => order.items?.length ?? order.item_count ?? "—",
    },
    {
      key: "payment_status",
      header: "Payment",
      render: (order) => <StatusBadge status={order.payment_status} />,
    },
    {
      key: "fulfillment_status",
      header: "Fulfilment",
      render: (order) => <StatusBadge status={order.fulfillment_status} />,
    },
    {
      key: "total_minor",
      header: "Total",
      align: "right",
      render: (order) => (
        <span className="font-medium text-foreground">
          <Money minor={order.total_minor} currency={order.currency} />
        </span>
      ),
    },
    {
      key: "view",
      header: "",
      align: "right",
      render: (order) => (
        <Link
          href={routes.accountOrder(order.id)}
          className="text-label-bold text-primary hover:underline"
        >
          View
        </Link>
      ),
    },
  ];

  return (
    <Container className="py-12">
      <h1 className="mb-8 font-display text-headline-lg uppercase text-foreground">Your orders</h1>
      <DataTable
        caption="Your eSIMFlys orders, newest first"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => fetchPage(page)}
        onPageChange={fetchPage}
        empty={{
          title: "No orders yet",
          body: "When you buy an eSIM it appears here with its status and receipt.",
        }}
      />
      {list && !list.results.length ? (
        <p className="mt-6 text-center">
          <Link href={routes.destinations()} className="text-label-bold text-primary hover:underline">
            Browse destinations →
          </Link>
        </p>
      ) : null}
    </Container>
  );
}
