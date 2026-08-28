"use client";
import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  fetchSupplierEvents,
  fetchNotifications,
  retrySupplierEvent,
  retryNotification,
  canRetry,
} from "@/lib/api/admin";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import { AdminToolbar } from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";

/**
 * Supplier jobs and outbound notifications.
 *
 * Retry is state-dependent: re-running a `succeeded` provision could buy a second
 * eSIM, so the server answers 409 and the button is only offered from
 * `failed | manual_review | retrying`. Retries reuse the original idempotency key,
 * which is what makes the allowed cases safe.
 */
/* The tab is part of the view, so it belongs in the URL with everything else — a link
   to "refunds, page 3" has to survive being pasted to a colleague. */
const FILTER_KEYS = ["view"];
const DEFAULT_VIEW = "jobs";

export function AdminOperations() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const tab = filters.view || DEFAULT_VIEW;
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    (tab === "jobs" ? fetchSupplierEvents : fetchNotifications)({ page, page_size: limit })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [tab, page, limit]);

  /* Switching tab changes the URL, which changes `load`, which fires once. */
  useEffect(() => {
    load();
  }, [load]);

  async function retry(row) {
    setBusyId(row.id);
    setNotice(null);
    try {
      if (tab === "jobs") await retrySupplierEvent(row.id);
      else await retryNotification(row.id);
      load();
    } catch (err) {
      setNotice(err?.message || "That retry wasn't accepted.");
    } finally {
      setBusyId(null);
    }
  }

  const jobColumns = [
    {
      key: "event_type",
      header: "Job",
      render: (row) => (
        <span>
          <span className="block font-medium text-foreground">
            {String(row.event_type).replace(/_/g, " ")}
          </span>
          {row.supplier_reference ? (
            <span className="block break-all text-body-sm text-muted-foreground">
              {row.supplier_reference}
            </span>
          ) : null}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "attempt_count", header: "Attempts" },
    {
      key: "error_message",
      header: "Error",
      render: (row) =>
        row.error_message ? (
          <span className="text-body-sm text-destructive">{row.error_message}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "—"),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) =>
        canRetry(row) ? (
          <button
            type="button"
            onClick={() => retry(row)}
            disabled={busyId === row.id}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw size={12} aria-hidden /> Retry
          </button>
        ) : (
          <span className="text-body-sm text-muted-foreground">—</span>
        ),
    },
  ];

  const notificationColumns = [
    {
      key: "template_code",
      header: "Notification",
      render: (row) => (
        <span>
          <span className="block font-medium text-foreground">
            {String(row.template_code).replace(/_/g, " ")}
          </span>
          <span className="block text-body-sm text-muted-foreground">{row.recipient}</span>
        </span>
      ),
    },
    { key: "channel", header: "Channel" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "attempt_count", header: "Attempts" },
    {
      key: "failure_message",
      header: "Error",
      render: (row) =>
        row.failure_message ? (
          <span className="text-body-sm text-destructive">{row.failure_message}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) =>
        row.status === "failed" ? (
          <button
            type="button"
            onClick={() => retry(row)}
            disabled={busyId === row.id}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw size={12} aria-hidden /> Retry
          </button>
        ) : (
          <span className="text-body-sm text-muted-foreground">—</span>
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
          { id: "jobs", label: "Supplier jobs" },
          { id: "notifications", label: "Notifications" },
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
        caption={tab === "jobs" ? "Supplier provisioning jobs" : "Outbound notifications"}
        columns={tab === "jobs" ? jobColumns : notificationColumns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{ title: "Nothing here", body: "No records match." }}
      />
    </div>
  );
}
