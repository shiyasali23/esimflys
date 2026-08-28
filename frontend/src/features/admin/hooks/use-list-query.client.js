"use client";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_PAGE_SIZE, normalisePageSize } from "@/lib/api/pagination";

/**
 * List state that lives in the URL instead of in `useState`.
 *
 * Every list view held page and filters in component state, so a page of results could
 * not be linked, bookmarked, reloaded or handed to a colleague — "look at order X on
 * page 4 of the failed filter" meant describing the clicks. Reload and you were back on
 * page 1 with the filters cleared.
 *
 * THE URL IS THE ONLY SOURCE OF TRUTH. There is deliberately no mirrored `useState`
 * here, and that is a performance decision as much as a correctness one: a hook that
 * seeds state from the URL and then syncs back produces TWO renders with two different
 * values on first paint, and any effect keyed on those values fires twice — one wasted
 * request per list view, per navigation, against the API. Deriving straight from
 * `useSearchParams` means the value is right on the first render and the request fires
 * once.
 *
 * `router.replace` with `scroll: false`, not `push`: paging is not navigation a person
 * expects to unwind one step at a time with the back button, and pushing would bury the
 * page they arrived from under a stack of page numbers.
 *
 * SORT IS ABSENT ON PURPOSE. No admin list endpoint uses DRF's `OrderingFilter` — every
 * queryset carries a fixed `.order_by()` — so a `?sort=` here could only be applied to
 * the rows already fetched. On paginated data that sorts ONE PAGE while presenting
 * itself as sorting the table, which is worse than not offering it. It needs a backend
 * change to mean anything, and that is out of scope.
 */
export function useListQuery({ filterKeys = [], defaultPageSize = DEFAULT_PAGE_SIZE } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = normalisePageSize(searchParams.get("limit") || defaultPageSize);

  /*
   * Rebuilt only when the query string actually changes. Filter objects are passed
   * straight into fetch dependencies downstream, so a fresh object every render would
   * re-trigger the effect that fetches — the exact wasted request this hook exists to
   * avoid.
   */
  const key = searchParams.toString();
  // Hoisted so the dependency is a plain identifier. The lint rule requires simple
  // expressions in a dep list, and it is right to: an expression evaluated inline is
  // easy to change without noticing it changed the memo's identity.
  const filterKey = filterKeys.join(",");
  const filters = useMemo(() => {
    const params = new URLSearchParams(key);
    const next = {};
    for (const name of filterKey ? filterKey.split(",") : []) {
      next[name] = params.get(name) || "";
    }
    return next;
  }, [key, filterKey]);

  const write = useCallback(
    (changes) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [name, value] of Object.entries(changes)) {
        // An empty filter is an ABSENT param, not `?q=`. Keeping empties would make two
        // URLs for the same view and put "?q=&payment_status=" in front of an operator.
        if (value === "" || value === null || value === undefined) params.delete(name);
        else params.set(name, String(value));
      }
      if (Number(params.get("page")) === 1) params.delete("page");
      if (Number(params.get("limit")) === DEFAULT_PAGE_SIZE) params.delete("limit");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return {
    page,
    limit,
    filters,
    /** Changing a filter returns to page 1 — page 4 of a different result set is meaningless. */
    setFilters: useCallback((changes) => write({ ...changes, page: 1 }), [write]),
    setPage: useCallback((next) => write({ page: next }), [write]),
    /** Same reasoning: 100 rows starting from page 4 of a 24-row pagination is not a page. */
    setLimit: useCallback((next) => write({ limit: next, page: 1 }), [write]),
  };
}
