"use client";
import { useEffect, useState } from "react";
import { Copy, Check, Info } from "lucide-react";
import { fetchAgencyTrackingCodes } from "@/lib/api/agency";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";

/**
 * Referral codes issued to this agency.
 *
 * Read-only: only the platform issues codes, so there is no create form. Codes
 * carry NO discount — the customer pays full price and the code exists purely to
 * attribute the sale — which the copy states plainly, because an agency handing
 * one out will otherwise assume it is a voucher.
 *
 * Plain array, not paginated.
 */
export function AgencyTrackingCodes({ orgId }) {
  const [codes, setCodes] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAgencyTrackingCodes(orgId)
      .then((result) => active && setCodes(result))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [orgId]);

  async function copy(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked — the code is visible on screen regardless */
    }
  }

  if (error) return <ErrorState error={error} title="We couldn't load your codes" />;

  if (!codes) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-muted" />
        ))}
      </div>
    );
  }

  if (!codes.length) {
    return (
      <EmptyState
        title="No tracking codes yet"
        body="The platform issues your referral codes. Contact your account manager to request one."
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex gap-3 rounded-md border border-border bg-muted p-4">
        <Info size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-body-sm text-muted-foreground">
          These codes carry <strong className="text-foreground">no discount</strong>. Customers pay
          the normal price — the code records that the sale came from you, so you earn commission.
        </p>
      </div>

      <ul className="space-y-3">
        {codes.map((code) => (
          <li
            key={code.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-white p-6"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <code className="font-display text-headline-md tracking-wide text-foreground">
                  {code.code}
                </code>
                <StatusBadge status={code.is_active ? "active" : "disabled"} />
              </div>
              <p className="mt-2 text-body-sm text-muted-foreground">
                {code.commission_type === "percentage_bps" && code.commission_value != null
                  ? `${(code.commission_value / 100).toFixed(2)}% commission`
                  : "Commission set by the platform"}
                {" · "}
                {code.redemption_count ?? 0} use{code.redemption_count === 1 ? "" : "s"}
                {code.usage_limit ? ` of ${code.usage_limit}` : ""}
                {code.ends_at ? ` · expires ${new Date(code.ends_at).toLocaleDateString()}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => copy(code.code)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted"
            >
              {copied === code.code ? (
                <>
                  <Check size={16} aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Copy size={16} aria-hidden /> Copy
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
