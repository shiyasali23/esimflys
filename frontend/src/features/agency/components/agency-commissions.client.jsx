"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAgencyCommissions } from "@/lib/api/agency";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";

const STATUSES = ["", "pending", "available", "approved", "paid", "reversed", "cancelled"];

/**
 * Commission ledger.
 *
 * `net_minor` (= commission_minor − reversed_minor) is the headline figure: a
 * refund claws commission back, so the gross number can overstate what the agency
 * is actually owed. Both are shown, but net is the one styled as the answer.
 *
 * The rate is read-only — agencies cannot change their own commission.
 */
const FILTER_KEYS = ["status"];

export function AgencyCommissions({ orgId }) {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAgencyCommissions(orgId, {
      page,
      page_size: limit,
      status: filters.status || undefined,
    })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [orgId, page, limit, filters.status]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "order_number",
      header: "Order",
      render: (row) => <span className="font-medium text-foreground">{row.order_number}</span>,
    },
    {
      key: "created_at",
      header: "Earned",
      render: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"),
    },
    {
      key: "commission_value_snapshot",
      header: "Rate",
      render: (row) =>
        row.commission_type === "percentage_bps" && row.commission_value_snapshot != null
          ? `${(row.commission_value_snapshot / 100).toFixed(2)}%`
          : "—",
    },
    {
      key: "commissionable_minor",
      header: "Order value",
      align: "right",
      render: (row) => <Money minor={row.commissionable_minor} currency={row.currency || "USD"} />,
    },
    {
      key: "reversed_minor",
      header: "Reversed",
      align: "right",
      render: (row) =>
        row.reversed_minor > 0 ? (
          <span className="text-destructive">
            −<Money minor={row.reversed_minor} currency={row.currency || "USD"} />
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "net_minor",
      header: "Net commission",
      align: "right",
      render: (row) => (
        <span className="font-semibold text-foreground">
          <Money minor={row.net_minor} currency={row.currency || "USD"} />
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
    <div>
      <AdminToolbar>
        <ToolbarSelect
          label="Filter commissions by status"
          value={filters.status}
          onChange={(value) => setFilters({ status: value })}
          options={STATUSES.map((value) => ({
            value,
            label: value ? value.replace(/_/g, " ") : "All statuses",
          }))}
        />
      </AdminToolbar>

      <DataTable
        density="compact"
        caption="Commission earned on attributed sales"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{
          title: "No commission yet",
          body: "Commission is recorded once an attributed order is paid.",
        }}
      />
      <p className="mt-4 text-body-sm text-muted-foreground">
        Net commission is what you are owed after any refunds on the original order. Your rate is
        set by the platform and cannot be changed here.
      </p>
    </div>
  );
}
