"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAgencyActivity } from "@/lib/api/agency";
import { DataTable } from "@/components/data/data-table";

/**
 * This agency's audit trail. Read-only by design — the platform writes it and no
 * client may edit or delete entries.
 *
 * `actor_email` is empty for system-initiated events, so it renders as "System"
 * rather than a blank cell. `changes` is already redacted server-side; secrets
 * never appear in it.
 */
export function AgencyActivity({ orgId }) {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPage = useCallback(
    (next) => {
      setLoading(true);
      setError(null);
      fetchAgencyActivity(orgId, { page: next })
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
        <span className="font-medium text-foreground">{String(row.action).replace(/[._]/g, " ")}</span>
      ),
    },
    {
      key: "actor_email",
      header: "By",
      render: (row) => row.actor_email || (row.actor_type === "system" ? "System" : "—"),
    },
    {
      key: "object_repr",
      header: "Object",
      render: (row) => (
        <span className="text-muted-foreground">{row.object_type || row.object_repr || "—"}</span>
      ),
    },
  ];

  return (
    <DataTable
      caption="Activity recorded for your agency"
      columns={columns}
      list={list}
      loading={loading}
      error={error}
      onRetry={() => fetchPage(page)}
      onPageChange={fetchPage}
      empty={{ title: "No activity yet", body: "Changes to your agency are recorded here." }}
    />
  );
}
