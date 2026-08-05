"use client";
import { useState } from "react";
import { Undo2 } from "lucide-react";
import { createRefund } from "@/lib/api/admin";
import { useFocusOnReveal } from "@/lib/a11y/use-focus-on-reveal.client";
import { fromMinor, toMinor } from "@/lib/format/units";
import { Money } from "@/components/currency/money";
import { StatusBadge } from "@/components/data/status-badge";

const MAX_REASON = 500;

/**
 * Issue a refund against an order.
 *
 * Finance capability only — support receives 403. Money leaves on submit, so the
 * amounts are reviewed on a confirmation step before the request is sent.
 *
 * The server caps a refund twice: at the payment total, and per item at what that
 * item was paid. The item ceiling is known here, so it bounds the input — but the
 * amounts already refunded are NOT exposed anywhere, so the true remainder is
 * unknowable client-side. The server is the authority: over-refunding returns 409
 * `refund_limit_exceeded`, shown verbatim rather than guessed at in advance.
 *
 * A 400 nests its errors as `fields.allocations[i].amount_minor`, which the flat
 * `fieldErrors` helper cannot read — they are unpacked here by index.
 */
export function AdminRefundPanel({ order, items }) {
  const settled = (order.payments || []).some((payment) => payment.status === "succeeded");
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [issued, setIssued] = useState(null);
  const [allocationErrors, setAllocationErrors] = useState({});
  const focusConfirm = useFocusOnReveal();

  const chosen = items.filter((item) => selected[item.id] !== undefined);
  const totalMinor = chosen.reduce((sum, item) => sum + toMinor(selected[item.id], order.currency), 0);

  function toggle(item) {
    setAllocationErrors({});
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id] === undefined) next[item.id] = String(fromMinor(item.unit_amount_minor, order.currency));
      else delete next[item.id];
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setNotice(null);
    setAllocationErrors({});
    try {
      const refund = await createRefund(order.id, {
        allocations: chosen.map((item) => ({
          order_item_id: item.id,
          amount_minor: toMinor(selected[item.id], order.currency),
        })),
        reason: reason.trim(),
      });
      setIssued(refund);
      setSelected({});
      setReason("");
      setConfirming(false);
    } catch (err) {
      setConfirming(false);
      const perAllocation = err?.fields?.allocations;
      if (Array.isArray(perAllocation)) {
        const mapped = {};
        perAllocation.forEach((entry, index) => {
          const message = entry?.amount_minor?.[0] || entry?.order_item_id?.[0];
          if (message && chosen[index]) mapped[chosen[index].id] = message;
        });
        setAllocationErrors(mapped);
        if (!Object.keys(mapped).length) setNotice(err.message);
      } else if (err?.status === 403) {
        setNotice("Your role can't issue refunds. Ask finance to handle this one.");
      } else {
        // 409 refund_limit_exceeded names the real constraint — keep its wording.
        setNotice(err?.message || "That refund wasn't accepted.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-white p-6">
      <h3 className="mb-4 font-display text-headline-md text-foreground">Refund</h3>

      {issued ? (
        <p role="status" className="mb-4 rounded-md bg-success-text/10 p-3 text-body-sm text-success-text">
          Refunded <Money minor={issued.amount_minor} currency={issued.currency || order.currency} /> · <StatusBadge status={issued.status} />
        </p>
      ) : null}

      {!settled ? (
        <p className="text-body-sm text-muted-foreground">
          This order has no settled payment to refund.
        </p>
      ) : (
        <>
          <p className="mb-4 text-body-sm text-muted-foreground">
            An item can be refunded up to what was paid for it, less anything already refunded —
            which isn&rsquo;t shown here. The server checks the remainder and refuses anything above
            it.
          </p>

          {notice ? (
            <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
              {notice}
            </p>
          ) : null}

          <ul className="divide-y divide-border">
            {items.map((item) => {
              const picked = selected[item.id] !== undefined;
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => toggle(item)}
                      className="h-4 w-4 shrink-0 rounded border-border"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{item.product_name}</span>
                      <span className="block text-body-sm text-muted-foreground">
                        Paid <Money minor={item.unit_amount_minor} currency={order.currency} />
                      </span>
                    </span>
                  </label>
                  {picked ? (
                    <span className="shrink-0">
                      <label className="flex items-center gap-2">
                        <span className="text-label-bold text-foreground">Refund $</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={fromMinor(item.unit_amount_minor, order.currency)}
                          value={selected[item.id]}
                          aria-label={`Refund amount for ${item.product_name}`}
                          onChange={(e) =>
                            setSelected((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          className="w-28 rounded-md border border-border bg-muted px-3 py-2 text-body-sm outline-none focus:border-primary"
                        />
                      </label>
                      {allocationErrors[item.id] ? (
                        <span role="alert" className="mt-1 block text-body-sm text-destructive">
                          {allocationErrors[item.id]}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <label className="mt-4 block">
            <span className="mb-1 block text-label-bold text-foreground">Reason (optional)</span>
            <textarea
              rows={2}
              maxLength={MAX_REASON}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. customer could not install before travel"
              className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
            />
            <span className="mt-1 block text-body-sm text-muted-foreground">
              {reason.length}/{MAX_REASON}
            </span>
          </label>

          {confirming ? (
            <div
              ref={focusConfirm}
              tabIndex={-1}
              role="group"
              aria-labelledby="refund-confirm-question"
              className="mt-4 rounded-md border border-border bg-muted p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <p id="refund-confirm-question" className="mb-3 text-body-md text-foreground">
                Refund <strong><Money minor={totalMinor} currency={order.currency} /></strong> across {chosen.length}{" "}
                item{chosen.length === 1 ? "" : "s"}? This returns money to the customer and cannot be
                undone here.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="rounded-full bg-destructive px-5 py-2.5 text-label-bold text-destructive-foreground hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? "Refunding…" : "Confirm refund"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={!chosen.length || totalMinor < 1}
                onClick={() => {
                  setNotice(null);
                  setConfirming(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-label-bold text-foreground hover:bg-muted disabled:opacity-50"
              >
                <Undo2 size={16} aria-hidden /> Review refund
              </button>
              {chosen.length ? (
                <p className="text-body-md text-foreground">
                  Total <strong><Money minor={totalMinor} currency={order.currency} /></strong>
                </p>
              ) : (
                <p className="text-body-sm text-muted-foreground">Select at least one item.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
