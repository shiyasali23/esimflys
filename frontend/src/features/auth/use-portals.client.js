"use client";
import { create } from "zustand";
import { fetchMyOrganizations } from "@/lib/api/agency";

/**
 * Whether the signed-in user has an agency portal to return to.
 *
 * Membership cannot be inferred from the account payload, so it is probed and the
 * link only appears once the server has said yes. A 403 here is a normal answer for
 * a customer, not an error.
 *
 * There is no admin probe: the header shows no admin link, so asking the admin API
 * on every signed-in page load would be an authenticated round-trip spent deciding
 * something nobody renders.
 *
 * Probed once per session and shared, so the header doesn't re-ask on every
 * navigation.
 */
let inFlight = null;

export const usePortals = create((set, get) => ({
  organizations: undefined,

  async load() {
    if (get().organizations !== undefined) return;
    if (inFlight) return inFlight;

    inFlight = fetchMyOrganizations()
      .then((orgs) => set({ organizations: orgs }))
      .catch(() => set({ organizations: [] }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  reset() {
    set({ organizations: undefined });
  },
}));
