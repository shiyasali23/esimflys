import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  currentPage,
  hasNext,
  hasPrevious,
  pageFromUrl,
  pageRange,
  totalPages,
} from "@/lib/api/pagination";

const url = (page) => `http://localhost:3000/api/v1/admin/orders/?page=${page}`;

describe("pageFromUrl", () => {
  it("reads the page param from a DRF cursor url", () => {
    expect(pageFromUrl(url(3))).toBe(3);
  });

  // Page 1's url carries no ?page — DRF omits it — so it must not read as null.
  it("treats a url without a page param as page 1", () => {
    expect(pageFromUrl("http://localhost:3000/api/v1/admin/orders/")).toBe(1);
  });

  it("returns null for absent or unparseable input", () => {
    expect(pageFromUrl(null)).toBeNull();
    expect(pageFromUrl("")).toBeNull();
  });
});

describe("currentPage", () => {
  // The envelope never states the current page; it is derived from `previous`.
  it("is 1 when there is no previous page", () => {
    expect(currentPage({ previous: null, next: url(2), count: 40 })).toBe(1);
  });

  it("is previous + 1 otherwise", () => {
    expect(currentPage({ previous: url(2), next: url(4), count: 100 })).toBe(3);
  });

  it("is 2 when previous is page 1 with no page param", () => {
    expect(currentPage({ previous: "http://localhost:3000/api/v1/admin/orders/", next: null })).toBe(2);
  });
});

describe("DEFAULT_PAGE_SIZE", () => {
  // Must track DRF's configured page_size (apps/common/pagination.py = 24).
  // A mismatch silently corrupts every "Showing X–Y of Z" range.
  it("matches the backend page size", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(24);
  });
});

describe("totalPages", () => {
  it("rounds up partial pages", () => {
    expect(totalPages({ count: 41 }, 20)).toBe(3);
    expect(totalPages({ count: 40 }, 20)).toBe(2);
  });

  it("is at least 1, even with no rows", () => {
    expect(totalPages({ count: 0 }, 20)).toBe(1);
    expect(totalPages(null, 20)).toBe(1);
  });
});

describe("pageRange", () => {
  it("describes the rows actually on screen", () => {
    const list = { count: 57, previous: url(2), next: url(4), results: new Array(20).fill({}) };
    expect(pageRange(list, 20)).toEqual({ from: 41, to: 57, count: 57 });
  });

  it("clamps the last page to the total count", () => {
    const list = { count: 21, previous: "http://x/?page=1", next: null, results: [{}] };
    expect(pageRange(list, 20)).toEqual({ from: 21, to: 21, count: 21 });
  });

  it("is empty when there are no rows", () => {
    expect(pageRange({ count: 0, results: [] }, 20)).toEqual({ from: 0, to: 0, count: 0 });
  });
});

describe("hasNext / hasPrevious", () => {
  it("reflects the cursor urls", () => {
    expect(hasNext({ next: url(2) })).toBe(true);
    expect(hasNext({ next: null })).toBe(false);
    expect(hasPrevious({ previous: null })).toBe(false);
  });
});
