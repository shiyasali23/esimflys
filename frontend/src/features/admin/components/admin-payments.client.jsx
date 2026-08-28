"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAdminPayments, fetchAdminRefunds } from "@/lib/api/admin";
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
export function AdminPayments() {
  const [tab, setTab] = useState("payments");
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback((which, nextPage) => {
    setLoading(true);
    setError(null);
    const fetcher = which === "payments" ? fetchAdminPayments : fetchAdminRefunds;
    fetcher({ page: nextPage })
      .then((result) => {
        setList(result);
        setPage(nextPage);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setList(null);
    load(tab, 1);
  }, [tab, load]);

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
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Payments view">
        {[
          { id: "payments", label: "Payments" },
          { id: "refunds", label: "Refunds" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`rounded-full px-4 py-2 text-label-bold transition-colors ${
              tab === option.id
                ? "bg-primary text-on-primary"
                : "border border-border text-foreground hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <DataTable
        density="compact"
        caption={tab === "payments" ? "Payments taken" : "Refunds issued"}
        columns={tab === "payments" ? paymentColumns : refundColumns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(tab, page)}
        onPageChange={(next) => load(tab, next)}
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
