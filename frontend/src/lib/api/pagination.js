/**
 * Paginated list helpers.
 *
 * DRF returns `{count, next, previous, results}` where next/previous are absolute
 * URLs, not page numbers — so the current page has to be derived rather than
 * tracked. Page 1 is the case where `previous` is null, which is also the only
 * reliable way to know it, since page 1's URL carries no `page` param.
 */

/** Mirrors DRF's configured page_size (apps/common/pagination.py). */
export const DEFAULT_PAGE_SIZE = 24;

/** Reads the `page` query param from a DRF cursor URL. */
export function pageFromUrl(url) {
  if (typeof url !== "string" || !url) return null;
  try {
    const value = new URL(url, "http://localhost").searchParams.get("page");
    const page = Number(value);
    return Number.isInteger(page) && page > 0 ? page : 1;
  } catch {
    return null;
  }
}

export function currentPage(list) {
  if (!list) return 1;
  if (!list.previous) return 1;
  const previous = pageFromUrl(list.previous);
  return previous ? previous + 1 : 2;
}

export function totalPages(list, pageSize = DEFAULT_PAGE_SIZE) {
  const count = Number(list?.count) || 0;
  if (count <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(count / pageSize));
}

/** Inclusive 1-based range of the rows on screen, for "Showing X–Y of Z". */
export function pageRange(list, pageSize = DEFAULT_PAGE_SIZE) {
  const count = Number(list?.count) || 0;
  const shown = list?.results?.length || 0;
  if (!count || !shown) return { from: 0, to: 0, count };
  const from = (currentPage(list) - 1) * pageSize + 1;
  return { from, to: Math.min(from + shown - 1, count), count };
}

export function hasNext(list) {
  return Boolean(list?.next);
}

export function hasPrevious(list) {
  return Boolean(list?.previous);
}
