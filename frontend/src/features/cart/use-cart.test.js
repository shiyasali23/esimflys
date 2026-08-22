// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useCart,
  cartIsEmpty,
  totalUnits,
  subtotalUsd,
} from "@/features/cart/use-cart.client";

/**
 * The selection store. There is no server cart any more — `POST /checkout/direct/`
 * takes the item list and creates the order in one call — so this holds only what
 * the shopper picked. The point of these tests is that it never becomes a source
 * of truth for money: `usd` is the catalogue figure used to render a total, and the
 * server prices every line itself.
 */

const STORAGE_KEY = "esimflys-selection";

/** jsdom in this setup ships no working sessionStorage. */
function installMemoryStorage() {
  const data = new Map();
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
      clear: () => data.clear(),
    },
  });
  return data;
}

const PLAN = {
  productCode: "SA-10GB-30D-V1",
  displayName: "10 GB",
  countryName: "Saudi Arabia",
  countrySlug: "saudi-arabia",
  usd: 14.99,
  quantity: 1,
};

let store;

beforeEach(() => {
  store = installMemoryStorage();
  useCart.setState({ items: [], hydrated: false });
});

describe("helpers", () => {
  it("treats a missing or empty list as nothing selected", () => {
    expect(cartIsEmpty(null)).toBe(true);
    expect(cartIsEmpty([])).toBe(true);
    expect(cartIsEmpty([PLAN])).toBe(false);
  });

  it("sums units and catalogue dollars across lines", () => {
    const items = [
      { ...PLAN, quantity: 2 },
      { ...PLAN, productCode: "AL-5GB-30D-V1", usd: 9.5, quantity: 3 },
    ];
    expect(totalUnits(items)).toBe(5);
    expect(subtotalUsd(items)).toBeCloseTo(14.99 * 2 + 9.5 * 3, 10);
  });
});

describe("hydrate", () => {
  /**
   * The store must start empty on the client too, or the first client render would
   * not match the server's and React would throw a hydration mismatch. The stored
   * selection is only adopted afterwards, in an effect.
   */
  it("starts empty and only reads storage when asked", () => {
    store.set(STORAGE_KEY, JSON.stringify([PLAN]));
    expect(useCart.getState().items).toEqual([]);
    useCart.getState().hydrate();
    expect(useCart.getState().items).toEqual([PLAN]);
    expect(useCart.getState().hydrated).toBe(true);
  });

  // Otherwise a second mount would wipe a selection made since the first.
  it("does not re-read storage once hydrated", () => {
    useCart.getState().hydrate();
    useCart.getState().add(PLAN);
    store.set(STORAGE_KEY, JSON.stringify([]));
    useCart.getState().hydrate();
    expect(useCart.getState().items).toHaveLength(1);
  });

  it("survives corrupt storage rather than throwing on first paint", () => {
    store.set(STORAGE_KEY, "{not json");
    useCart.getState().hydrate();
    expect(useCart.getState().items).toEqual([]);
  });
});

describe("add", () => {
  it("persists the selection so a reload does not lose it", () => {
    useCart.getState().add(PLAN);
    expect(JSON.parse(store.get(STORAGE_KEY))).toEqual([PLAN]);
  });

  /**
   * One eSIM per plan. This used to raise the quantity to 2, which was right while
   * checkout had a stepper to see and undo it with. Without one, a second press of
   * "Continue to checkout" on the same country page would silently double the bill
   * with nothing on screen to correct it.
   */
  it("keeps a repeat pick at one line and one eSIM", () => {
    useCart.getState().add(PLAN);
    useCart.getState().add(PLAN);
    const { items } = useCart.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1);
  });

  it("does not let a caller ask for more than one", () => {
    useCart.getState().add({ ...PLAN, quantity: 7 });
    expect(useCart.getState().items[0].quantity).toBe(1);
  });

  it("keeps different plans as separate lines", () => {
    useCart.getState().add(PLAN);
    useCart.getState().add({ ...PLAN, productCode: "AL-5GB-30D-V1" });
    expect(useCart.getState().items).toHaveLength(2);
  });
});

/**
 * sessionStorage outlives a deploy, so a tab that picked the same plan twice under the
 * build that still had a stepper holds `{quantity: 2}`. Adopting that would show a
 * doubled price and "2 eSIMs" on a screen with no control to correct it.
 */
describe("quantities left over from an older build", () => {
  it("normalises a stored quantity down to one", () => {
    store.set(STORAGE_KEY, JSON.stringify([{ ...PLAN, quantity: 3 }]));
    useCart.getState().hydrate();
    expect(useCart.getState().items[0].quantity).toBe(1);
  });

  it("rewrites storage, so the next read is already correct", () => {
    store.set(STORAGE_KEY, JSON.stringify([{ ...PLAN, quantity: 3 }]));
    useCart.getState().hydrate();
    expect(JSON.parse(store.get(STORAGE_KEY))[0].quantity).toBe(1);
  });
});

describe("remove and reset", () => {
  it("drops one line and leaves the others", () => {
    useCart.getState().add(PLAN);
    useCart.getState().add({ ...PLAN, productCode: "AL-5GB-30D-V1" });
    useCart.getState().remove(PLAN.productCode);
    expect(useCart.getState().items.map((i) => i.productCode)).toEqual(["AL-5GB-30D-V1"]);
  });

  // Called once the order exists — the selection has become an order.
  it("clears storage as well as state, so a reload cannot resurrect it", () => {
    useCart.getState().add(PLAN);
    useCart.getState().reset();
    expect(useCart.getState().items).toEqual([]);
    expect(JSON.parse(store.get(STORAGE_KEY))).toEqual([]);
  });
});

describe("storage failure", () => {
  // Safari private mode throws on write. The selection must still work for this page.
  it("keeps working when sessionStorage refuses to write", () => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: vi.fn(),
      },
    });
    expect(() => useCart.getState().add(PLAN)).not.toThrow();
    expect(useCart.getState().items).toHaveLength(1);
  });
});
