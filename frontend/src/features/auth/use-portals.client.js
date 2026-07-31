"use client";
import { create } from "zustand";
import { fetchMyOrganizations } from "@/lib/api/agency";
import { fetchAdminDashboard } from "@/lib/api/admin";

/**
 * Which internal portals the signed-in user can actually reach.
 *
 * Neither can be inferred from the account payload: agency access depends on a
 * membership, and `is_staff` alone grants nothing on the admin API — that needs a
 * platform role group. So both are probed, and a link is only ever shown once the
 * server has said yes. A 403 here is a normal answer, not an error.
 *
 * Probed once per session and shared, so the header doesn't re-ask on every
 * navigation.
 */
let inFlight = null;

export const usePortals = create((set, get) => ({
  organizations: undefined,
  isAdmin: undefined,

  async load() {
    if (get().organizations !== undefined) return;
    if (inFlight) return inFlight;

    inFlight = Promise.allSettled([fetchMyOrganizations(), fetchAdminDashboard()])
      .then(([orgs, admin]) => {
        set({
          organizations: orgs.status === "fulfilled" ? orgs.value : [],
          isAdmin: admin.status === "fulfilled",
        });
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  reset() {
    set({ organizations: undefined, isAdmin: undefined });
  },
}));
