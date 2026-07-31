"use client";
import { create } from "zustand";
import { fetchMe, logout as logoutRequest } from "@/lib/api/session";

/**
 * The signed-in account, read from `/account/me/`.
 *
 * There is no token to hold: auth is an HttpOnly session cookie the browser sends
 * on its own, so "am I signed in?" can only be answered by asking the server.
 *
 *   user === undefined  — not determined yet
 *   user === null       — definitively signed out (the server said 401/403)
 *   error !== null      — the probe failed for another reason; state is UNKNOWN
 *
 * That third case matters. Treating any failure as "signed out" means one blip
 * from the backend latches the whole UI into a signed-out state — sign-in prompts
 * on top of a perfectly valid session, with nothing to retry. Only an auth
 * response may set `null`.
 */
let inFlight = null;

export const useSession = create((set, get) => ({
  user: undefined,
  error: null,
  loading: false,

  async load({ force = false } = {}) {
    if (!force && get().user !== undefined) return get().user;
    if (!force && inFlight) return inFlight;

    set({ loading: true });
    inFlight = fetchMe()
      .then((user) => {
        set({ user, error: null, loading: false });
        return user;
      })
      .catch((error) => {
        // Only the server saying "not you" means signed out.
        if (error?.status === 401 || error?.status === 403) {
          set({ user: null, error: null, loading: false });
          return null;
        }
        set({ error, loading: false });
        return undefined;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  retry() {
    set({ error: null });
    return get().load({ force: true });
  },

  setUser(user) {
    set({ user, error: null, loading: false });
  },

  async signOut() {
    try {
      await logoutRequest();
    } finally {
      set({ user: null, error: null, loading: false });
    }
  },
}));
