"use client";
import { create } from "zustand";
import { fetchMyOrganizations } from "@/lib/api/agency";

/**
 * The signed-in user's agency memberships, used for tenant resolution.
 *
 * A 404 on any agency route means "not yours or doesn't exist" — the backend
 * refuses to distinguish them — so this store is what lets the UI say "you don't
 * have an agency" without ever confirming whether some other organization exists.
 *
 * Single-flight for the same reason as the session store: several screens ask at
 * once on first paint.
 */
let inFlight = null;

export const useAgency = create((set, get) => ({
  organizations: undefined,
  error: null,

  async load({ force = false } = {}) {
    if (!force && get().organizations !== undefined) return get().organizations;
    if (!force && inFlight) return inFlight;

    inFlight = fetchMyOrganizations()
      .then((organizations) => {
        set({ organizations, error: null });
        return organizations;
      })
      .catch((error) => {
        // Signed out reads as "no memberships", not a failure to render.
        set({ organizations: [], error: error?.status === 403 ? null : error });
        return [];
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  // Sign-in and sign-out both change who "my organizations" means, so the cached
  // list has to be dropped rather than reused for the next account.
  reset() {
    inFlight = null;
    set({ organizations: undefined, error: null });
  },
}));

export function findOrganization(organizations, orgId) {
  return (organizations || []).find((o) => o.id === orgId) || null;
}
