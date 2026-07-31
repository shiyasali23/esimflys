"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { currentPage, hasNext, hasPrevious, pageRange, totalPages } from "@/lib/api/pagination";

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
 *   rowKey?: (row: any) => string, caption: string,
 *   empty?: {title: string, body?: string},
 * }} props
 */
export function DataTable({
  columns,
  list,
  loading,
  error,
  onRetry,
  onPageChange,
  pageSize,
  rowKey = (row) => row.id,
  caption,
  empty,
}) {
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
      <div className="min-h-[22rem] space-y-2" aria-busy="true">
        <div className="h-12 animate-pulse rounded-md bg-muted/70" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  const rows = list?.results || [];
  if (!rows.length) {
    return <EmptyState title={empty?.title || "Nothing to show"} body={empty?.body} />;
  }

  const range = pageRange(list, pageSize);
  const pages = totalPages(list, pageSize);
  const page = currentPage(list);

  return (
    <div className="min-h-[22rem]">
      <div className="overflow-hidden rounded-card border border-border bg-white">
        <table className="w-full text-body-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 text-label-caps uppercase text-muted-foreground ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="block md:table-row">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    data-label={col.header}
                    className={`flex items-center justify-between gap-4 px-4 py-3 before:text-label-caps before:uppercase before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:before:content-none ${
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

      {onPageChange && pages > 1 ? (
        <nav
          aria-label="Pagination"
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-body-sm text-muted-foreground" aria-live="polite">
            Showing {range.from}–{range.to} of {range.count}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPrevious(list)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft size={16} aria-hidden /> Previous
            </button>
            <span className="text-body-sm text-muted-foreground">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNext(list)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-40"
            >
              Next <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
