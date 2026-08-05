"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminOrders } from "@/lib/api/admin";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";
import { routes } from "@/config/routes";

const PAYMENT_STATUSES = ["", "pending", "processing", "paid", "failed", "refunded"];

/**
 * All platform orders.
 *
 * `wholesale_amount_minor` is absent from every per-row payload by design — margin
 * exists only as the dashboard aggregate — so there is no cost column here for any
 * role.
 */
export function AdminOrders() {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", payment_status: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback((nextPage, nextFilters) => {
    setLoading(true);
    setError(null);
    fetchAdminOrders({ page: nextPage, ...nextFilters })
      .then((result) => {
        setList(result);
        setPage(nextPage);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, { search: "", payment_status: "" });
  }, [load]);

  const columns = [
    {
      key: "order_number",
      header: "Order",
      render: (row) => (
        <Link href={routes.adminOrder(row.id)} className="font-medium text-primary hover:underline">
          {row.order_number}
        </Link>
      ),
    },
    { key: "customer_email", header: "Customer" },
    {
      key: "placed_at",
      header: "Placed",
      render: (row) => (row.placed_at ? new Date(row.placed_at).toLocaleDateString() : "—"),
    },
    {
      key: "referring_organization_name",
      header: "Agency",
      render: (row) => row.referring_organization_name || "—",
    },
    {
      key: "payment_status",
      header: "Payment",
      render: (row) => <StatusBadge status={row.payment_status} />,
    },
    {
      key: "fulfillment_status",
      header: "Fulfilment",
      render: (row) => <StatusBadge status={row.fulfillment_status} />,
    },
    {
      key: "total_minor",
      header: "Total",
      align: "right",
      render: (row) => (
        <span className="font-medium text-foreground">
          <Money minor={row.total_minor} currency={row.currency} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load(1, filters);
        }}
      >
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Order number or email"
            className="w-full rounded-md border border-border bg-white px-4 py-2.5 text-body-sm outline-none focus:border-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-label-bold text-foreground">Payment</span>
          <select
            value={filters.payment_status}
            onChange={(e) => {
              const next = { ...filters, payment_status: e.target.value };
              setFilters(next);
              load(1, next);
            }}
            className="rounded-md border border-border bg-white px-3 py-2.5 text-body-sm text-foreground"
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s ? s.replace(/_/g, " ") : "All"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
        >
          Apply
        </button>
      </form>

      <DataTable
        caption="All platform orders"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(page, filters)}
        onPageChange={(next) => load(next, filters)}
        empty={{ title: "No orders found", body: "Try a different search or filter." }}
      />
    </div>
  );
}
