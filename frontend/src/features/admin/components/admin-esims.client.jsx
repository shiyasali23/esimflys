"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";
import { fetchAdminEsims, revealEsimCredentials, refreshAdminEsimUsage } from "@/lib/api/admin";
import { formatBytes, usageRatio } from "@/lib/format/units";
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
export function AdminEsims() {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback((nextPage, nextFilters) => {
    setLoading(true);
    setError(null);
    fetchAdminEsims({ page: nextPage, ...nextFilters })
      .then((result) => {
        setList(result);
        setPage(nextPage);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, { search: "", status: "" });
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
      load(page, filters);
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
      render: (row) => <StatusBadge status={row.status} />,
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
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load(1, filters);
        }}
      >
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Order number or ICCID"
            className="w-full rounded-md border border-border bg-white px-4 py-2.5 text-body-sm outline-none focus:border-primary"
          />
        </label>
        <label>
          <span className="mb-1 block text-label-bold text-foreground">Status</span>
          <select
            value={filters.status}
            onChange={(e) => {
              const next = { ...filters, status: e.target.value };
              setFilters(next);
              load(1, next);
            }}
            className="rounded-md border border-border bg-white px-3 py-2.5 text-body-sm text-foreground"
          >
            {STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s ? s.replace(/_/g, " ") : "All"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
        >
          Apply
        </button>
      </form>

      <p className="mb-4 text-body-sm text-muted-foreground">
        Revealing credentials is audited and limited to 10 per hour. Only reveal when a customer has
        asked for help.
      </p>

      {notice ? (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {notice}
        </p>
      ) : null}

      <DataTable
        caption="eSIM profiles across the platform"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(page, filters)}
        onPageChange={(next) => load(next, filters)}
        empty={{ title: "No eSIMs found", body: "Try a different search or filter." }}
      />
    </div>
  );
}
