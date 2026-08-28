"use client";
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  fetchAdminCommissions,
  approveCommission,
  bulkApproveCommissions,
  readBulkResult,
} from "@/lib/api/admin";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";

const STATUSES = ["", "pending", "available", "approved", "paid", "reversed", "cancelled"];

/**
 * Commission approval.
 *
 * Bulk approval NEVER aborts: it reports per-item outcomes, and its success key is
 * `approved` (plans use `updated`) — read through readBulkResult so a partial
 * result isn't misreported as a total failure. Both halves are shown, because an
 * operator who approved 40 of 50 needs to know which 10 refused and why.
 *
 * `net_minor` is the figure that matters — a refund claws commission back.
 */
const STATUS_OPTIONS = STATUSES.map((value) => ({
  value,
  label: value || "All statuses",
}));
const FILTER_KEYS = ["status"];
export function AdminCommissions() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminCommissions({ page, page_size: limit, status: filters.status })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.status]);

  /* One effect keyed on the URL, so a navigation fires exactly one request. */
  useEffect(() => {
    load();
  }, [load]);

  const approvable = (row) => ["pending", "available"].includes(row.status);

  async function approveOne(row) {
    setBusy(true);
    setResult(null);
    try {
      await approveCommission(row.id);
      load();
    } catch (err) {
      setResult({ succeeded: [], failed: [{ id: row.id, error: err?.message || "Refused" }] });
    } finally {
      setBusy(false);
    }
  }

  async function approveSelected() {
    if (!selected.length) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(readBulkResult(await bulkApproveCommissions(selected)));
      load();
    } catch (err) {
      setResult({ succeeded: [], failed: [{ id: "—", error: err?.message || "Refused" }] });
    } finally {
      setBusy(false);
    }
  }

  const rows = list?.results || [];
  const selectable = rows.filter(approvable);

  const columns = [
    {
      key: "select",
      header: "",
      render: (row) =>
        approvable(row) ? (
          <input
            type="checkbox"
            checked={selected.includes(row.id)}
            aria-label={`Select commission for ${row.order_number}`}
            onChange={(e) =>
              setSelected((prev) =>
                e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
              )
            }
            className="h-4 w-4"
          />
        ) : null,
    },
    {
      key: "order_number",
      header: "Order",
      render: (row) => <span className="font-medium text-foreground">{row.order_number}</span>,
    },
    { key: "organization_name", header: "Agency", render: (row) => row.organization_name || "—" },
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
      header: "Net",
      align: "right",
      render: (row) => (
        <span className="font-semibold text-foreground">
          <Money minor={row.net_minor} currency={row.currency || "USD"} />
        </span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) =>
        approvable(row) ? (
          <button
            type="button"
            onClick={() => approveOne(row)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Check size={12} aria-hidden /> Approve
          </button>
        ) : (
          <span className="text-body-sm text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div>
      <AdminToolbar>
        <ToolbarSelect
          label="Filter commissions by status"
          value={filters.status}
          onChange={(value) => setFilters({ status: value })}
          options={STATUS_OPTIONS}
        />
      </AdminToolbar>

      {/* Bulk approval stays in the body, not the top bar: it acts on the CURRENT
          selection and belongs beside the rows it will change. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <span />
        {selectable.length ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(selectable.map((r) => r.id))}
              className="text-label-bold text-primary hover:underline"
            >
              Select all approvable ({selectable.length})
            </button>
            <button
              type="button"
              onClick={approveSelected}
              disabled={busy || !selected.length}
              className="rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Approving…" : `Approve ${selected.length || ""}`.trim()}
            </button>
          </div>
        ) : null}
      </div>

      {result ? (
        <div
          role="status"
          className="mb-4 rounded-md border border-border bg-muted p-4 text-body-sm"
        >
          {result.succeeded.length ? (
            <p className="text-success-text">
              Approved {result.succeeded.length} commission
              {result.succeeded.length === 1 ? "" : "s"}.
            </p>
          ) : null}
          {result.failed.length ? (
            <div className="mt-2">
              <p className="text-destructive">
                {result.failed.length} could not be approved:
              </p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {result.failed.slice(0, 5).map((f) => (
                  <li key={f.id}>
                    {f.id.slice(0, 8)} — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <DataTable
        density="compact"
        caption="Agency commissions awaiting approval"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{ title: "No commissions", body: "Nothing matches this filter." }}
      />
    </div>
  );
}
