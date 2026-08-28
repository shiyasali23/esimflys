"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAdminPayments, fetchAdminRefunds } from "@/lib/api/admin";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import { AdminToolbar } from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";

/**
 * Payments and refunds.
 *
 * Read-only here. Refunds are raised from an order, not from this list, because
 * the API requires per-item allocations — and the capability is finance-only, so
 * support receives 403. Presenting a refund button here would invite a failure
 * for most operators.
 */
/* The tab is part of the view, so it belongs in the URL with everything else — a link
   to "refunds, page 3" has to survive being pasted to a colleague. */
const FILTER_KEYS = ["view"];
const DEFAULT_VIEW = "payments";

export function AdminPayments() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const tab = filters.view || DEFAULT_VIEW;
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    (tab === "payments" ? fetchAdminPayments : fetchAdminRefunds)({ page, page_size: limit })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [tab, page, limit]);

  /* Switching tab changes the URL, which changes `load`, which fires once. */
  useEffect(() => {
    load();
  }, [load]);

  const paymentColumns = [
    {
      key: "order_number",
      header: "Order",
      render: (row) => <span className="font-medium text-foreground">{row.order_number}</span>,
    },
    { key: "provider", header: "Provider" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "failure_code",
      header: "Failure",
      render: (row) =>
        row.failure_code ? (
          <span className="text-body-sm text-destructive">{row.failure_code}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "paid_at",
      header: "Paid",
      render: (row) => (row.paid_at ? new Date(row.paid_at).toLocaleString() : "—"),
    },
    {
      key: "amount_minor",
      header: "Amount",
      align: "right",
      render: (row) => (
        <span className="font-medium text-foreground">
          <Money minor={row.amount_minor} currency={row.currency} />
        </span>
      ),
    },
  ];

  const refundColumns = [
    {
      key: "order_number",
      header: "Order",
      render: (row) => (
        <span className="font-medium text-foreground">{row.order_number || row.order || "—"}</span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "reason", header: "Reason", render: (row) => row.reason || "—" },
    {
      key: "created_at",
      header: "Created",
      render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "—"),
    },
    {
      key: "amount_minor",
      header: "Amount",
      align: "right",
      render: (row) => (
        <span className="font-medium text-foreground">
          <Money minor={row.amount_minor} currency={row.currency} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <AdminToolbar>
        {/*
          `aria-pressed`, not `role="tab"`. These no longer sit in a tablist — they write
          `?view=` and reload the table, which is a toggle group, not a tab set. Keeping
          the tab role without its required parent is an actual axe violation, and it also
          promises a tabpanel relationship that does not exist.
        */}
        {[
          { id: "payments", label: "Payments" },
          { id: "refunds", label: "Refunds" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={tab === option.id}
            onClick={() => setFilters({ view: option.id === DEFAULT_VIEW ? "" : option.id })}
            className={`h-8 rounded-admin-sm px-3 text-admin-label transition-colors ${
              tab === option.id
                ? "bg-admin-accent-tint font-medium text-admin-accent-ink"
                : "border border-admin-border text-admin-text hover:bg-admin-hover"
            }`}
          >
            {option.label}
          </button>
        ))}
      </AdminToolbar>

      <DataTable
        density="compact"
        caption={tab === "payments" ? "Payments taken" : "Refunds issued"}
        columns={tab === "payments" ? paymentColumns : refundColumns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{
          title: tab === "payments" ? "No payments" : "No refunds",
          body:
            tab === "refunds"
              ? "Refunds are raised from an order and require the finance capability."
              : "No payment records match.",
        }}
      />
    </div>
  );
}
