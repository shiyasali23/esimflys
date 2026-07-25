"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Cart store — carries the selected plan from the country page into checkout
 * (blueprint §21; fixes the mockup's plan-loss bug §36.4). eSIM plans are
 * single-quantity, so the cart holds one item. Persisted to localStorage.
 *
 * item shape: { planId, countrySlug, countryName, dataLabel, validityDays, usd, isUnlimited, perDayGb }
 */
export const useCart = create(
  persist(
    (set) => ({
      item: null,
      setItem: (item) => set({ item }),
      clear: () => set({ item: null }),
    }),
    { name: "esimflys-cart" },
  ),
);
