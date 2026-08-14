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
 * Item shape: {productCode, displayName, countryName, countrySlug, usd, quantity}
 */
const STORAGE_KEY = "esimflys-selection";
const MAX_UNITS = 50;

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

  hydrate() {
    if (get().hydrated) return;
    set({ items: readStored(), hydrated: true });
  },

  /** Adding the same plan twice raises its quantity rather than duplicating the row. */
  add({ productCode, displayName, countryName, countrySlug, usd, quantity = 1 }) {
    const items = [...get().items];
    const existing = items.findIndex((i) => i.productCode === productCode);
    if (existing >= 0) {
      items[existing] = { ...items[existing], quantity: items[existing].quantity + quantity };
    } else {
      items.push({ productCode, displayName, countryName, countrySlug, usd, quantity });
    }
    set({ items });
    persist(items);
    return items;
  },

  setQuantity(productCode, quantity) {
    if (quantity < 1) return get().remove(productCode);
    // The server enforces this too; checking here keeps the button honest rather
    // than letting someone reach checkout and be refused.
    const capped = Math.min(quantity, MAX_UNITS);
    const items = get().items.map((i) =>
      i.productCode === productCode ? { ...i, quantity: capped } : i,
    );
    set({ items });
    persist(items);
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

export function totalUnits(items) {
  return (items || []).reduce((sum, i) => sum + i.quantity, 0);
}

export function subtotalUsd(items) {
  return (items || []).reduce((sum, i) => sum + i.usd * i.quantity, 0);
}

export { MAX_UNITS };
