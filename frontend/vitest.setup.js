import { useSyncExternalStore } from "react";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Shared setup for component tests.
 *
 * Next's navigation hooks read from a router context that only exists inside the
 * App Router runtime, so they are stubbed here rather than in every file. Tests
 * that care about navigation assert against `routerMock` instead.
 */

export const navigationState = {
  pathname: "/",
  searchParams: new URLSearchParams(),
};

/*
 * The URL is REACTIVE here, as it is in the real router.
 *
 * This used to be a static object: `router.replace()` was a bare spy and
 * `useSearchParams()` returned whatever `navigationState` happened to hold, with nothing
 * telling React to render again. That was fine while every list view kept its filters in
 * `useState` — and stopped being fine the moment they moved into the URL, because a test
 * could change a filter, see the spy called, and watch the component sit there showing
 * the old query. The failure looked like a component bug and was a harness bug.
 *
 * `replace` now writes the new pathname and query into `navigationState` and notifies
 * subscribers, so a component reading `useSearchParams` re-renders exactly as it does in
 * the browser. Assertions against `routerMock.replace` still work — it is still a spy.
 */
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

function applyUrl(url) {
  const [pathname, query = ""] = String(url).split("?");
  navigationState.pathname = pathname;
  navigationState.searchParams = new URLSearchParams(query);
  notify();
}

export const routerMock = {
  push: vi.fn(applyUrl),
  replace: vi.fn(applyUrl),
  refresh: vi.fn(),
  back: vi.fn(),
};

function useReactiveSearchParams() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => navigationState.searchParams,
    () => navigationState.searchParams,
  );
}

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => navigationState.pathname,
  useSearchParams: () => useReactiveSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

afterEach(() => {
  cleanup();
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
  routerMock.refresh.mockClear();
  navigationState.pathname = "/";
  navigationState.searchParams = new URLSearchParams();
  listeners.clear();
});

/** localStorage/sessionStorage are absent from this jsdom build. */
function installStorage(key) {
  const data = new Map();
  Object.defineProperty(window, key, {
    configurable: true,
    value: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
      clear: () => data.clear(),
    },
  });
}

/**
 * jsdom implements no media queries at all, and embla-carousel calls matchMedia
 * while activating — without this the carousel throws on mount rather than
 * rendering. Nothing here evaluates a query: every list reports "not matching",
 * which is the desktop/no-preference default the components already assume.
 */
function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query) => ({
      media: query,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * Also absent from jsdom, and used by both embla-carousel and the scroll-reveal
 * animations. Nothing ever intersects here, so reveal-on-scroll content must not
 * depend on a callback firing to become readable — if it did, these tests would
 * be asserting against an empty page.
 */
function installIntersectionObserver() {
  class NoopIntersectionObserver {
    constructor() {
      this.root = null;
      this.rootMargin = "";
      this.thresholds = [];
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver = NoopIntersectionObserver;
  globalThis.IntersectionObserver = NoopIntersectionObserver;
}

/** The third observer jsdom omits; embla measures its viewport with it. */
function installResizeObserver() {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = NoopResizeObserver;
  globalThis.ResizeObserver = NoopResizeObserver;
}

if (typeof window !== "undefined") {
  installStorage("localStorage");
  installStorage("sessionStorage");
  installMatchMedia();
  installIntersectionObserver();
  installResizeObserver();
}
