"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchAdminOrganizations,
  allowedTransitions,
  transitionOrganization,
  createOrganization,
} from "@/lib/api/admin";
import { fieldErrors } from "@/lib/api/errors";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { routes } from "@/config/routes";
import { useFocusOnReveal } from "@/lib/a11y/use-focus-on-reveal.client";
import { StatusBadge } from "@/components/data/status-badge";
import { cn } from "@/lib/cn";

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
const STATUS_OPTIONS = STATUSES.map((value) => ({
  value,
  label: value || "All statuses",
}));
const FILTER_KEYS = ["status"];
export function AdminAgencies() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reasonFor, setReasonFor] = useState(null);
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const focusReason = useFocusOnReveal();
  const focusNewAgency = useFocusOnReveal();
  const [createErrors, setCreateErrors] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminOrganizations({ page, page_size: limit, status: filters.status })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.status]);

  /* One effect keyed on the URL, so a navigation fires exactly one request. */
  useEffect(() => {
    load();
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
      load();
    } catch (err) {
      // 409 invalid_status_transition explains which moves are allowed — keep it.
      setNotice({ tone: "error", text: err?.message || "That change wasn't accepted." });
    } finally {
      setPending(null);
    }
  }

  async function create(event) {
    event.preventDefault();
    // Captured before the first await — React nulls currentTarget once we yield.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setCreateErrors({});
    setNotice(null);
    try {
      const org = await createOrganization({
        name: String(form.get("name") || "").trim(),
        billingEmail: String(form.get("billing_email") || "").trim(),
        country: String(form.get("country") || "").trim() || undefined,
      });
      formEl.reset();
      setCreating(false);
      setNotice({ tone: "success", text: `Created ${org.name}. Add a member to issue their login.` });
      load();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setCreateErrors(fields);
      else setNotice({ tone: "error", text: err?.message || "We couldn't create that agency." });
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
      <AdminToolbar>
        <ToolbarSelect
          label="Filter agencies by status"
          value={filters.status}
          onChange={(value) => setFilters({ status: value })}
          options={STATUS_OPTIONS}
        />
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="h-8 rounded-admin-sm border border-admin-border px-3 text-admin-label text-admin-text transition-colors hover:bg-admin-hover"
        >
          {creating ? "Cancel" : "New agency"}
        </button>
      </AdminToolbar>

      {notice ? (
        <p
          role={notice.tone === "success" ? "status" : "alert"}
          className={cn(
            "mb-4 rounded-md p-3 text-body-sm",
            notice.tone === "success"
              ? "bg-success-text/10 text-success-text"
              : "bg-destructive/10 text-destructive-text",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {/* Agencies cannot sign themselves up — no registration, no Google login, no
          self-service reset (contract §7). This form is the only way one exists. */}
      {creating ? (
        <form onSubmit={create} className="mb-4 rounded-card border border-border bg-white p-5" noValidate>
          <p className="mb-3 text-body-sm text-muted-foreground">
            Creates the agency in <strong className="text-foreground">pending</strong>. Approve it,
            then add a member to issue their login — they cannot register themselves.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-label-bold text-foreground">Agency name</span>
              <input
                ref={focusNewAgency}
                name="name"
                type="text"
                required
                aria-invalid={createErrors.name ? "true" : undefined}
                className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
              />
            </label>
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-label-bold text-foreground">Billing email</span>
              <input
                name="billing_email"
                type="email"
                required
                aria-invalid={createErrors.billing_email ? "true" : undefined}
                className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
              />
            </label>
            <label>
              <span className="mb-1 block text-label-bold text-foreground">Country</span>
              <input
                name="country"
                type="text"
                maxLength={2}
                placeholder="AE"
                className="w-24 rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm uppercase outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110"
            >
              Create agency
            </button>
          </div>
          {Object.entries(createErrors).map(([field, message]) => (
            <p key={field} role="alert" className="mt-2 text-body-sm text-destructive-text">
              {field}: {message}
            </p>
          ))}
        </form>
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
        density="compact"
        caption="Travel agencies and their lifecycle state"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{ title: "No agencies", body: "No organizations match this filter." }}
      />
    </div>
  );
}
