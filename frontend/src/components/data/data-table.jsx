"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import {
  currentPage,
  hasNext,
  hasPrevious,
  pageRange,
  totalPages,
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
} from "@/lib/api/pagination";

/**
 * Table for the admin and agency lists.
 *
 * Below `md` each row becomes a stacked card with its column header as a label —
 * a horizontally scrolling table is unusable on a phone, and these panels are
 * consulted on the move. Semantic <table> markup is kept at every size so screen
 * readers still get row/column relationships.
 *
 * @param {{
 *   columns: Array<{key: string, header: string, render?: (row: any) => any, align?: "right"}>,
 *   list: {results: any[], count: number, next: string|null, previous: string|null}|null,
 *   loading?: boolean, error?: any, onRetry?: () => void,
 *   onPageChange?: (page: number) => void, pageSize?: number,
 *   onPageSizeChange?: (size: number) => void,
 *   density?: "comfortable" | "compact",
 *   rowKey?: (row: any) => string, caption: string,
 *   empty?: {title: string, body?: string},
 * }} props
 *
 * `density` is an OPT-IN variant, defaulting to `comfortable`.
 *
 * This component is shared with the customer account order list. The operational panels
 * want 40px rows and 11px caps headers; a customer looking at three orders does not, and
 * quietly shrinking their page to serve an admin requirement would be a regression they
 * never asked for. The default branch is byte-identical to what shipped before, so the
 * customer call site — which passes no `density` — cannot change.
 */
const DENSITY = {
  comfortable: {
    head: "px-4 py-3 text-label-caps uppercase text-muted-foreground",
    headRow: "border-b border-border bg-muted/50",
    cell: "px-4 py-3",
    frame: "overflow-hidden rounded-card border border-border bg-white",
    table: "w-full text-body-sm",
    minHeight: "min-h-[22rem]",
    row: "",
  },
  compact: {
    head: "h-7 px-3 text-admin-caps uppercase text-admin-text-muted",
    headRow: "border-b border-admin-border bg-admin-bg",
    cell: "px-3 py-2 align-middle",
    frame: "overflow-hidden rounded-admin border border-admin-border bg-admin-surface shadow-admin",
    table: "w-full text-admin-body",
    // No reserved minimum: the panel's scroll container owns the viewport, so a short
    // result set should end where it ends rather than hold open 22rem of empty card.
    minHeight: "",
    row: "transition-colors hover:bg-admin-hover",
  },
};

export function DataTable({
  columns,
  list,
  loading,
  error,
  onRetry,
  onPageChange,
  onPageSizeChange,
  pageSize,
  density = "comfortable",
  rowKey = (row) => row.id,
  caption,
  empty,
}) {
  const d = DENSITY[density] || DENSITY.comfortable;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  /*
   * The placeholder reserves the height a loaded table actually occupies.
   * Measured attribution showed the real CLS was the FOOTER being pushed 270px
   * down (y 468 → 738) once rows arrived — on a short page the footer is on
   * screen, so any growth below the fold still counts. Matching the height keeps
   * it still, and min-h on the loaded state stops a small result set collapsing
   * back the other way.
   */
  if (loading && !list) {
    return (
      <div className={`${d.minHeight} space-y-2`} aria-busy="true">
        <div className="h-12 animate-pulse rounded-md bg-muted/70" />
        {Array.from({ length: density === "compact" ? 10 : 4 }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded-md bg-muted ${density === "compact" ? "h-10" : "h-14"}`}
          />
        ))}
      </div>
    );
  }

  const rows = list?.results || [];
  if (!rows.length) {
    return <EmptyState title={empty?.title || "Nothing to show"} body={empty?.body} />;
  }

  const range = pageRange(list, pageSize || DEFAULT_PAGE_SIZE);
  const pages = totalPages(list, pageSize || DEFAULT_PAGE_SIZE);
  const page = currentPage(list);

  return (
    <div className={d.minHeight}>
      <div className={d.frame}>
        <table className={d.table}>
          <caption className="sr-only">{caption}</caption>
          <thead className="hidden md:table-header-group">
            <tr className={d.headRow}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`${d.head} ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className={`block md:table-row ${d.row}`}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    data-label={col.header}
                    className={`flex items-center justify-between gap-4 ${d.cell} before:text-label-caps before:uppercase before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:before:content-none ${
                      col.align === "right" ? "md:text-right" : ""
                    }`}
                  >
                    <span className="min-w-0 text-right md:text-left">
                      {col.render ? col.render(row) : (row[col.key] ?? "—")}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        In the panel the bar renders even on a single page: it answers "how many are
        there?", which was otherwise unanswerable without counting rows by eye.
        
        For the customer it stays hidden, exactly as before. A shopper with three orders
        does not need "Showing 1–3 of 3" and a pair of dead arrows, and giving it to them
        to satisfy an operator's requirement would be a regression they never asked for.
        This is the whole reason `density` is a variant and not a redesign.
      */}
      {onPageChange && (pages > 1 || density === "compact") ? (
        <nav
          aria-label="Pagination"
          className={
            density === "compact"
              ? "mt-2 flex h-11 flex-wrap items-center justify-between gap-3 px-1"
              : "mt-4 flex flex-wrap items-center justify-between gap-3"
          }
        >
          <p
            className={
              density === "compact"
                ? "text-admin-label text-admin-text-muted"
                : "text-body-sm text-muted-foreground"
            }
            aria-live="polite"
          >
            Showing {range.from}–{range.to} of {range.count}
          </p>
          <div className="flex items-center gap-2">
            {onPageSizeChange ? (
              <label
                className={
                  density === "compact"
                    ? "flex items-center gap-1.5 text-admin-label text-admin-text-muted"
                    : "flex items-center gap-1.5 text-body-sm text-muted-foreground"
                }
              >
                <span>Rows</span>
                <select
                  value={pageSize || DEFAULT_PAGE_SIZE}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  className={
                    density === "compact"
                      ? "h-8 rounded-admin-sm border border-admin-border bg-admin-surface px-1.5 text-admin-body text-admin-text"
                      : "rounded-md border border-border bg-white px-2 py-1 text-body-sm text-foreground"
                  }
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPrevious(list)}
              className={
                density === "compact"
                  ? "inline-flex h-8 items-center gap-1 rounded-admin-sm border border-admin-border px-2 text-admin-label text-admin-text hover:bg-admin-hover disabled:opacity-40"
                  : "inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-40"
              }
            >
              <ChevronLeft size={16} aria-hidden /> Previous
            </button>
            <span
              className={
                density === "compact"
                  ? "text-admin-label text-admin-text-muted"
                  : "text-body-sm text-muted-foreground"
              }
            >
              Page {page} of {pages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNext(list)}
              className={
                density === "compact"
                  ? "inline-flex h-8 items-center gap-1 rounded-admin-sm border border-admin-border px-2 text-admin-label text-admin-text hover:bg-admin-hover disabled:opacity-40"
                  : "inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-40"
              }
            >
              Next <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
