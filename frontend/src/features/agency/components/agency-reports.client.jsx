"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchAgencyRevenue } from "@/lib/api/agency";
import { fromMinor } from "@/lib/format/units";
import { Price } from "@/components/currency/price";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";

/**
 * Attributed sales over time — `{series: [{date, sales_minor, orders}]}`.
 *
 * Rendered as a table with proportional bars rather than a charting library: the
 * series is short, the numbers are the point, and a table is readable by a screen
 * reader without extra description. Bars are decorative and carry aria-hidden.
 */
export function AgencyReports({ orgId }) {
  const [series, setSeries] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState({ dateFrom: "", dateTo: "" });

  const load = useCallback(
    (params) => {
      setError(null);
      fetchAgencyRevenue(orgId, params)
        .then((result) => setSeries(Array.isArray(result?.series) ? result.series : []))
        .catch(setError);
    },
    [orgId],
  );

  useEffect(() => load({}), [load]);

  if (error) return <ErrorState error={error} title="We couldn't load your report" />;
  if (!series) return <div className="h-64 animate-pulse rounded-card bg-muted" aria-busy="true" />;

  const peak = series.reduce((max, row) => Math.max(max, Number(row.sales_minor) || 0), 0);
  const totalSales = series.reduce((sum, row) => sum + (Number(row.sales_minor) || 0), 0);
  const totalOrders = series.reduce((sum, row) => sum + (Number(row.orders) || 0), 0);

  return (
    <div>
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load({ dateFrom: range.dateFrom || undefined, dateTo: range.dateTo || undefined });
        }}
      >
        <label>
          <span className="mb-1 block text-label-bold text-foreground">From</span>
          <input
            type="date"
            value={range.dateFrom}
            onChange={(e) => setRange((r) => ({ ...r, dateFrom: e.target.value }))}
            className="rounded-md border border-border bg-white px-3 py-2 text-body-sm text-foreground"
          />
        </label>
        <label>
          <span className="mb-1 block text-label-bold text-foreground">To</span>
          <input
            type="date"
            value={range.dateTo}
            onChange={(e) => setRange((r) => ({ ...r, dateTo: e.target.value }))}
            className="rounded-md border border-border bg-white px-3 py-2 text-body-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
        >
          Apply
        </button>
      </form>

      {!series.length ? (
        <EmptyState
          title="No sales in this period"
          body="Try a wider date range, or check back once customers start using your code."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-card border border-border bg-white p-6">
              <p className="text-label-caps uppercase text-muted-foreground">Attributed sales</p>
              <p className="mt-2 font-display text-headline-lg text-primary">
                <Price usd={fromMinor(totalSales)} />
              </p>
            </div>
            <div className="rounded-card border border-border bg-white p-6">
              <p className="text-label-caps uppercase text-muted-foreground">Orders</p>
              <p className="mt-2 font-display text-headline-lg text-foreground">{totalOrders}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-border bg-white">
            <table className="w-full text-body-sm">
              <caption className="sr-only">Attributed sales by date</caption>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th scope="col" className="px-4 py-3 text-left text-label-caps uppercase text-muted-foreground">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-label-caps uppercase text-muted-foreground">
                    Orders
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-label-caps uppercase text-muted-foreground">
                    Sales
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {series.map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-3 text-foreground">
                      {new Date(row.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.orders}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium text-foreground">
                        <Price usd={fromMinor(row.sales_minor)} />
                      </span>
                      <span
                        aria-hidden
                        className="ml-3 inline-block h-1.5 rounded-full bg-primary align-middle"
                        style={{
                          width: peak ? `${Math.max(4, (row.sales_minor / peak) * 80)}px` : "4px",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
