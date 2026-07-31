"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminCustomers } from "@/lib/api/admin";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { routes } from "@/config/routes";

/**
 * Platform customers.
 *
 * The list is safe to browse, but `GET /admin/customers/{id}/` is recorded as PII
 * access in the audit trail — so this screen does not preload detail for every
 * row. Opening a customer is a deliberate act.
 */
export function AdminCustomers() {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback((nextPage, nextSearch) => {
    setLoading(true);
    setError(null);
    fetchAdminCustomers({ page: nextPage, search: nextSearch })
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
      key: "email",
      header: "Customer",
      render: (row) => {
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
        return (
          <span>
            <Link
              href={routes.adminCustomer(row.id)}
              className="block font-medium text-primary hover:underline"
            >
              {name || row.email}
            </Link>
            {name ? (
              <span className="block text-body-sm text-muted-foreground">{row.email}</span>
            ) : null}
          </span>
        );
      },
    },
    { key: "order_count", header: "Orders" },
    { key: "preferred_currency", header: "Currency" },
    {
      key: "email_verified_at",
      header: "Verified",
      render: (row) => (row.email_verified_at ? "Yes" : "No"),
    },
    {
      key: "is_active",
      header: "Account",
      render: (row) => <StatusBadge status={row.is_active ? "active" : "disabled"} />,
    },
    {
      key: "date_joined",
      header: "Joined",
      align: "right",
      render: (row) => (row.date_joined ? new Date(row.date_joined).toLocaleDateString() : "—"),
    },
  ];

  return (
    <div>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load(1, search);
        }}
      >
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Email or name"
            className="w-full rounded-md border border-border bg-white px-4 py-2.5 text-body-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
        >
          Search
        </button>
      </form>

      <DataTable
        caption="Platform customers"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(page, search)}
        onPageChange={(next) => load(next, search)}
        empty={{ title: "No customers found", body: "Try a different search." }}
      />
    </div>
  );
}
