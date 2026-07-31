"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAgencyPayouts } from "@/lib/api/agency";
import { fromMinor } from "@/lib/format/units";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Price } from "@/components/currency/price";

/** Settlements paid to this agency. Read-only — payouts are created by the platform. */
export function AgencyPayouts({ orgId }) {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPage = useCallback(
    (next) => {
      setLoading(true);
      setError(null);
      fetchAgencyPayouts(orgId, { page: next })
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
          <Price usd={fromMinor(row.amount_minor)} />
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
      caption="Payouts settled to your agency"
      columns={columns}
      list={list}
      loading={loading}
      error={error}
      onRetry={() => fetchPage(page)}
      onPageChange={fetchPage}
      empty={{
        title: "No payouts yet",
        body: "Approved commission is settled by the platform and appears here.",
      }}
    />
  );
}
