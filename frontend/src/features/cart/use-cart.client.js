"use client";
import { create } from "zustand";

/**
 * What the shopper has selected, held in the browser only.
 *
 * There is no server-side cart any more: `POST /checkout/direct/` takes the item list
 * and creates the order in one call. So this store answers "what did they pick", and
 * nothing else. It holds no prices the server will honour — `usd` here is the
 * catalogue figure used to render a total, and the server prices every line itself
 * when the order is created.
 *
 * Persisted to sessionStorage because the previous server cart survived a page
 * reload via its token, and losing the selection on refresh would be a regression.
 * Session, not local: a selection is one visit's intent, not a standing basket.
 *
 * ONE eSIM PER PLAN. `quantity` is on every item because the order request carries it
 * (see `lib/api/orders.js`) and the backend expects the field, but it is always 1 — the
 * checkout screen has no quantity control, so there is no way for a shopper to set
 * anything else and no way for them to see or undo it if something did. `add` and
 * `hydrate` below are the two places that hold that invariant.
 *
 * Item shape: {productCode, displayName, countryName, countrySlug, usd, quantity: 1}
 */
const STORAGE_KEY = "esimflys-selection";

function readStored() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(items) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Safari private mode throws. The selection still works for this page.
  }
}

export const useCart = create((set, get) => ({
  /**
   * Starts empty on both server and client so the first client render matches the
   * server's. `hydrate()` fills it from sessionStorage in an effect, after mount.
   */
  items: [],
  hydrated: false,

  /*
   * Stored quantities are normalised to 1 on the way in.
   *
   * sessionStorage outlives a deploy, so a tab that picked the same plan twice under
   * the previous build still holds `{quantity: 2}`. Adopting that as-is would show a
   * doubled line price and "2 eSIMs" on a screen with no control to correct it — the
   * shopper's only way out would be deleting the row. Rewritten to storage as well,
   * but only when something actually changed, so an ordinary load stays a pure read.
   */
  hydrate() {
    if (get().hydrated) return;
    const stored = readStored();
    const items = stored.map((i) => (i.quantity === 1 ? i : { ...i, quantity: 1 }));
    set({ items, hydrated: true });
    if (items.some((item, n) => item !== stored[n])) persist(items);
  },

  /**
   * Adding the same plan twice is a no-op — one line, still one eSIM.
   *
   * This used to raise the quantity instead. That was right while checkout carried a
   * stepper to see and undo it with; without one, coming back to a country page and
   * pressing "Continue to checkout" a second time would silently double the bill.
   * Nothing about the plan can have changed in between, so the second press has
   * nothing to apply.
   */
  add({ productCode, displayName, countryName, countrySlug, usd }) {
    const items = [...get().items];
    if (items.some((i) => i.productCode === productCode)) return items;
    items.push({ productCode, displayName, countryName, countrySlug, usd, quantity: 1 });
    set({ items });
    persist(items);
    return items;
  },

  remove(productCode) {
    const items = get().items.filter((i) => i.productCode !== productCode);
    set({ items });
    persist(items);
  },

  /** Called once the order exists — the selection has become an order. */
  reset() {
    set({ items: [] });
    persist([]);
  },
}));

export function cartIsEmpty(items) {
  return !Array.isArray(items) || items.length === 0;
}

/**
 * One per line today, since `quantity` is invariantly 1. Still written as a sum rather
 * than `items.length` because `quantity` is what the order request sends, so this and
 * the total below stay the same arithmetic the server will do.
 */
export function totalUnits(items) {
  return (items || []).reduce((sum, i) => sum + i.quantity, 0);
}

export function subtotalUsd(items) {
  return (items || []).reduce((sum, i) => sum + i.usd * i.quantity, 0);
}

