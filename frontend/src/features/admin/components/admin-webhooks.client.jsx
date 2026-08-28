"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchWebhookEvents } from "@/lib/api/admin";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";

/**
 * Stripe webhook deliveries — a table that has recorded every delivery since launch and
 * had no screen at all.
 *
 * This exists because of a specific incident: a mismatched `STRIPE_WEBHOOK_SECRET` meant
 * every delivery was rejected with a 400. Two customers paid, the money sat in Stripe,
 * no eSIM was ever bought, and the panel could count "webhooks rejected" on the
 * dashboard without being able to show a single one. `signature_valid = false` was the
 * entire explanation and it was already in the database.
 *
 * Defaults to problems only. Showing every successful delivery first would bury the
 * handful of rows anybody actually needs.
 */
/* Absent means "problems only" — the default this screen opens on. `?problems=all`
   is the opt-out, so the useful view is the one with the shortest URL. */
const FILTER_KEYS = ["problems"];
export function AdminWebhooks() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchWebhookEvents({ page, page_size: limit, problems: filters.problems !== "all" })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.problems]);

  /* One effect keyed on the URL, so a navigation fires exactly one request. */
  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "event_type",
      header: "Event",
      render: (row) => (
        <span>
          <span className="block text-foreground">{row.event_type || "—"}</span>
          <span className="block text-body-sm text-muted-foreground">
            {row.external_event_id}
          </span>
        </span>
      ),
    },
    {
      key: "signature_valid",
      header: "Signature",
      render: (row) =>
        row.signature_valid === false ? (
          /*
           * Spelled out rather than badged. A rejected signature does not mean one
           * delivery failed — it means the secret does not match the sender, so every
           * delivery is being dropped and no order will ever be fulfilled.
           */
          <span className="text-destructive-text">
            Rejected — the webhook secret does not match
          </span>
        ) : (
          <span className="text-body-sm text-muted-foreground">Valid</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: "attempt_count", header: "Attempts" },
    {
      key: "last_error",
      header: "Error",
      render: (row) =>
        row.last_error ? (
          <span className="text-body-sm text-destructive-text">{row.last_error}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "received_at",
      header: "Received",
      render: (row) =>
        row.received_at ? new Date(row.received_at).toLocaleString() : "—",
    },
  ];

  return (
    <section>
      <AdminToolbar>
        <label className="flex items-center gap-2 text-admin-label text-admin-text">
          <input
            type="checkbox"
            checked={filters.problems !== "all"}
            onChange={(e) => setFilters({ problems: e.target.checked ? "" : "all" })}
            className="h-4 w-4"
          />
          Problems only
        </label>
      </AdminToolbar>

      <DataTable
        density="compact"
        caption="Stripe webhook deliveries"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{
          title: filters.problems !== "all" ? "No webhook problems" : "No webhook deliveries",
          body:
            filters.problems !== "all"
              ? "Every delivery Stripe has sent was accepted and processed."
              : "Nothing has been delivered yet.",
        }}
      />
    </section>
  );
}
