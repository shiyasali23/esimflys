"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAgencyPayouts } from "@/lib/api/agency";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";

/** Settlements paid to this agency. Read-only — payouts are created by the platform. */
export function AgencyPayouts({ orgId }) {
  /* No filters on this screen — page and rows-per-page are the whole state. */
  const { page, limit, setPage, setLimit } = useListQuery();
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAgencyPayouts(orgId, { page, page_size: limit })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [orgId, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const period = (row) => {
    if (!row.period_start && !row.period_end) return "—";
    const from = row.period_start ? new Date(row.period_start).toLocaleDateString() : "—";
    const to = row.period_end ? new Date(row.period_end).toLocaleDateString() : "—";
    return `${from} – ${to}`;
  };

  const columns = [
    { key: "period", header: "Period", render: period },
    {
      key: "payment_method",
      header: "Method",
      render: (row) => row.payment_method || "—",
    },
    {
      key: "external_reference",
      header: "Reference",
      render: (row) => row.external_reference || "—",
    },
    {
      key: "paid_at",
      header: "Paid",
      render: (row) => (row.paid_at ? new Date(row.paid_at).toLocaleDateString() : "—"),
    },
    {
      key: "amount_minor",
      header: "Amount",
      align: "right",
      render: (row) => (
        <span className="font-medium text-foreground">
          <Money minor={row.amount_minor} currency={row.currency || "USD"} />
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <DataTable
        density="compact"
      caption="Payouts settled to your agency"
      columns={columns}
      list={list}
      loading={loading}
      error={error}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
      empty={{
        title: "No payouts yet",
        body: "Approved commission is settled by the platform and appears here.",
      }}
    />
  );
}
