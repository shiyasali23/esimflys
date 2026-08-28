"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAuditEvents } from "@/lib/api/admin";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";

/**
 * The platform audit trail.
 *
 * Strictly read-only — POST, PATCH and DELETE all return 405 — so this screen
 * offers no write affordance at all. `changes` is redacted server-side and never
 * contains secrets; `actor_email` is empty for system-initiated events, which
 * renders as "System" rather than a blank cell.
 */
const FILTER_KEYS = ["q"];
export function AdminAudit() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(filters.q);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAuditEvents({ page, page_size: limit, action: filters.q })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.q]);

  useEffect(() => {
    load();
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
      <AdminToolbar>
        <ToolbarSearch
          label="Filter audit events by action"
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilters({ q: draft })}
          placeholder="e.g. order.credentials_viewed"
        />
      </AdminToolbar>

      <DataTable
        density="compact"
        caption="Platform audit trail (read-only)"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{ title: "No audit events", body: "Nothing matches that filter." }}
      />
    </div>
  );
}
