"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminOrganizations, allowedTransitions, transitionOrganization } from "@/lib/api/admin";
import { DataTable } from "@/components/data/data-table";
import { routes } from "@/config/routes";
import { useFocusOnReveal } from "@/lib/a11y/use-focus-on-reveal.client";
import { StatusBadge } from "@/components/data/status-badge";

const STATUSES = ["", "pending", "active", "suspended", "rejected", "closed"];

/**
 * Agencies and their lifecycle.
 *
 * Status is NOT a field edit — `PATCH {status}` is accepted and silently
 * discarded. Every change goes through an action endpoint, and only the legal
 * moves for the current state are offered, so the UI can't invite a 409.
 *
 * Suspending requires a reason; the server rejects it otherwise. An illegal move
 * returns `409 invalid_status_transition` whose message names the legal options —
 * that message is shown verbatim rather than replaced with something vaguer.
 */
export function AdminAgencies() {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState("");
  const focusReason = useFocusOnReveal();

  const load = useCallback((nextPage, nextStatus) => {
    setLoading(true);
    setError(null);
    fetchAdminOrganizations({ page: nextPage, status: nextStatus })
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

  async function act(org, transition, withReason) {
    if (transition.requiresReason && !withReason) {
      setReasonFor({ org, transition });
      setReason("");
      return;
    }
    setPending(org.id);
    setNotice(null);
    try {
      await transitionOrganization(org.id, transition.verb, { reason: withReason });
      setReasonFor(null);
      load(page, status);
    } catch (err) {
      // 409 invalid_status_transition explains which moves are allowed — keep it.
      setNotice(err?.message || "That change wasn't accepted.");
    } finally {
      setPending(null);
    }
  }

  const columns = [
    {
      key: "name",
      header: "Agency",
      render: (row) => (
        <span>
          <Link
            href={routes.adminAgency(row.id)}
            className="block font-medium text-primary hover:underline"
          >
            {row.name}
          </Link>
          <span className="block text-body-sm text-muted-foreground">{row.billing_email}</span>
        </span>
      ),
    },
    { key: "country", header: "Country", render: (row) => row.country || "—" },
    { key: "member_count", header: "Members" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span>
          <StatusBadge status={row.status} />
          {row.suspension_reason ? (
            <span className="mt-1 block text-body-sm text-muted-foreground">
              {row.suspension_reason}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Lifecycle",
      align: "right",
      render: (row) => {
        const moves = allowedTransitions(row.status);
        if (!moves.length) {
          return <span className="text-body-sm text-muted-foreground">Terminal</span>;
        }
        return (
          <span className="flex flex-wrap justify-end gap-2">
            {moves.map((transition) => (
              <button
                key={transition.verb}
                type="button"
                disabled={pending === row.id}
                onClick={() => act(row, transition)}
                className="rounded-full border border-border px-3 py-1.5 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
              >
                {transition.verb}
              </button>
            ))}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <label className="mb-4 inline-block">
        <span className="mb-1 block text-label-bold text-foreground">Status</span>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load(1, e.target.value);
          }}
          className="rounded-md border border-border bg-white px-3 py-2.5 text-body-sm text-foreground"
        >
          {STATUSES.map((s) => (
            <option key={s || "all"} value={s}>
              {s || "All"}
            </option>
          ))}
        </select>
      </label>

      {notice ? (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {notice}
        </p>
      ) : null}

      {reasonFor ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(reasonFor.org, reasonFor.transition, reason.trim());
          }}
          className="mb-4 rounded-card border border-border bg-white p-5"
        >
          <p id="suspend-consequence" className="mb-3 text-body-md text-foreground">
            Suspending <strong>{reasonFor.org.name}</strong> stops their commission on new sales.
            A reason is required and is recorded in the audit trail.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-label-bold text-foreground">Reason</span>
              <input
                ref={focusReason}
                type="text"
                required
                value={reason}
                aria-describedby="suspend-consequence"
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. fraud review"
                className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-destructive px-5 py-2.5 text-label-bold text-destructive-foreground hover:brightness-110"
            >
              Suspend
            </button>
            <button
              type="button"
              onClick={() => setReasonFor(null)}
              className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <DataTable
        caption="Travel agencies and their lifecycle state"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(page, status)}
        onPageChange={(next) => load(next, status)}
        empty={{ title: "No agencies", body: "No organizations match this filter." }}
      />
    </div>
  );
}
