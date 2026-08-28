"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";
import { fetchAdminEsims, revealEsimCredentials, refreshAdminEsimUsage } from "@/lib/api/admin";
import { formatBytes, usageRatio } from "@/lib/format/units";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { routes } from "@/config/routes";

const STATUSES = ["", "pending", "provisioning", "ready", "installed", "active", "expired", "failed", "manual_review"];

/**
 * eSIM profiles across the platform.
 *
 * Credentials are NEVER in the list or detail payload — only `POST …/reveal/`
 * returns them. That call needs a separate capability (finance cannot), is limited
 * to 10 per HOUR, and every use is written to the audit trail. So it is an explicit
 * per-row button, never auto-loaded, and what it returns is held in local state
 * only for as long as the operator is looking at it.
 */
const STATUS_OPTIONS = STATUSES.map((value) => ({
  value,
  label: value ? value.replace(/_/g, " ") : "All statuses",
}));
const FILTER_KEYS = ["q", "status"];
export function AdminEsims() {
  const { page, limit, filters, setFilters, setPage, setLimit } = useListQuery({
    filterKeys: FILTER_KEYS,
  });
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(filters.q);
  const [revealed, setRevealed] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminEsims({ page, page_size: limit, search: filters.q, status: filters.status })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.q, filters.status]);

  /* One effect keyed on the URL, so a navigation fires exactly one request. */
  useEffect(() => {
    load();
  }, [load]);

  async function reveal(row) {
    setBusyId(row.id);
    setNotice(null);
    try {
      const result = await revealEsimCredentials(row.id);
      setRevealed((prev) => ({ ...prev, [row.id]: result?.credentials || result }));
    } catch (err) {
      setNotice(
        err?.status === 403
          ? "Your role can't reveal credentials."
          : err?.status === 429
            ? "Reveal limit reached (10 per hour). Try again later."
            : err?.message || "Couldn't reveal credentials.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function refresh(row) {
    setBusyId(row.id);
    setNotice(null);
    try {
      await refreshAdminEsimUsage(row.id);
      load();
    } catch (err) {
      setNotice(err?.message || "Couldn't refresh usage.");
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    {
      key: "product_name",
      header: "eSIM",
      render: (row) => (
        <span>
          <Link
            href={routes.adminEsim(row.id)}
            className="block font-medium text-primary hover:underline"
          >
            {row.product_name}
          </Link>
          <span className="block text-body-sm text-muted-foreground">
            {row.order_number}
            {row.iccid_last4 ? ` · ICCID ••••${row.iccid_last4}` : ""}
          </span>
        </span>
      ),
    },
    { key: "country_iso2", header: "Country" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span>
          <StatusBadge status={row.status} />
          {/*
            The supplier's own words under our derived status. When the two disagree —
            we say `ready`, the provider says ENABLED — that is the mapper falling
            behind, not the customer failing to install anything, and support needs to
            be able to tell those apart at a glance.
          */}
          {row.smdp_status || row.esim_status ? (
            <span className="mt-1 block text-body-sm text-muted-foreground">
              {[row.smdp_status, row.esim_status].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (row) => {
        const stamp = (value) => (value ? new Date(value).toLocaleDateString() : null);
        const installed = stamp(row.installed_at);
        const activated = stamp(row.activated_at);
        const expires = stamp(row.expires_at);
        // "Never checked" and "checked, nothing moved" look identical without this.
        if (!row.last_synced_at) {
          return <span className="text-body-sm text-muted-foreground">Not yet checked</span>;
        }
        return (
          <span className="text-body-sm">
            <span className="block text-foreground">
              {activated
                ? `Active since ${activated}`
                : installed
                  ? `Installed ${installed}`
                  : "Not installed"}
            </span>
            <span className="block text-muted-foreground">
              {expires ? `Expires ${expires}` : "No expiry reported"}
            </span>
          </span>
        );
      },
    },
    {
      key: "usage",
      header: "Remaining",
      render: (row) => {
        const ratio = usageRatio(row.remaining_data_bytes, row.total_data_bytes);
        if (ratio === null) return "—";
        return (
          <span>
            <span className="block text-foreground">{formatBytes(row.remaining_data_bytes)}</span>
            <span className="block text-body-sm text-muted-foreground">
              of {formatBytes(row.total_data_bytes)}
            </span>
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => (
        <span className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => refresh(row)}
            disabled={busyId === row.id}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={12} aria-hidden /> Sync
          </button>
          <button
            type="button"
            onClick={() => reveal(row)}
            disabled={busyId === row.id}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Eye size={12} aria-hidden /> Reveal
          </button>
        </span>
      ),
    },
    {
      key: "credentials",
      header: "Credentials",
      render: (row) => {
        const creds = revealed[row.id];
        if (!creds) return <span className="text-body-sm text-muted-foreground">Hidden</span>;
        return (
          <span className="block text-body-sm">
            <span className="block break-all text-foreground">{creds.iccid}</span>
            <span className="block break-all text-muted-foreground">{creds.activation_code}</span>
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <AdminToolbar>
        <ToolbarSearch
          label="Search eSIMs by order number or ICCID"
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilters({ q: draft })}
          placeholder="Order number or ICCID"
        />
        <ToolbarSelect
          label="Filter by eSIM status"
          value={filters.status}
          onChange={(value) => setFilters({ status: value })}
          options={STATUS_OPTIONS}
        />
      </AdminToolbar>

      {/*
        Restored deliberately. This warning and the failure notice below it sat inside the
        old filter block, and moving filters to the top bar took them with it — which
        would have removed the only on-screen statement that revealing a customer's
        activation credentials is audited and capped, on the one screen that can do it.
      */}
      <p className="mb-2 text-admin-label text-admin-text-muted">
        Revealing credentials is audited and limited to 10 per hour. Only reveal when a
        customer has asked for help.
      </p>

      {notice ? (
        <p
          role="alert"
          className="mb-2 rounded-admin-sm bg-destructive/10 px-3 py-2 text-admin-body text-destructive-text"
        >
          {notice}
        </p>
      ) : null}

      <DataTable
        density="compact"
        caption="eSIM profiles across the platform"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{ title: "No eSIMs found", body: "Try a different search or filter." }}
      />
    </div>
  );
}
