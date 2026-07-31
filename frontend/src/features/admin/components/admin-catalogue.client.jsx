"use client";
import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminPlans,
  fetchAdminCountries,
  setPlanStatus,
  bulkSetPlanStatus,
  activateCountryPlans,
  readBulkResult,
} from "@/lib/api/admin";
import { fromMinor, formatDataMb, planAllowance } from "@/lib/format/units";
import { DataTable } from "@/components/data/data-table";
import { StatusBadge } from "@/components/data/status-badge";
import { Price } from "@/components/currency/price";
import { ErrorState } from "@/components/feedback/error-state";

const PLAN_STATUSES = ["", "draft", "paused", "active", "retired"];

/**
 * Catalogue management.
 *
 * Plan status is changed by ACTION — `POST …/{activate|pause|draft}/` — never by
 * PATCH, which does not accept `status`. Bulk changes report per-plan outcomes
 * under `updated` (commissions use `approved`), and never abort: activating a
 * batch that includes an already-active plan returns that plan under `failed`
 * with a readable conflict, which is shown rather than swallowed.
 *
 * `wholesale_amount_minor` and `margin_minor` are absent for roles without pricing
 * capability, so those columns are only rendered when the keys are present.
 */
export function AdminCatalogue() {
  const [tab, setTab] = useState("plans");

  return (
    <div>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Catalogue view">
        {[
          { id: "plans", label: "Plans" },
          { id: "countries", label: "Countries" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`rounded-full px-4 py-2 text-label-bold transition-colors ${
              tab === option.id
                ? "bg-primary text-on-primary"
                : "border border-border text-foreground hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "plans" ? <PlansTab /> : <CountriesTab />}
    </div>
  );
}

function BulkReport({ result }) {
  if (!result) return null;
  return (
    <div role="status" className="mb-4 rounded-md border border-border bg-muted p-4 text-body-sm">
      {result.succeeded.length ? (
        <p className="text-success-text">Updated {result.succeeded.length} plan(s).</p>
      ) : null}
      {result.failed.length ? (
        <div className="mt-2">
          <p className="text-destructive">{result.failed.length} refused:</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            {result.failed.slice(0, 5).map((f) => (
              <li key={f.id}>
                {String(f.id).slice(0, 8)} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PlansTab() {
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", search: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback((nextPage, nextFilters) => {
    setLoading(true);
    setError(null);
    setSelected([]);
    fetchAdminPlans({ page: nextPage, ...nextFilters })
      .then((data) => {
        setList(data);
        setPage(nextPage);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(1, { status: "", search: "" });
  }, [load]);

  async function changeOne(row, verb) {
    setBusy(true);
    setResult(null);
    try {
      await setPlanStatus(row.id, verb);
      load(page, filters);
    } catch (err) {
      setResult({ succeeded: [], failed: [{ id: row.id, error: err?.message || "Refused" }] });
    } finally {
      setBusy(false);
    }
  }

  async function changeSelected(status) {
    if (!selected.length) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(readBulkResult(await bulkSetPlanStatus(selected, status)));
      load(page, filters);
    } catch (err) {
      setResult({ succeeded: [], failed: [{ id: "—", error: err?.message || "Refused" }] });
    } finally {
      setBusy(false);
    }
  }

  const rows = list?.results || [];
  const showPricing = rows.length > 0 && Object.hasOwn(rows[0], "wholesale_amount_minor");

  const columns = [
    {
      key: "select",
      header: "",
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.includes(row.id)}
          aria-label={`Select ${row.product_code}`}
          onChange={(e) =>
            setSelected((prev) =>
              e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
            )
          }
          className="h-4 w-4"
        />
      ),
    },
    {
      key: "product_code",
      header: "Plan",
      render: (row) => (
        <span>
          <span className="block font-medium text-foreground">{row.display_name}</span>
          <span className="block text-body-sm text-muted-foreground">{row.product_code}</span>
        </span>
      ),
    },
    { key: "country_iso2", header: "Country" },
    {
      key: "allowance",
      header: "Data",
      render: (row) => planAllowance(row) || "—",
    },
    { key: "validity_days", header: "Days" },
    {
      key: "retail_amount_minor",
      header: "Retail",
      align: "right",
      render: (row) => <Price usd={fromMinor(row.retail_amount_minor)} />,
    },
    ...(showPricing
      ? [
          {
            key: "margin_minor",
            header: "Margin",
            align: "right",
            render: (row) => (
              <span className="text-muted-foreground">
                <Price usd={fromMinor(row.margin_minor)} />
              </span>
            ),
          },
        ]
      : []),
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <span className="flex flex-wrap justify-end gap-1.5">
          {row.status !== "active" ? (
            <button
              type="button"
              onClick={() => changeOne(row, "activate")}
              disabled={busy}
              className="rounded-full border border-border px-2.5 py-1 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
            >
              Activate
            </button>
          ) : null}
          {row.status !== "paused" ? (
            <button
              type="button"
              onClick={() => changeOne(row, "pause")}
              disabled={busy}
              className="rounded-full border border-border px-2.5 py-1 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
            >
              Pause
            </button>
          ) : null}
        </span>
      ),
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
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Product code or country"
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
            {PLAN_STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s || "All"}
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

      {selected.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-white p-4">
          <span className="text-body-sm text-foreground">{selected.length} selected</span>
          <button
            type="button"
            onClick={() => changeSelected("active")}
            disabled={busy}
            className="rounded-full bg-cta px-4 py-2 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-50"
          >
            Activate
          </button>
          <button
            type="button"
            onClick={() => changeSelected("paused")}
            disabled={busy}
            className="rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-label-bold text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      <BulkReport result={result} />

      <DataTable
        caption="Catalogue plans"
        columns={columns}
        list={list}
        loading={loading}
        error={error}
        onRetry={() => load(page, filters)}
        onPageChange={(next) => load(next, filters)}
        empty={{ title: "No plans found", body: "Try a different search or status." }}
      />
    </div>
  );
}

function CountriesTab() {
  const [countries, setCountries] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    fetchAdminCountries().then(setCountries).catch(setError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function goLive(country) {
    setBusyId(country.id);
    setResult(null);
    try {
      setResult(readBulkResult(await activateCountryPlans(country.id)));
      load();
    } catch (err) {
      setResult({ succeeded: [], failed: [{ id: country.id, error: err?.message || "Refused" }] });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorState error={error} title="We couldn't load countries" />;
  if (!countries) return <div className="min-h-[22rem] animate-pulse rounded-card bg-muted" aria-busy="true" />;

  return (
    <div>
      <BulkReport result={result} />
      <div className="overflow-hidden rounded-card border border-border bg-white">
        <table className="w-full text-body-sm">
          <caption className="sr-only">Countries and plan activation</caption>
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-border bg-muted/50">
              {["Country", "Region", "Plans", "Active", "Visible", ""].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-3 text-left text-label-caps uppercase text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {countries.map((country) => (
              <tr key={country.id} className="block md:table-row">
                <td className="px-4 py-3 md:table-cell">
                  <span className="font-medium text-foreground">
                    {country.flag_emoji} {country.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground md:table-cell">{country.region}</td>
                <td className="px-4 py-3 md:table-cell">{country.plan_count}</td>
                <td className="px-4 py-3 md:table-cell">{country.active_plan_count}</td>
                <td className="px-4 py-3 md:table-cell">
                  <StatusBadge status={country.is_active ? "active" : "disabled"} />
                </td>
                <td className="px-4 py-3 text-right md:table-cell">
                  {country.active_plan_count < country.plan_count ? (
                    <button
                      type="button"
                      onClick={() => goLive(country)}
                      disabled={busyId === country.id}
                      className="rounded-full border border-border px-3 py-1.5 text-label-caps uppercase text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      Activate plans
                    </button>
                  ) : (
                    <span className="text-body-sm text-muted-foreground">All live</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-body-sm text-muted-foreground">
        Activating a country turns on every sellable plan it has. Plans already active are reported
        as refused rather than silently skipped.
      </p>
    </div>
  );
}
