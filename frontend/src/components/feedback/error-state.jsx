"use client";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * Failure state for a panel or table.
 *
 * Renders the backend's own `error.message` — never a raw object or stack. The
 * fallback string exists because a network failure has no server message, and
 * "[object Object]" on screen is the exact outcome this component prevents.
 */
export function ErrorState({ error, title = "Something went wrong", onRetry }) {
  const message =
    (typeof error === "string" ? error : error?.message) ||
    "Please try again in a moment.";

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-md border border-border bg-white px-6 py-12 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive-text">
        <AlertCircle size={24} aria-hidden />
      </div>
      <h2 className="mb-2 font-display text-headline-md text-foreground">{title}</h2>
      <p className="mb-6 max-w-md text-body-md text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted"
        >
          <RefreshCw size={16} aria-hidden /> Try again
        </button>
      ) : null}
    </div>
  );
}
