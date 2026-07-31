/**
 * Every backend failure arrives as `{"error": {code, message, fields}}` (API.md §5,
 * ADMIN_API.md §6). This is the single place that shape becomes something the UI can
 * render — nothing else should read `.error` off a response body.
 */

export const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

export class ApiError extends Error {
  constructor({ code, message, fields, status }) {
    super(message || GENERIC_MESSAGE);
    this.name = "ApiError";
    this.code = code || "unknown_error";
    this.fields = fields && typeof fields === "object" ? fields : {};
    this.status = typeof status === "number" ? status : 0;
  }

  get isNetwork() {
    return this.code === "network_error";
  }
}

/**
 * Build an ApiError from a parsed body. Falls back through envelope → DRF `detail`
 * → status text, so an HTML error page or an empty body still yields a real sentence
 * rather than "[object Object]".
 */
export function toApiError(body, status, statusText) {
  const envelope = body && typeof body === "object" ? body.error : null;

  if (envelope && typeof envelope === "object") {
    return new ApiError({
      code: envelope.code,
      message: typeof envelope.message === "string" ? envelope.message : GENERIC_MESSAGE,
      fields: envelope.fields,
      status,
    });
  }

  const detail = body && typeof body === "object" ? body.detail : null;

  return new ApiError({
    code: codeForStatus(status),
    message: typeof detail === "string" ? detail : statusText || GENERIC_MESSAGE,
    status,
  });
}

export function networkError(cause) {
  const error = new ApiError({ code: "network_error", message: NETWORK_MESSAGE, status: 0 });
  error.cause = cause;
  return error;
}

function codeForStatus(status) {
  if (status === 400) return "validation_error";
  if (status === 401) return "authentication_required";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";
  return "unknown_error";
}

/**
 * What the UI should DO about an error, independent of what it says.
 *
 * `permission_denied` maps to "login" deliberately: the backend returns 403
 * `permission_denied` for unauthenticated requests — it never emits the
 * `authentication_required` code that API.md §5 documents. Verified against the
 * running server on `GET /esims/` and `GET /orders/{id}/`.
 *
 * @returns {"form"|"login"|"not-found"|"refresh-catalogue"|"new-cart"|"go-confirmation"|"back-off"|"retry"|"message"}
 */
export function actionForError(error) {
  switch (error?.code) {
    case "validation_error":
      return "form";
    case "authentication_required":
    case "permission_denied":
    case "invalid_credentials":
      return "login";
    case "not_found":
      return "not-found";
    case "plan_unavailable":
      return "refresh-catalogue";
    case "cart_expired":
      return "new-cart";
    case "payment_already_completed":
      return "go-confirmation";
    case "rate_limited":
      return "back-off";
    case "network_error":
    case "internal_error":
      return "retry";
    default:
      return "message";
  }
}

/** Flatten `fields` into `{name: "first message"}` for react-hook-form setError. */
export function fieldErrors(error) {
  const out = {};
  for (const [name, value] of Object.entries(error?.fields || {})) {
    const message = Array.isArray(value) ? value[0] : value;
    if (typeof message === "string") out[name] = message;
  }
  return out;
}

