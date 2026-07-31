import { Badge } from "@/components/ui/badge";

/**
 * Maps the backend's status vocabularies onto badge tones.
 *
 * Every value below is taken from the documented state machines (API.md §6.4,
 * §6.7; ADMIN_API.md §3.3, §4.3) — order, payment, fulfilment, eSIM, organization
 * and commission all share this component. Unknown values render neutral rather
 * than throwing, because a new backend status must not break a table.
 */

const SUCCESS = new Set([
  "paid",
  "delivered",
  "fulfilled",
  "ready",
  "active",
  "installed",
  "succeeded",
  "approved",
]);

const PENDING = new Set([
  "pending",
  "pending_payment",
  "processing",
  "provisioning",
  "fulfilling",
  "partially_fulfilled",
  "partially_delivered",
  "retrying",
  "invited",
  "available",
]);

const ATTENTION = new Set([
  "failed",
  "cancelled",
  "rejected",
  "suspended",
  "closed",
  "expired",
  "manual_review",
  "disabled",
  "reversed",
  "refunded",
  "partially_refunded",
]);

export function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (SUCCESS.has(value)) return "success";
  if (ATTENTION.has(value)) return "attention";
  if (PENDING.has(value)) return "neutral";
  return "neutral";
}

const TONE_CLASS = {
  success: "bg-success-text/10 text-success-text",
  attention: "bg-destructive/10 text-destructive-text",
  neutral: "bg-muted text-muted-foreground",
};

/** Renders the raw status text — operators need the real value, not a paraphrase. */
export function StatusBadge({ status, className }) {
  if (!status) return null;
  const tone = statusTone(status);
  return (
    <Badge tone="neutral" className={`${TONE_CLASS[tone]} ${className || ""}`}>
      {String(status).replace(/_/g, " ")}
    </Badge>
  );
}
