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

const SESSION_HINT_KEY = "esimflys-session";

/**
 * A hint that this browser has signed in at some point. The session cookie itself is
 * HttpOnly and unreadable, so without a hint the only way to ask "is anyone signed
 * in?" is to call `/account/me/` — which answers 403 for a visitor who never was, and
 * every 403 is a console error Chrome logs against the page.
 *
 * The hint is not a credential and grants nothing: it only decides whether asking the
 * server is worth a round-trip. The server remains the sole authority on identity.
 */
export function hasSessionHint() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    // Safari private mode throws on localStorage. Probe rather than lock anyone out.
    return true;
  }
}

function setSessionHint(signedIn) {
  if (typeof window === "undefined") return;
  try {
    if (signedIn) window.localStorage.setItem(SESSION_HINT_KEY, "1");
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Non-fatal: the hint is an optimisation, not state anything depends on.
  }
}

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
        setSessionHint(Boolean(user));
        set({ user, error: null, loading: false });
        return user;
      })
      .catch((error) => {
        // Only the server saying "not you" means signed out.
        if (error?.status === 401 || error?.status === 403) {
          setSessionHint(false);
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
    setSessionHint(Boolean(user));
    set({ user, error: null, loading: false });
  },

  async signOut() {
    try {
      await logoutRequest();
    } finally {
      setSessionHint(false);
      set({ user: null, error: null, loading: false });
    }
  },
}));
