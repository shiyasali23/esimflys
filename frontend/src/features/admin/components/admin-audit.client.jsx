"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAuditEvents } from "@/lib/api/admin";
import { DataTable } from "@/components/data/data-table";

/**
 * The platform audit trail.
 *
 * Strictly read-only — POST, PATCH and DELETE all return 405 — so this screen
 * offers no write affordance at all. `changes` is redacted server-side and never
 * contains secrets; `actor_email` is empty for system-initiated events, which
 * renders as "System" rather than a blank cell.
 */
export function AdminAudit() {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback((nextPage, nextAction) => {
    setLoading(true);
    setError(null);
    fetchAuditEvents({ page: nextPage, action: nextAction })
      .then((result) => {
        setList(result);
        setPage(nextPage);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, "");
  }, [load]);

  const columns = [
    {
      key: "created_at",
      header: "When",
      render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "—"),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <span className="font-medium text-foreground">
          {String(row.action).replace(/[._]/g, " ")}
        </span>
      ),
    },
    {
      key: "actor_email",
      header: "Actor",
      render: (row) => row.actor_email || (row.actor_type === "system" ? "System" : "—"),
    },
    {
      key: "object_type",
      header: "Object",
      render: (row) => (
        <span className="text-muted-foreground">{row.object_type || row.object_repr || "—"}</span>
      ),
    },
    {
      key: "changes",
      header: "Changes",
      render: (row) => {
        const keys = Object.keys(row.changes || {});
        if (!keys.length) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="text-body-sm text-muted-foreground">{keys.slice(0, 4).join(", ")}</span>
        );
      },
    },
    {
      key: "ip_address",
      header: "IP",
      align: "right",
      render: (row) => row.ip_address || "—",
    },
  ];

  return (
    <div>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load(1, action);
        }}
      >
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">Action</span>
          <input
            type="search"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. order.credentials_viewed"
            className="w-full rounded-md border border-border bg-white px-4 py-2.5 text-body-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
        >
          Filter
        </button>
      </form>

      <DataTable
        caption="Platform audit trail (read-only)"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(page, action)}
        onPageChange={(next) => load(next, action)}
        empty={{ title: "No audit events", body: "Nothing matches that filter." }}
      />
    </div>
  );
}
