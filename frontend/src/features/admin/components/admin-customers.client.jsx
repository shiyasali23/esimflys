"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchAdminCustomers } from "@/lib/api/admin";
import { useListQuery } from "@/features/admin/hooks/use-list-query.client";
import {
  AdminToolbar,
  ToolbarSearch,
  ToolbarSelect,
} from "@/features/admin/components/admin-toolbar.client";
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
const FILTER_KEYS = ["q"];
export function AdminCustomers() {
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
    fetchAdminCustomers({ page, page_size: limit, search: filters.q })
      .then(setList)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, limit, filters.q]);

  useEffect(() => {
    load();
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
      /**
       * Deliberately NOT a Yes/No. `email_verified_at` stays null even for Google
       * sign-ins — Google's verification links the account but is never written
       * here, and nothing in the backend gates on it (contract §9). "No" would tell
       * an operator an account is unverified when it is simply unrecorded.
       */
      key: "email_verified_at",
      header: "Email confirmed",
      render: (row) =>
        row.email_verified_at ? (
          new Date(row.email_verified_at).toLocaleDateString()
        ) : (
          <span className="text-muted-foreground">Not recorded</span>
        ),
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
      <AdminToolbar>
        <ToolbarSearch
          label="Search customers by email or name"
          value={draft}
          onChange={setDraft}
          onSubmit={() => setFilters({ q: draft })}
          placeholder="Email or name"
        />
      </AdminToolbar>

      <DataTable
        density="compact"
        caption="Platform customers"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        pageSize={limit}
        onRetry={load}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        empty={{ title: "No customers found", body: "Try a different search." }}
      />
    </div>
  );
}
