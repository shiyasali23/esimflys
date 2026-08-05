"use client";
import { useCallback, useEffect, useState } from "react";
import { Banknote, Plus } from "lucide-react";
import {
  fetchAdminPayouts,
  createPayout,
  markPayoutPaid,
  fetchAdminOrganizations,
} from "@/lib/api/admin";
import { fieldErrors } from "@/lib/api/errors";
import { StatusBadge } from "@/components/data/status-badge";
import { Money } from "@/components/currency/money";
import { ErrorState } from "@/components/feedback/error-state";

/**
 * Commission payouts — the last step of review → approve → group → mark paid.
 *
 * Two things this screen must not imply:
 *  - it moves no money. There is no bank integration; "mark paid" RECORDS a
 *    transfer that already happened somewhere else, which is why a reference is
 *    asked for rather than a confirmation.
 *  - it does not choose which commissions to include. The server groups every
 *    APPROVED commission for that organization inside the period and computes the
 *    total, so no amount is ever sent from here.
 *
 * The list is a PLAIN ARRAY, not a paginated envelope.
 */
export function AdminPayouts() {
  const [payouts, setPayouts] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState({});
  const [payingId, setPayingId] = useState(null);

  const load = useCallback(() => {
    setError(null);
    fetchAdminPayouts().then(setPayouts).catch(setError);
  }, []);

  useEffect(() => {
    load();
    fetchAdminOrganizations({ status: "active" })
      .then((list) => setOrgs(list.results || []))
      .catch(() => setOrgs([]));
  }, [load]);

  async function create(event) {
    event.preventDefault();
    // Captured BEFORE the first await: React nulls `currentTarget` once the
    // handler yields, so reaching for it afterwards throws and the failure gets
    // caught below — replacing the success notice with a bogus error.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setErrors({});
    setNotice(null);
    setBusy("create");
    try {
      const payout = await createPayout({
        organization: String(form.get("organization") || ""),
        periodStart: String(form.get("period_start") || ""),
        periodEnd: String(form.get("period_end") || ""),
      });
      // A period with nothing approved in it yields an empty payout, which is a
      // confusing thing to leave sitting in the list without explanation.
      setNotice(
        payout?.commission_count
          ? `Drafted a payout for ${payout.organization_name}.`
          : `Drafted a payout for ${payout.organization_name}, but no approved commissions fell in that period.`,
      );
      formEl.reset();
      load();
    } catch (err) {
      const fields = fieldErrors(err);
      if (Object.keys(fields).length) setErrors(fields);
      else setNotice(err?.message || "We couldn't draft that payout.");
    } finally {
      setBusy(null);
    }
  }

  async function pay(event, payout) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice(null);
    setBusy(payout.id);
    try {
      await markPayoutPaid(payout.id, {
        reference: String(form.get("reference") || "").trim(),
        method: String(form.get("method") || "").trim(),
      });
      setPayingId(null);
      load();
    } catch (err) {
      setNotice(err?.message || "We couldn't record that payment.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState error={error} title="We couldn't load payouts" onRetry={load} />;

  if (!payouts) {
    return (
      <div className="min-h-[22rem] space-y-3" aria-busy="true">
        <div className="h-28 animate-pulse rounded-card bg-muted" />
        <div className="h-40 animate-pulse rounded-card bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <p role="status" className="rounded-md bg-muted p-3 text-body-sm text-foreground">
          {notice}
        </p>
      ) : null}

      <section className="rounded-card border border-border bg-white p-6">
        <h2 className="mb-2 font-display text-headline-md text-foreground">Draft a payout</h2>
        <p className="mb-4 text-body-sm text-muted-foreground">
          Groups every approved commission for that agency inside the period. The total is
          calculated by the server.
        </p>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3" noValidate>
          <label className="min-w-56 flex-1">
            <span className="mb-1 block text-label-bold text-foreground">Agency</span>
            <select
              name="organization"
              required
              className="w-full rounded-md border border-border bg-white px-3 py-2.5 text-body-sm text-foreground"
            >
              <option value="">Choose an agency</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-label-bold text-foreground">Period start</span>
            <input
              type="date"
              name="period_start"
              required
              className="rounded-md border border-border bg-muted px-3 py-2.5 text-body-sm"
            />
          </label>
          <label>
            <span className="mb-1 block text-label-bold text-foreground">Period end</span>
            <input
              type="date"
              name="period_end"
              required
              className="rounded-md border border-border bg-muted px-3 py-2.5 text-body-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy === "create"}
            className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-60"
          >
            <Plus size={16} aria-hidden /> {busy === "create" ? "Drafting…" : "Draft payout"}
          </button>
        </form>
        {Object.entries(errors).map(([field, message]) => (
          <p key={field} role="alert" className="mt-2 text-body-sm text-destructive-text">
            {field}: {message}
          </p>
        ))}
      </section>

      <section className="rounded-card border border-border bg-white p-6">
        <h2 className="mb-4 font-display text-headline-md text-foreground">
          Payouts ({payouts.length})
        </h2>

        {!payouts.length ? (
          <p className="text-body-sm text-muted-foreground">
            No payouts yet. Approve some commissions, then draft a payout for the period.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {payouts.map((payout) => (
              <li key={payout.id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{payout.organization_name}</p>
                    <p className="mt-0.5 text-body-sm text-muted-foreground">
                      {payout.period_start} → {payout.period_end}
                      {` · ${payout.commission_count} commission${payout.commission_count === 1 ? "" : "s"}`}
                      {payout.external_reference ? ` · ref ${payout.external_reference}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <span className="font-display text-headline-md text-foreground">
                      <Money minor={payout.amount_minor} currency={payout.currency || "USD"} />
                    </span>
                    <StatusBadge status={payout.status} />
                    {payout.status !== "paid" && payout.status !== "cancelled" ? (
                      <button
                        type="button"
                        onClick={() => setPayingId(payingId === payout.id ? null : payout.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted"
                      >
                        <Banknote size={16} aria-hidden /> Mark paid
                      </button>
                    ) : null}
                  </div>
                </div>

                {payingId === payout.id ? (
                  <form
                    onSubmit={(e) => pay(e, payout)}
                    className="mt-4 rounded-md border border-border bg-muted p-4"
                    noValidate
                  >
                    <p className="mb-3 text-body-sm text-foreground">
                      This records a transfer you have already made elsewhere — it does not send
                      any money. The reference is what links it to your bank record.
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-48 flex-1">
                        <span className="mb-1 block text-label-bold text-foreground">Reference</span>
                        <input
                          name="reference"
                          type="text"
                          placeholder="e.g. WISE-2026-07-001"
                          className="w-full rounded-md border border-border bg-white px-4 py-2.5 text-body-sm outline-none focus:border-primary"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-label-bold text-foreground">Method</span>
                        <input
                          name="method"
                          type="text"
                          placeholder="bank_transfer"
                          className="rounded-md border border-border bg-white px-4 py-2.5 text-body-sm outline-none focus:border-primary"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={busy === payout.id}
                        className="rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-60"
                      >
                        {busy === payout.id ? "Recording…" : "Record payment"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayingId(null)}
                        className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
