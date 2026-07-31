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
export function AdminOperations() {
  const [tab, setTab] = useState("jobs");
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback((which, nextPage) => {
    setLoading(true);
    setError(null);
    const fetcher = which === "jobs" ? fetchSupplierEvents : fetchNotifications;
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

  async function retry(row) {
    setBusyId(row.id);
    setNotice(null);
    try {
      if (tab === "jobs") await retrySupplierEvent(row.id);
      else await retryNotification(row.id);
      load(tab, page);
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
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Operations view">
        {[
          { id: "jobs", label: "Supplier jobs" },
          { id: "notifications", label: "Notifications" },
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

      {notice ? (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {notice}
        </p>
      ) : null}

      <DataTable
        caption={tab === "jobs" ? "Supplier provisioning jobs" : "Outbound notifications"}
        columns={tab === "jobs" ? jobColumns : notificationColumns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(tab, page)}
        onPageChange={(next) => load(tab, next)}
        empty={{ title: "Nothing here", body: "No records match." }}
      />
    </div>
  );
}
