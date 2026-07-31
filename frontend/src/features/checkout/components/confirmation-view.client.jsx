"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, QrCode as QrIcon, Mail, Clock, AlertCircle } from "lucide-react";
import { pollOrderUntilDelivered, isPaid, isDelivered, isTerminalFailure } from "@/lib/api/orders";
import { listEsims, getEsim } from "@/lib/api/esims";
import { readOrderContext } from "@/features/checkout/order-context";
import { forgetCart } from "@/lib/api/cart";
import { fromMinor } from "@/lib/format/units";
import { QrCode } from "@/components/media/qr-code.client";
import { Price } from "@/components/currency/price";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

const INSTALL_STEPS = [
  "Keep this page open, or use the details below.",
  "Open Settings → Cellular / Mobile Data → Add eSIM.",
  "Scan the QR code, or enter the SM-DP+ address and activation code by hand.",
  "Turn on the eSIM line when you land at your destination.",
];

/**
 * Order confirmation, driven entirely by the server.
 *
 * The order number and payment state are read from the API — never generated
 * here — because a locally invented confirmation would tell a customer they had
 * paid when they had not. We poll until the payment provider settles the order
 * and the worker has provisioned the profile, then render the real activation QR.
 *
 * Guests poll `/orders/lookup/`; `GET /orders/{id}/` returns 403 for them.
 */
export function ConfirmationView() {
  const [context, setContext] = useState(undefined);
  const [order, setOrder] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState(null);

  // No "already started" ref guard here: StrictMode runs the effect, aborts it via
  // cleanup, then runs it again — a guard would block that second run and leave the
  // poll permanently cancelled after a single request. The AbortController is the
  // only thing that should stop it.
  useEffect(() => {
    const ctx = readOrderContext();
    setContext(ctx);
    if (!ctx) return;

    // The cart was consumed server-side when the order was created.
    forgetCart();

    const controller = new AbortController();

    (async () => {
      try {
        const result = await pollOrderUntilDelivered({
          orderId: ctx.orderId,
          orderNumber: ctx.email ? ctx.orderNumber : undefined,
          email: ctx.email || undefined,
          signal: controller.signal,
          onUpdate: (o) => setOrder(o),
        });

        setOrder(result.order);
        setTimedOut(result.timedOut);

        const guestCreds = result.esims?.find((e) => e.credentials)?.credentials;
        if (guestCreds) {
          setCredentials(guestCreds);
          return;
        }

        // Account holders: the order poll carries no credentials, so resolve the
        // provisioned profile separately.
        if (isDelivered(result.order)) {
          const { results } = await listEsims();
          const mine = results.find((e) => e.order_number === result.order?.order_number) || results[0];
          if (mine) {
            const detail = await getEsim(mine.id);
            setCredentials(detail?.credentials || null);
          }
        }
      } catch (err) {
        if (err?.name !== "AbortError") setError(err?.message || "We couldn't confirm your order.");
      }
    })();

    return () => controller.abort();
  }, []);

  if (context === undefined) {
    return (
      <Container className="py-12">
        <div className="mx-auto h-72 max-w-3xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  if (!context) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={QrIcon}
          title="No recent order"
          body="We don't have an order in this browser session. If you've already bought an eSIM, look it up with your order number and email."
          action={{ label: "Find my order", href: routes.orderLookup() }}
        />
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={AlertCircle}
          title="We couldn't confirm your order"
          body={error}
          action={{ label: "Find my order", href: routes.orderLookup() }}
        />
      </Container>
    );
  }

  const paid = isPaid(order);
  const delivered = isDelivered(order);
  const failed = isTerminalFailure(order);
  const orderNumber = order?.order_number || context.orderNumber;

  return (
    <Container className="max-w-3xl py-12">
      <div className="mb-8 text-center">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            delivered
              ? "bg-success-text/10 text-success-text"
              : failed
                ? "bg-destructive/10 text-destructive-text"
                : "bg-primary/10 text-primary"
          }`}
        >
          {delivered ? (
            <CheckCircle2 size={36} aria-hidden />
          ) : failed ? (
            <AlertCircle size={36} aria-hidden />
          ) : (
            <Clock size={36} aria-hidden />
          )}
        </div>
        <h1 className="mb-2 font-display text-headline-lg uppercase text-foreground">
          {delivered ? "Your eSIM is ready" : failed ? "Order needs attention" : "Order received"}
        </h1>
        <p className="text-body-md text-muted-foreground" aria-live="polite">
          Order <span className="font-semibold text-foreground">{orderNumber}</span>
          {order?.total_minor != null ? (
            <>
              {" · "}
              <Price usd={fromMinor(order.total_minor)} />
            </>
          ) : null}
        </p>
        <p className="mt-2 text-body-sm text-muted-foreground" aria-live="polite">
          {failed
            ? "This order didn't complete. No eSIM has been issued."
            : !paid
              ? "Waiting for your payment to be confirmed…"
              : !delivered
                ? "Payment confirmed. Preparing your eSIM…"
                : "Payment confirmed and your profile is provisioned."}
        </p>
      </div>

      {timedOut && !delivered && !failed ? (
        <div className="mb-8 rounded-lg border border-border bg-muted p-6 text-center">
          <p className="text-body-md text-foreground">
            This is taking longer than usual. Your order is safe — it will finish processing on its
            own.
          </p>
          <Link
            href={routes.orderLookup()}
            className="mt-3 inline-block text-label-bold text-primary hover:underline"
          >
            Check it with your order number →
          </Link>
        </div>
      ) : null}

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-8 text-center">
          <h2 className="mb-4 font-display text-headline-md text-foreground">Your eSIM QR</h2>
          {credentials ? (
            <>
              <QrCode payload={credentials.qr_payload} />
              <dl className="mt-4 space-y-2 text-left text-body-sm">
                <div>
                  <dt className="text-muted-foreground">SM-DP+ address</dt>
                  <dd className="break-all font-medium text-foreground">
                    {credentials.smdp_address}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Activation code</dt>
                  <dd className="break-all font-medium text-foreground">
                    {credentials.activation_code}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-body-sm text-muted-foreground">
                <Mail size={14} className="inline" aria-hidden /> Also sent to your email.
              </p>
            </>
          ) : (
            <div
              className="flex h-48 items-center justify-center rounded-md bg-muted text-body-sm text-muted-foreground"
              aria-busy={!failed}
            >
              {failed
                ? "No eSIM was issued for this order."
                : "Your QR code appears here once the order is paid and provisioned."}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-white p-8">
          <h2 className="mb-4 font-display text-headline-md text-foreground">Install in 4 steps</h2>
          <ol className="space-y-3">
            {INSTALL_STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 text-body-md text-foreground">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-label-caps text-on-primary">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link href={routes.destinations()} className="text-label-bold text-primary hover:underline">
          Browse more destinations →
        </Link>
      </div>
    </Container>
  );
}
