"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminOrders } from "@/lib/api/admin";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";
import { routes } from "@/config/routes";

const PAYMENT_STATUSES = ["", "pending", "processing", "paid", "failed", "refunded"];
const PAYMENT_OPTIONS = PAYMENT_STATUSES.map((value) => ({
  value,
  label: value ? value.replace(/_/g, " ") : "All payments",
}));
const FILTER_KEYS = ["q", "payment_status"];

/**
 * All platform orders.
 *
 * `wholesale_amount_minor` is absent from every per-row payload by design — margin
 * exists only as the dashboard aggregate — so there is no cost column here for any
 * role.
 */
export function AdminOrders() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Only the text box is local: it holds keystrokes until Apply, so typing does not
  // rewrite the URL — or fire a request — on every character.
  const [draft, setDraft] = useState(filters.q);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminOrders({
      page,
      page_size: limit,
      search: filters.q,
      payment_status: filters.payment_status,
    })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.q, filters.payment_status]);

  /*
   * One effect, keyed on `load`, which is keyed on the URL. The URL is the only source
   * of truth, so this fires exactly once per navigation — there is no seed-then-sync
   * pass to fire it a second time with a different value.
   */
  useEffect(() => {
    load();
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
      <AdminToolbar>
        <ToolbarSearch
          label="Search orders by number or email"
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilters({ q: draft })}
          placeholder="Order number or email"
        />
        <ToolbarSelect
          label="Filter by payment status"
          value={filters.payment_status}
          onChange={(value) => setFilters({ payment_status: value })}
          options={PAYMENT_OPTIONS}
        />
      </AdminToolbar>

      <DataTable
        caption="All platform orders"
        density="compact"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{ title: "No orders found", body: "Try a different search or filter." }}
      />
    </div>
  );
}
