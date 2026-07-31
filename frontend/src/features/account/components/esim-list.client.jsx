"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, RefreshCw } from "lucide-react";
import { listEsims, isEsimPending } from "@/lib/api/esims";
import { useSession } from "@/features/auth/use-session.client";
import { formatBytes, usageRatio } from "@/lib/format/units";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { routes } from "@/config/routes";

/**
 * The customer's provisioned eSIMs.
 *
 * The list endpoint deliberately carries no activation credentials — those live
 * only on the detail route — so nothing secret is rendered here. Usage arrives in
 * BYTES, unlike plan allowances, which are MB.
 */
export function EsimList() {
  const user = useSession((s) => s.user);
  const loadSession = useSession((s) => s.load);
  const [esims, setEsims] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      setEsims([]);
      return;
    }
    let active = true;
    listEsims()
      .then(({ results }) => active && setEsims(results))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [user]);

  const anyPending = Array.isArray(esims) && esims.some(isEsimPending);

  // A profile provisions asynchronously; re-read until the worker finishes.
  useEffect(() => {
    if (!anyPending) return;
    const timer = setInterval(() => {
      listEsims()
        .then(({ results }) => setEsims(results))
        .catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
  }, [anyPending]);

  // Heading rendered in every state, and the placeholder shaped like the real
  // cards, so resolving the session doesn't shift the page (CLS).
  if (user === undefined || (user && esims === null && !error)) {
    return (
      <Container className="py-12">
        <h1 className="mb-8 font-display text-headline-lg uppercase text-foreground">My eSIMs</h1>
        {/*
          One placeholder at the measured card height (154px), not several: the row
          count is unknowable before the response, so reserving space for three and
          rendering one collapses the page and shifts everything below it. Growing
          downward from one only moves the footer.
        */}
        <div aria-busy="true">
          <div className="h-[154px] animate-pulse rounded-card bg-muted" />
        </div>
      </Container>
    );
  }

  if (user === null) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={Smartphone}
          title="Sign in to see your eSIMs"
          body="Your purchased eSIMs are tied to your account. Bought as a guest? Look the order up with your order number and email."
          action={{ label: "Sign in", href: routes.signin() }}
        />
        <p className="mt-6 text-center text-body-sm text-muted-foreground">
          <Link href={routes.orderLookup()} className="text-primary hover:underline">
            Find a guest order instead →
          </Link>
        </p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-16">
        <ErrorState
          error={error}
          title="We couldn't load your eSIMs"
          onRetry={() => {
            setError(null);
            setEsims(null);
            listEsims()
              .then(({ results }) => setEsims(results))
              .catch(setError);
          }}
        />
      </Container>
    );
  }

  if (!esims.length) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={Smartphone}
          title="No eSIMs yet"
          body="When you buy a plan it appears here, with its QR code and remaining data."
          action={{ label: "Browse plans", href: routes.destinations() }}
        />
      </Container>
    );
  }

  return (
    <Container className="py-12">
      <h1 className="mb-8 font-display text-headline-lg uppercase text-foreground">My eSIMs</h1>
      <ul className="space-y-4">
        {esims.map((esim) => {
          const pending = isEsimPending(esim);
          const ratio = usageRatio(esim.remaining_data_bytes, esim.total_data_bytes);
          return (
            <li key={esim.id}>
              <Link
                href={routes.accountEsim(esim.id)}
                className="block rounded-card border border-border bg-white p-6 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-headline-md text-foreground">
                      {esim.product_name}
                    </p>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      {esim.country_name} · {esim.validity_days} days
                      {esim.iccid_last4 ? ` · ICCID ••••${esim.iccid_last4}` : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-caps uppercase ${
                      pending
                        ? "bg-muted text-muted-foreground"
                        : "bg-success-text/10 text-success-text"
                    }`}
                  >
                    {pending ? <RefreshCw size={12} className="animate-spin" aria-hidden /> : null}
                    {esim.status}
                  </span>
                </div>

                {ratio !== null ? (
                  <div className="mt-4">
                    <div className="flex justify-between text-body-sm text-muted-foreground">
                      <span>{formatBytes(esim.remaining_data_bytes)} remaining</span>
                      <span>of {formatBytes(esim.total_data_bytes)}</span>
                    </div>
                    <div
                      className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={Math.round(ratio * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Data remaining on ${esim.product_name}`}
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
