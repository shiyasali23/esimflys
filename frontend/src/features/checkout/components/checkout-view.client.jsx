"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { useCart, cartIsEmpty } from "@/features/cart/use-cart.client";
import { previewPromoCode } from "@/lib/api/cart";
import { checkout } from "@/lib/api/orders";
import { fetchMeOrNull, GOOGLE_LOGIN_PATH } from "@/lib/api/session";
import { fieldErrors } from "@/lib/api/errors";
import { saveOrderContext } from "@/features/checkout/order-context";
import { Money } from "@/components/currency/money";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checkout against the live cart. The server reprices every plan when the order
 * is created, so the totals here are indicative and the order response is what
 * we carry forward — never a locally computed figure.
 */
export function CheckoutView() {
  const router = useRouter();
  const { cart, loading, refresh, setQuantity, remove, pendingItemId, reset } = useCart();
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState(null);
  const [email, setEmail] = useState("");
  const [promo, setPromo] = useState("");
  const [promoPreview, setPromoPreview] = useState(null);
  const [promoError, setPromoError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    refresh();
    fetchMeOrNull().then((me) => {
      setAccount(me);
      if (me?.email) setEmail(me.email);
    });
  }, [refresh]);

  async function applyPromo(event) {
    event.preventDefault();
    const code = promo.trim();
    if (!code) return;
    setPromoError(null);
    try {
      setPromoPreview(await previewPromoCode({ code, customerEmail: email || undefined }));
    } catch (error) {
      setPromoPreview(null);
      setPromoError(error?.message || "That code couldn't be applied.");
    }
  }

  async function placeOrder(event) {
    event.preventDefault();
    setFormErrors({});
    setSubmitError(null);

    const trimmed = email.trim();
    if (!account && !EMAIL_PATTERN.test(trimmed)) {
      setFormErrors({ customer_email: "Enter the email address for your eSIM." });
      return;
    }

    setSubmitting(true);
    try {
      // The promo preview does not persist — the code must be sent again here.
      const order = await checkout({
        customerEmail: trimmed || undefined,
        promoCode: promoPreview ? promo.trim() : undefined,
      });
      saveOrderContext({
        orderId: order.id,
        orderNumber: order.order_number,
        email: order.customer_email || trimmed,
      });
      reset();
      router.push(`${routes.payment()}?order=${encodeURIComponent(order.id)}`);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setFormErrors(fields);
      // The 50-unit cap is re-checked here, not only on add, so the cart can be
      // over the line by the time someone reaches this button. "Try again" is
      // useless advice for it — say what has to change.
      else if (error?.code === "cart_limit_exceeded") {
        setSubmitError(
          "Your cart holds more than the maximum of 50 eSIMs. Remove some to place this order.",
        );
      } else if (error?.code === "plan_unavailable") {
        setSubmitError(
          "A plan in your cart is no longer available. Review your cart and try again.",
        );
      } else setSubmitError(error?.message || "We couldn't place your order. Please try again.");
      setSubmitting(false);
    }
  }

  if (!mounted || (loading && !cart)) {
    return (
      <Container className="py-12">
        <div className="h-72 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  if (cartIsEmpty(cart)) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          body="Choose a destination and a data plan to get started."
          action={{ label: "Browse destinations", href: routes.destinations() }}
        />
      </Container>
    );
  }

  const discountMinor = promoPreview?.discount_minor ?? 0;
  const totalMinor = Math.max(0, (cart.subtotal_minor ?? 0) - discountMinor);

  return (
    <Container className="py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-headline-lg uppercase text-foreground">Secure checkout</h1>
        <span className="rounded-full border border-success-text/20 bg-success-text/10 px-3 py-1 text-label-caps uppercase text-success-text">
          Secure SSL
        </span>
      </div>

      <div className="grid items-start gap-12 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          <section className="rounded-lg border border-border bg-white p-8">
            <h2 className="mb-4 font-display text-headline-md text-foreground">Your plans</h2>
            <ul className="divide-y divide-border">
              {cart.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                  <div className="min-w-0">
                    <p className="font-display text-headline-md text-foreground">
                      {item.display_name}
                    </p>
                    <p className="text-body-sm text-muted-foreground">{item.product_code}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex items-center gap-1 rounded-full border border-border">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${item.display_name}`}
                        disabled={pendingItemId === item.id}
                        onClick={() => setQuantity(item.id, item.quantity - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-foreground disabled:opacity-50"
                      >
                        <Minus size={14} aria-hidden />
                      </button>
                      <span aria-live="polite" className="min-w-6 text-center text-body-sm tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${item.display_name}`}
                        disabled={pendingItemId === item.id}
                        onClick={() => setQuantity(item.id, item.quantity + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-foreground disabled:opacity-50"
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    </div>
                    <div className="w-20 text-right font-display text-headline-md text-primary">
                      <Money minor={item.line_total_minor} currency={cart.currency} />
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.display_name}`}
                      disabled={pendingItemId === item.id}
                      onClick={() => remove(item.id)}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href={routes.destinations()}
              className="mt-4 inline-block text-label-bold text-primary hover:underline"
            >
              Add another destination
            </Link>
          </section>

          <section className="rounded-lg border border-border bg-white p-8">
            <h2 className="mb-6 font-display text-headline-md text-foreground">1. Your identity</h2>
            {account ? (
              <p className="text-body-md text-foreground">
                Signed in as <span className="font-semibold">{account.email}</span>
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <a
                  href={GOOGLE_LOGIN_PATH}
                  className="flex items-center justify-center gap-3 rounded-md border border-border bg-muted py-4 font-semibold text-foreground hover:bg-muted"
                >
                  Continue with Google
                </a>
                <label className="block">
                  <span className="sr-only">Email address</span>
                  <input
                    type="email"
                    name="customer_email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    autoComplete="email"
                    aria-invalid={formErrors.customer_email ? "true" : undefined}
                    aria-describedby={formErrors.customer_email ? "email-error" : undefined}
                    className="w-full rounded-md border border-border bg-muted px-4 py-4 text-body-md outline-none focus:border-primary"
                  />
                </label>
              </div>
            )}
            {formErrors.customer_email ? (
              <p id="email-error" role="alert" className="mt-2 text-body-sm text-destructive">
                {formErrors.customer_email}
              </p>
            ) : null}
            {!account ? (
              <p className="mt-3 text-body-sm text-muted-foreground">
                Guest checkout — we'll email your eSIM QR code.
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-border bg-white p-8">
            <h2 className="mb-4 font-display text-headline-md text-foreground">2. Promo code</h2>
            <form onSubmit={applyPromo} className="flex gap-3">
              <label className="flex-1">
                <span className="sr-only">Promo code</span>
                <input
                  type="text"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder="Enter a code"
                  className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md uppercase outline-none focus:border-primary"
                />
              </label>
              <button
                type="submit"
                className="rounded-full border border-border px-6 py-3 text-label-bold text-foreground hover:bg-muted"
              >
                Apply
              </button>
            </form>
            {promoError ? (
              <p role="alert" className="mt-2 text-body-sm text-destructive">{promoError}</p>
            ) : null}
            {/* A `tracking` code is a travel-agency referral: the customer pays FULL
                price and the agency earns commission, so promising a saving for one
                would be a lie (contract §5.2). The preview does not say which kind a
                code is — it returns only `discount_minor` — so the copy is driven off
                the amount, which is true either way. Success styling is reserved for
                an actual reduction. */}
            {promoPreview ? (
              <button
                type="button"
                onClick={() => {
                  setPromoPreview(null);
                  setPromo("");
                  setPromoError(null);
                }}
                className="mt-2 text-body-sm text-primary underline underline-offset-2"
              >
                Remove code
              </button>
            ) : null}
            {promoPreview ? (
              discountMinor > 0 ? (
                <p className="mt-2 text-body-sm text-success-text">
                  Code applied — <Money minor={discountMinor} currency={cart.currency} /> off at checkout.
                </p>
              ) : (
                <p className="mt-2 text-body-sm text-muted-foreground">
                  Code accepted. It doesn&rsquo;t reduce this order&rsquo;s total.
                </p>
              )
            ) : null}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-span-5">
          <div className="rounded-lg border border-border bg-white p-8 shadow-sm">
            <h2 className="mb-6 font-display text-headline-md text-foreground">Order summary</h2>
            <dl className="mb-6 space-y-3 text-body-md">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal ({cart.item_count} {cart.item_count === 1 ? "eSIM" : "eSIMs"})
                </dt>
                <dd><Money minor={cart.subtotal_minor} currency={cart.currency} /></dd>
              </div>
              {discountMinor > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="text-success-text">
                    −<Money minor={discountMinor} currency={cart.currency} />
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">eSIM activation</dt>
                <dd className="font-semibold text-success-text">FREE</dd>
              </div>
              <div className="flex items-end justify-between border-t border-border pt-4">
                <dt className="font-display text-headline-md text-foreground">Total</dt>
                <dd aria-live="polite" className="font-display text-headline-md text-primary">
                  <Money minor={totalMinor} currency={cart.currency} />
                </dd>
              </div>
            </dl>
            <form onSubmit={placeOrder}>
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-4 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "Placing order…" : "Proceed to payment"}
                {submitting ? null : <ArrowRight size={20} aria-hidden />}
              </button>
            </form>
            {submitError ? (
              <p role="alert" className="mt-3 text-center text-body-sm text-destructive">
                {submitError}
              </p>
            ) : null}
            <p className="mt-3 text-center text-body-sm text-muted-foreground">
              Charged in USD. Prices shown in your currency are indicative.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
