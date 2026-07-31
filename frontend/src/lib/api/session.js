import { api, ensureCsrfToken } from "./client";
import { clearCartToken } from "./cart-token";

/**
 * Session auth (API.md §6.8). Django session cookie + CSRF — no tokens are stored
 * anywhere the browser can read, which is why there is no "getToken" here.
 *
 * Rate limit: login / register / password-reset are 10/min.
 */

export function register({ email, password, firstName, lastName }) {
  return api.post("/auth/register/", {
    email,
    password,
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
  });
}

export function login({ email, password }) {
  return api.post("/auth/login/", { email, password });
}

/** Also drops the guest cart token so the next visitor starts clean. */
export async function logout() {
  await api.post("/auth/logout/");
  clearCartToken();
}

export function fetchMe(options) {
  return api.get("/account/me/", options);
}

export function updateMe({ firstName, lastName, preferredCurrency }) {
  return api.patch("/account/me/", {
    ...(firstName !== undefined ? { first_name: firstName } : {}),
    ...(lastName !== undefined ? { last_name: lastName } : {}),
    ...(preferredCurrency !== undefined ? { preferred_currency: preferredCurrency } : {}),
  });
}

/** Always resolves 200, even for unknown addresses — no account enumeration. */
export function requestPasswordReset(email) {
  return api.post("/auth/password-reset/", { email });
}

export function confirmPasswordReset({ uid, token, newPassword }) {
  return api.post("/auth/password-reset/confirm/", { uid, token, new_password: newPassword });
}

/**
 * Google sign-in is a full-page redirect through allauth, not a fetch — the OAuth
 * dance needs real navigation. Must be `localhost`, not `127.0.0.1`, or Google
 * rejects the callback (guide §6). Returns to FRONTEND_BASE_URL/account.
 */
export const GOOGLE_LOGIN_PATH = "/accounts/google/login/";

/** null when signed out — a 403 here is the normal anonymous case, not a failure. */
export async function fetchMeOrNull(options) {
  try {
    return await fetchMe(options);
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) return null;
    throw error;
  }
}
