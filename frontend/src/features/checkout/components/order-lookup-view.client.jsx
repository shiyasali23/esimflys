"use client";
import { useState } from "react";
import { Search, AlertCircle, Mail } from "lucide-react";
import { lookupOrder, isDelivered } from "@/lib/api/orders";
import { fieldErrors } from "@/lib/api/errors";
import { QrCode } from "@/components/media/qr-code.client";
import { Money } from "@/components/currency/money";
import { Container } from "@/components/ui/container";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Guest order retrieval — the only route by which someone without an account can
 * reach their own eSIM. A wrong email returns 404 exactly like an unknown order
 * number, so the message here must not distinguish the two. Rate limited 10/min.
 */
export function OrderLookupView() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setNotice(null);

    const nextErrors = {};
    if (!orderNumber.trim()) nextErrors.order_number = "Enter your order number.";
    if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = "Enter the email used at checkout.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setLoading(true);
    try {
      setResult(await lookupOrder({ orderNumber: orderNumber.trim(), email: email.trim() }));
    } catch (error) {
      setResult(null);
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else if (error?.status === 404) {
        setNotice("We couldn't find an order with that number and email. Check both and try again.");
      } else if (error?.status === 429) {
        setNotice("Too many attempts. Please wait a minute and try again.");
      } else {
        setNotice(error?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const order = result?.order || null;
  const esims = result?.esims || [];

  return (
    <Container className="max-w-2xl py-12">
      <h1 className="mb-2 font-display text-headline-lg uppercase text-foreground">Find my order</h1>
      <p className="mb-8 text-body-md text-muted-foreground">
        Enter your order number and the email you used at checkout to see your eSIM and its
        activation QR code.
      </p>

      {/* noValidate: this form validates both fields itself and reports failures
          through aria-invalid + aria-describedby. Left to the browser, a bad email
          raises a native tooltip that pre-empts those messages and is announced
          inconsistently across screen readers. */}
      <form onSubmit={submit} noValidate className="rounded-lg border border-border bg-white p-8">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">Order number</span>
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="ESF-XXXXXXXXXXXX"
              autoComplete="off"
              aria-invalid={errors.order_number ? "true" : undefined}
              aria-describedby={errors.order_number ? "order-number-error" : undefined}
              className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
            />
            {errors.order_number ? (
              <span id="order-number-error" role="alert" className="mt-1 block text-body-sm text-destructive">
                {errors.order_number}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-label-bold text-foreground">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
            />
            {errors.email ? (
              <span id="email-error" role="alert" className="mt-1 block text-body-sm text-destructive">
                {errors.email}
              </span>
            ) : null}
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-4 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
        >
          <Search size={18} aria-hidden /> {loading ? "Looking up…" : "Find my order"}
        </button>

        {notice ? (
          <p role="alert" className="mt-4 flex items-start gap-2 text-body-sm text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            {notice}
          </p>
        ) : null}
      </form>

      {order ? (
        <div className="mt-8 rounded-lg border border-border bg-white p-8">
          <h2 className="font-display text-headline-md text-foreground">{order.order_number}</h2>
          <p className="mt-1 text-body-sm text-muted-foreground">
            <Money minor={order.total_minor} currency={order.currency} /> · {order.payment_status} ·{" "}
            {order.fulfillment_status}
          </p>

          {esims.length ? (
            <ul className="mt-6 space-y-6">
              {esims.map((esim, index) => (
                <li key={esim.credentials?.iccid || index} className="border-t border-border pt-6">
                  <p className="mb-3 font-display text-headline-md text-foreground">
                    {esim.product_name}
                  </p>
                  {esim.credentials ? (
                    <>
                      <QrCode payload={esim.credentials.qr_payload} />
                      <dl className="mt-4 space-y-2 text-body-sm">
                        <div>
                          <dt className="text-muted-foreground">SM-DP+ address</dt>
                          <dd className="break-all font-medium text-foreground">
                            {esim.credentials.smdp_address}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Activation code</dt>
                          <dd className="break-all font-medium text-foreground">
                            {esim.credentials.activation_code}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p className="text-body-sm text-muted-foreground">
                      This eSIM is still being prepared ({esim.status}). Check back shortly.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-body-sm text-muted-foreground">
              {isDelivered(order)
                ? "No eSIM details are attached to this order."
                : "Your eSIM is still being prepared. Check back in a moment."}
            </p>
          )}

          <p className="mt-6 text-body-sm text-muted-foreground">
            <Mail size={14} className="inline" aria-hidden /> These details were also emailed to you.
          </p>
        </div>
      ) : null}
    </Container>
  );
}
