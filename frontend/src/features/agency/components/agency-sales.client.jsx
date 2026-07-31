"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAgencySales } from "@/lib/api/agency";
import { fromMinor } from "@/lib/format/units";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Price } from "@/components/currency/price";

/**
 * Sales attributed to this agency's tracking code.
 *
 * There is deliberately NO customer column. The payload carries no
 * `customer_email` — not masked, absent — because the buyer is the platform's
 * customer who merely used the agency's code. Adding a column here would mean
 * inventing data.
 */
export function AgencySales({ orgId }) {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPage = useCallback(
    (next) => {
      setLoading(true);
      setError(null);
      fetchAgencySales(orgId, { page: next })
        .then((result) => {
          setList(result);
          setPage(next);
        })
        .catch(setError)
        .finally(() => setLoading(false));
    },
    [orgId],
  );

  useEffect(() => fetchPage(1), [fetchPage]);

  const columns = [
    {
      key: "order_number",
      header: "Order",
      render: (row) => <span className="font-medium text-foreground">{row.order_number}</span>,
    },
    {
      key: "placed_at",
      header: "Placed",
      render: (row) => (row.placed_at ? new Date(row.placed_at).toLocaleDateString() : "—"),
    },
    { key: "promo_code_snapshot", header: "Code" },
    {
      key: "payment_status",
      header: "Payment",
      render: (row) => <StatusBadge status={row.payment_status} />,
    },
    {
      key: "total_minor",
      header: "Order value",
      align: "right",
      render: (row) => <Price usd={fromMinor(row.total_minor)} />,
    },
    {
      key: "commission_minor",
      header: "Commission",
      align: "right",
      render: (row) => (
        <span className="font-medium text-foreground">
          <Price usd={fromMinor(row.commission_minor)} />
        </span>
      ),
    },
    {
      key: "commission_status",
      header: "Status",
      align: "right",
      render: (row) => <StatusBadge status={row.commission_status} />,
    },
  ];

  return (
    <DataTable
      caption="Sales attributed to your tracking code"
      columns={columns}
      list={list}
      loading={loading}
      error={error}
      onRetry={() => fetchPage(page)}
      onPageChange={fetchPage}
      empty={{
        title: "No attributed sales yet",
        body: "Sales appear here once a customer buys using your tracking code.",
      }}
    />
  );
}
