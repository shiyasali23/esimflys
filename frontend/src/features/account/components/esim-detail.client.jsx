"use client";
import { useEffect, useState } from "react";
import { EsimInstall } from "@/features/esims/components/esim-install.client";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { getEsim, refreshEsimUsage, isEsimPending, isEsimReady } from "@/lib/api/esims";
import { useSession } from "@/features/auth/use-session.client";
import { ErrorState } from "@/components/feedback/error-state";
import { formatBytes, usageRatio } from "@/lib/format/units";
import { TopupPanel } from "./topup-panel.client";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

/**
 * A single eSIM, including its activation credentials — this detail endpoint is
 * the only one that returns them, and only to the owner. A wrong or foreign id
 * returns 404 rather than 403, so we render a plain not-found either way.
 *
 * Usage refresh is rate limited to 20/min.
 */
export function EsimDetail({ esimId }) {
  const user = useSession((s) => s.user);
  const loadSession = useSession((s) => s.load);
  const sessionError = useSession((s) => s.error);
  const retrySession = useSession((s) => s.retry);
  const [esim, setEsim] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState(null);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (user === undefined || user === null) return;
    let active = true;
    getEsim(esimId)
      .then((data) => active && setEsim(data))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [user, esimId]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      await refreshEsimUsage(esimId);
      setEsim(await getEsim(esimId));
    } catch (err) {
      setRefreshNote(
        err?.status === 429
          ? "Usage was refreshed very recently. Try again shortly."
          : err?.message || "Couldn't refresh usage.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (user === null) {
    return (
      <Container className="py-16">
        <EmptyState
          title="Sign in to view this eSIM"
          body="Activation details are only shown to the account that bought them."
          action={{ label: "Sign in", href: routes.signin() }}
        />
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-16">
        <EmptyState
          title="eSIM not found"
          body="We couldn't find that eSIM on your account."
          action={{ label: "Back to my eSIMs", href: routes.accountEsims() }}
        />
      </Container>
    );
  }

  /**
   * A session that could not be verified is NOT a signed-out session. The store only
   * sets `user = null` when the server said 401/403; any other failure leaves it
   * `undefined`, which used to render the loading skeleton forever — no message, no
   * retry, nothing to act on. Same treatment as `admin-shell`.
   */
  if (sessionError) {
    return (
      <ErrorState
        error={sessionError}
        title="We couldn't verify your session"
        onRetry={retrySession}
      />
    );
  }

  if (!esim) {
    return (
      <Container className="py-16">
        <div className="mx-auto h-72 max-w-3xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  const pending = isEsimPending(esim);
  const ratio = usageRatio(esim.remaining_data_bytes, esim.total_data_bytes);
  const credentials = esim.credentials;

  return (
    <Container className="max-w-3xl py-12">
      <Link
        href={routes.accountEsims()}
        className="mb-6 inline-flex items-center gap-1.5 text-label-bold text-primary hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> My eSIMs
      </Link>

      <h1 className="font-display text-headline-lg uppercase text-foreground">{esim.product_name}</h1>
      <p className="mt-2 text-body-md text-muted-foreground">
        {esim.country_name} · {esim.validity_days} days · {esim.status}
      </p>

      {ratio !== null ? (
        <div className="mt-8 rounded-card border border-border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-headline-md text-foreground">Data remaining</h2>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-label-bold text-foreground hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <p className="mt-3 font-display text-headline-lg text-primary" aria-live="polite">
            {formatBytes(esim.remaining_data_bytes)}
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Data remaining"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            of {formatBytes(esim.total_data_bytes)}
            {esim.last_synced_at ? ` · synced ${new Date(esim.last_synced_at).toLocaleString()}` : ""}
          </p>
          {refreshNote ? (
            <p role="alert" className="mt-2 text-body-sm text-destructive">{refreshNote}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 rounded-card border border-border bg-white p-6 text-center">
        <h2 className="mb-4 font-display text-headline-md text-foreground">Activation</h2>
        {credentials ? (
          <>
            <EsimInstall credentials={credentials} showIccid />
          </>
        ) : (
          <p className="py-8 text-body-md text-muted-foreground" aria-busy={pending}>
            {pending
              ? "Your eSIM is still being prepared. This page updates once it's ready."
              : "No activation details are available for this eSIM."}
          </p>
        )}
      </div>

      <TopupPanel esimId={esimId} esimReady={isEsimReady(esim)} />
    </Container>
  );
}
