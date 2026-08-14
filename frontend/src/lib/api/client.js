import { networkError, toApiError } from "./errors";

/**
 * The single entry point to the backend. Everything the API contract demands lives
 * here so no call site can forget it: credentials on every request and CSRF on
 * unsafe ones.
 *
 * In the browser we call relative paths so the Next rewrite keeps us same-origin and
 * the session cookie is sent (see next.config.mjs). On the server there is no origin
 * to be relative to, so we address the backend directly and the caller forwards
 * cookies explicitly when the request is authenticated.
 */

const API_PREFIX = "/api/v1";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE = "csrftoken";
/** Long enough for a cold Railway container, short enough that a hang is not forever. */
const REQUEST_TIMEOUT_MS = 20_000;

const isServer = typeof window === "undefined";

function serverOrigin() {
  return process.env.BACKEND_ORIGIN || process.env.API_BASE_URL || "http://127.0.0.1:8000";
}

function resolveUrl(path) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const withPrefix = suffix.startsWith(API_PREFIX) ? suffix : `${API_PREFIX}${suffix}`;
  return isServer ? `${serverOrigin()}${withPrefix}` : withPrefix;
}

export function readCsrfToken() {
  if (isServer) return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

/** Primes the csrftoken cookie. Safe to call repeatedly; only fetches when absent. */
export async function ensureCsrfToken() {
  if (isServer) return null;
  const existing = readCsrfToken();
  if (existing) return existing;
  try {
    await fetch(resolveUrl("/auth/csrf/"), { credentials: "include" });
  } catch {
    /* surfaced by the caller's own request */
  }
  return readCsrfToken();
}

async function parseBody(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    const text = (await response.text()).trim();
    if (!text) return null;
    // A short single line ("Bad Gateway", "upstream timed out") is a real message.
    // Anything longer is a document, not a sentence — Django's technical 500 returns
    // a PLAIN-TEXT traceback when the request accepts JSON, and pasting the first
    // 200 characters of a stack dump into the UI leaks internals and tells the user
    // nothing. Drop it and let toApiError fall through to the status text.
    return !text.includes("\n") && text.length <= 200 ? { detail: text } : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} path e.g. "/catalog/countries/" (the /api/v1 prefix is added)
 * @param {{method?: string, body?: any, cookie?: string, signal?: AbortSignal,
 *          headers?: Record<string,string>}} [options]
 * @returns {Promise<any>} parsed JSON, or null for 204
 * @throws {ApiError}
 */
export async function apiFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { Accept: "application/json", ...(options.headers || {}) };

  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  if (UNSAFE_METHODS.has(method) && !isServer) {
    const csrf = (await ensureCsrfToken()) || "";
    if (csrf) headers["X-CSRFToken"] = csrf;
  }

  // Server-side authenticated calls have no ambient cookie jar — the caller forwards one.
  if (isServer && options.cookie) headers.Cookie = options.cookie;

  let response;
  try {
    response = await fetch(resolveUrl(path), {
      method,
      headers,
      credentials: "include",
      // Without a deadline a hung backend hangs the tab forever: every spinner in the
      // app waits on this one function. A caller-supplied signal still wins.
      signal: options.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Authenticated traffic must never be cached; the public catalogue opts back
      // in explicitly so country pages can stay statically generated.
      cache: options.cache || (options.next ? undefined : "no-store"),
      ...(options.next ? { next: options.next } : {}),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw networkError(cause);
  }

  const body = await parseBody(response);

  if (!response.ok) {
    const error = toApiError(body, response.status, response.statusText);
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) error.retryAfter = Number(retryAfter);
    throw error;
  }

  return body;
}

export const api = {
  get: (path, options) => apiFetch(path, { ...options, method: "GET" }),
  post: (path, body, options) => apiFetch(path, { ...options, method: "POST", body }),
  patch: (path, body, options) => apiFetch(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => apiFetch(path, { ...options, method: "DELETE" }),
};

/**
 * List endpoints are inconsistent by design: catalogue routes return a plain array,
 * orders/esims/admin return `{count, next, previous, results}` (API.md §2c).
 * Normalising here means screens never branch on it.
 */
export function toList(data) {
  if (Array.isArray(data)) {
    return { results: data, count: data.length, next: null, previous: null };
  }
  if (data && Array.isArray(data.results)) {
    return {
      results: data.results,
      count: typeof data.count === "number" ? data.count : data.results.length,
      next: data.next ?? null,
      previous: data.previous ?? null,
    };
  }
  return { results: [], count: 0, next: null, previous: null };
}
