"use client";
import { create } from "zustand";
import {
  addCartItem,
  getCart,
  isCartEmpty,
  removeCartItem,
  updateCartItem,
} from "@/lib/api/cart";

/**
 * Cart state mirrored from the server, which owns pricing and revalidates every
 * plan at checkout. Nothing is persisted here: the guest's `X-Cart-Token` in
 * localStorage is the continuity, and the contents are re-read from the API — so
 * a stale tab can never check out against a price that has since changed.
 *
 * Shape: {id, currency, status, items[], subtotal_minor, item_count}
 */
export const useCart = create((set, get) => ({
  cart: null,
  loading: false,
  error: null,
  pendingItemId: null,

  async refresh() {
    set({ loading: true, error: null });
    try {
      set({ cart: await getCart(), loading: false });
    } catch (error) {
      set({ error, loading: false });
    }
  },

  async add({ productCode, quantity = 1 }) {
    set({ loading: true, error: null });
    try {
      const cart = await addCartItem({ productCode, quantity });
      set({ cart, loading: false });
      return cart;
    } catch (error) {
      set({ error, loading: false });
      throw error;
    }
  },

  async setQuantity(itemId, quantity) {
    if (quantity < 1) return get().remove(itemId);
    set({ pendingItemId: itemId, error: null });
    try {
      set({ cart: await updateCartItem(itemId, quantity), pendingItemId: null });
    } catch (error) {
      set({ error, pendingItemId: null });
    }
  },

  async remove(itemId) {
    set({ pendingItemId: itemId, error: null });
    try {
      await removeCartItem(itemId);
      set({ cart: await getCart(), pendingItemId: null });
    } catch (error) {
      set({ error, pendingItemId: null });
    }
  },

  /** Local reset after checkout consumes the cart server-side. */
  reset() {
    set({ cart: null, loading: false, error: null, pendingItemId: null });
  },
}));

export function cartIsEmpty(cart) {
  return isCartEmpty(cart);
}
