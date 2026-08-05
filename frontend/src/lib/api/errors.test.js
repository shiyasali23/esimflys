import { describe, it, expect } from "vitest";
import {
  ApiError,
  GENERIC_MESSAGE,
  actionForError,
  fieldErrors,
  networkError,
  toApiError,
} from "@/lib/api/errors";

describe("toApiError", () => {
  it("unwraps the backend error envelope", () => {
    const error = toApiError(
      { error: { code: "promo_invalid", message: "This promo code is not valid.", fields: {} } },
      422,
      "Unprocessable Entity",
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("promo_invalid");
    expect(error.message).toBe("This promo code is not valid.");
    expect(error.status).toBe(422);
  });

  it("keeps per-field validation errors", () => {
    const error = toApiError(
      {
        error: {
          code: "validation_error",
          message: "Invalid input.",
          fields: { customer_email: ["This field is required."] },
        },
      },
      400,
    );
    expect(fieldErrors(error)).toEqual({ customer_email: "This field is required." });
  });

  it("never yields [object Object] when the body is not an envelope", () => {
    const error = toApiError({ detail: "Authentication credentials were not provided." }, 403);
    expect(error.message).toBe("Authentication credentials were not provided.");
    expect(error.code).toBe("permission_denied");
  });

  it("falls back to a readable sentence for an empty or HTML body", () => {
    const error = toApiError(null, 500, "");
    expect(error.message).toBe(GENERIC_MESSAGE);
    expect(error.code).toBe("internal_error");
    expect(String(error)).not.toContain("[object Object]");
  });
});

describe("actionForError", () => {
  // The backend returns 403 `permission_denied` for unauthenticated requests — it never
  // emits the `authentication_required` code that API.md §5 documents. Both must route
  // to login or a signed-out user silently sees a dead screen.
  it("routes permission_denied to login, matching real backend behaviour", () => {
    expect(actionForError({ code: "permission_denied" })).toBe("login");
    expect(actionForError({ code: "authentication_required" })).toBe("login");
  });

  it("maps recoverable commerce conflicts to their recovery", () => {
    expect(actionForError({ code: "plan_unavailable" })).toBe("refresh-catalogue");
    expect(actionForError({ code: "cart_expired" })).toBe("new-cart");
    expect(actionForError({ code: "payment_already_completed" })).toBe("go-confirmation");
    expect(actionForError({ code: "rate_limited" })).toBe("back-off");
    expect(actionForError({ code: "validation_error" })).toBe("form");
  });

  it("degrades unknown codes to a plain message", () => {
    expect(actionForError({ code: "something_new" })).toBe("message");
    expect(actionForError(undefined)).toBe("message");
  });
});

describe("networkError", () => {
  it("is flagged so the UI can offer retry rather than blame the user", () => {
    const error = networkError(new Error("fetch failed"));
    expect(error.isNetwork).toBe(true);
    expect(actionForError(error)).toBe("retry");
    expect(error.status).toBe(0);
  });
});

/**
 * A 500 carries `correlation_id` instead of `fields` (contract §3.2, §11). It is
 * the key to the server log — discarding it turns a five-minute lookup into an
 * unreproducible ticket.
 */
describe("correlation id on a 500", () => {
  it("is captured off the error envelope", () => {
    const error = toApiError(
      { error: { code: "internal_error", message: "Something failed.", correlation_id: "abc-123" } },
      500,
      "Internal Server Error",
    );
    expect(error.correlationId).toBe("abc-123");
    expect(error.code).toBe("internal_error");
  });

  it("is null when the server did not send one", () => {
    const error = toApiError(
      { error: { code: "validation_error", message: "Bad input.", fields: { email: ["required"] } } },
      400,
    );
    expect(error.correlationId).toBeNull();
  });

  it("is null for a non-envelope body", () => {
    expect(toApiError({ detail: "Nope." }, 404).correlationId).toBeNull();
  });

  it("survives a network error without throwing", () => {
    expect(networkError(new Error("offline")).correlationId).toBeNull();
  });
});
