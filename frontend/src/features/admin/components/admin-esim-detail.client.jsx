"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, RefreshCw } from "lucide-react";
import {
  fetchAdminEsim,
  revealEsimCredentials,
  refreshAdminEsimUsage,
} from "@/lib/api/admin";
import { formatBytes, usageRatio } from "@/lib/format/units";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";
import { useFocusOnReveal } from "@/lib/a11y/use-focus-on-reveal.client";

const when = (value) => (value ? new Date(value).toLocaleString() : "—");

/**
 * One eSIM profile, for support.
 *
 * The detail payload is the SAME shape as a list row and carries no credentials —
 * `POST …/reveal/` is the only path to them. That call needs its own capability
 * (finance cannot use it), is limited to 10 per hour, and every use is written to
 * the audit trail. So it is never fetched on load, and what it returns is held in
 * local state only while the operator is looking at it.
 *
 * The payload names the order but does not carry its id, so the order number is
 * shown as a reference rather than as a link that couldn't resolve.
 */
export function AdminEsimDetail({ esimId }) {
  const [esim, setEsim] = useState(null);
  const [error, setError] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const focusCredentials = useFocusOnReveal();

  useEffect(() => {
    let active = true;
    fetchAdminEsim(esimId)
      .then((data) => active && setEsim(data))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [esimId]);

  async function reveal() {
    setBusy("reveal");
    setNotice(null);
    try {
      const result = await revealEsimCredentials(esimId);
      setCredentials(result?.credentials || null);
    } catch (err) {
      setNotice(
        err?.status === 403
          ? "Your role can't reveal credentials."
          : err?.status === 429
            ? "Reveal limit reached (10 per hour). Try again later."
            : err?.message || "Couldn't reveal credentials.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    setNotice(null);
    try {
      await refreshAdminEsimUsage(esimId);
      setEsim(await fetchAdminEsim(esimId));
    } catch (err) {
      setNotice(err?.message || "Couldn't refresh usage.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return error.status === 404 ? (
      <EmptyState
        title="eSIM not found"
        body="No eSIM matches that reference."
        action={{ label: "Back to eSIMs", href: `${routes.admin()}/esims` }}
      />
    ) : (
      <ErrorState error={error} title="We couldn't load this eSIM" />
    );
  }

  if (!esim) {
    return (
      <div className="min-h-[22rem] space-y-3" aria-busy="true">
        <div className="h-24 animate-pulse rounded-card bg-muted" />
        <div className="h-40 animate-pulse rounded-card bg-muted" />
      </div>
    );
  }

  const ratio = usageRatio(esim.remaining_data_bytes, esim.total_data_bytes);

  return (
    <div className="space-y-6">
      <Link
        href={`${routes.admin()}/esims`}
        className="inline-flex items-center gap-1.5 text-label-bold text-primary hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> All eSIMs
      </Link>

      {notice ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-body-sm text-destructive-text">
          {notice}
        </p>
      ) : null}

      <section className="rounded-card border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-headline-md text-foreground">{esim.product_name}</h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Order {esim.order_number}
              {esim.country_iso2 ? ` · ${esim.country_iso2}` : ""}
              {esim.iccid_last4 ? ` · ICCID ••••${esim.iccid_last4}` : ""}
            </p>
          </div>
          <StatusBadge status={esim.status} />
        </div>

        {ratio === null ? (
          <p className="mt-6 border-t border-border pt-4 text-body-sm text-muted-foreground">
            No usage has been reported for this eSIM yet.
          </p>
        ) : (
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-body-md text-foreground">
                <strong>{formatBytes(esim.remaining_data_bytes)}</strong> remaining of{" "}
                {formatBytes(esim.total_data_bytes)}
              </p>
              <p className="text-body-sm text-muted-foreground">
                Last synced {when(esim.last_synced_at)}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label="Data remaining"
              aria-valuenow={Math.round(ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        )}

        <dl className="mt-6 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Issued</dt>
            <dd className="mt-1 text-body-sm text-foreground">{when(esim.created_at)}</dd>
          </div>
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Installed</dt>
            <dd className="mt-1 text-body-sm text-foreground">{when(esim.installed_at)}</dd>
          </div>
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Activated</dt>
            <dd className="mt-1 text-body-sm text-foreground">{when(esim.activated_at)}</dd>
          </div>
          <div>
            <dt className="text-label-caps uppercase text-muted-foreground">Expires</dt>
            <dd className="mt-1 text-body-sm text-foreground">{when(esim.expires_at)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={sync}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={16} aria-hidden /> {busy === "sync" ? "Syncing…" : "Sync usage"}
          </button>
          {credentials ? (
            <button
              type="button"
              onClick={() => setCredentials(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted"
            >
              <EyeOff size={16} aria-hidden /> Hide credentials
            </button>
          ) : (
            <button
              type="button"
              onClick={reveal}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Eye size={16} aria-hidden />{" "}
              {busy === "reveal" ? "Revealing…" : "Reveal credentials"}
            </button>
          )}
        </div>
        <p className="mt-3 text-body-sm text-muted-foreground">
          Revealing is audited and limited to 10 per hour. Only reveal when a customer has asked for
          help.
        </p>
      </section>

      {credentials ? (
        <section
          ref={focusCredentials}
          tabIndex={-1}
          aria-labelledby="esim-credentials-heading"
          className="rounded-card border border-border bg-white p-6 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <h3
            id="esim-credentials-heading"
            className="mb-4 font-display text-headline-md text-foreground"
          >
            Credentials
          </h3>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Credential label="ICCID" value={credentials.iccid} />
            <Credential label="SM-DP+ address" value={credentials.smdp_address} />
            <Credential label="Activation code" value={credentials.activation_code} />
            <Credential label="Short URL" value={credentials.short_url} />
            <div className="sm:col-span-2">
              <Credential label="QR payload" value={credentials.qr_payload} />
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function Credential({ label, value }) {
  return (
    <div>
      <dt className="text-label-caps uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-body-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}
