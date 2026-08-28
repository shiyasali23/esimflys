"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { adminSearch } from "@/lib/api/admin";
import { routes } from "@/config/routes";
import { StatusBadge } from "@/components/data/status-badge";

/**
 * One box for whatever identifier the customer happened to quote.
 *
 * Support was handed an order number, or an email, or the last four of an ICCID, and had
 * to decide which tab it belonged to before they could search at all — and guessing
 * wrong looks exactly like "we have no record of you".
 *
 * Submitted rather than searched-as-you-type. Each query is three LIKEs across three
 * tables; firing that on every keystroke turns a convenience into a load problem, and
 * support is pasting an identifier here, not browsing.
 */
export function AdminSearch() {
  const [term, setTerm] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    const value = term.trim();
    if (value.length < 3) {
      setError("Enter at least three characters.");
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await adminSearch(value));
    } catch (err) {
      setError(err?.message || "That search couldn't be completed.");
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const empty =
    result && !result.orders?.length && !result.customers?.length && !result.esims?.length;

  return (
    <section>
      <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3" noValidate>
        <label className="min-w-64 flex-1">
          <span className="mb-1 block text-label-bold text-foreground">
            Order number, email, or last 4 of an ICCID
          </span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ESF-… · someone@example.com · 7510"
            className="w-full rounded-md border border-border bg-muted px-4 py-2.5 text-body-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-cta px-5 py-2.5 text-label-bold text-cta-foreground hover:brightness-110 disabled:opacity-60"
        >
          <Search size={16} aria-hidden /> {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {error}
        </p>
      ) : null}

      {empty ? (
        <p className="text-body-sm text-muted-foreground">
          Nothing matched “{result.query}”. Orders, customers and eSIMs were all checked.
        </p>
      ) : null}

      {result?.orders?.length ? (
        <div className="mb-6">
          <h3 className="mb-2 text-label-caps uppercase text-muted-foreground">Orders</h3>
          <ul className="divide-y divide-border">
            {result.orders.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={routes.adminOrder(row.id)} className="font-medium text-primary">
                  {row.order_number}
                </Link>
                <span className="text-body-sm text-muted-foreground">{row.customer_email}</span>
                <StatusBadge status={row.payment_status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.customers?.length ? (
        <div className="mb-6">
          <h3 className="mb-2 text-label-caps uppercase text-muted-foreground">Customers</h3>
          <ul className="divide-y divide-border">
            {result.customers.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={routes.adminCustomer(row.id)} className="font-medium text-primary">
                  {row.email}
                </Link>
                {row.name ? (
                  <span className="text-body-sm text-muted-foreground">{row.name}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.esims?.length ? (
        <div>
          <h3 className="mb-2 text-label-caps uppercase text-muted-foreground">eSIMs</h3>
          <ul className="divide-y divide-border">
            {result.esims.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={routes.adminEsim(row.id)} className="font-medium text-primary">
                  ICCID ••••{row.iccid_last4 || "????"}
                </Link>
                <span className="text-body-sm text-muted-foreground">{row.order_number}</span>
                <StatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
