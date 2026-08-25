"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight, Trash2, Tag, CheckCircle2 } from "lucide-react";
import { useCart, cartIsEmpty, subtotalUsd, totalUnits } from "@/features/cart/use-cart.client";
import { useCurrency } from "@/components/currency/use-currency.client";
import { checkoutDirect, previewPromo } from "@/lib/api/orders";
import { clearReferral, storedReferral } from "@/features/referral/use-referral.client";
import { fetchMeOrNull, logout, GOOGLE_LOGIN_PATH } from "@/lib/api/session";
import { fieldErrors } from "@/lib/api/errors";
import { saveOrderContext } from "@/features/checkout/order-context";
import { Money } from "@/components/currency/money";
import { Price } from "@/components/currency/price";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { GoogleLogo } from "@/components/media/google-logo";
import { routes } from "@/config/routes";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Lets the pinned mobile bar submit the form it sits outside of. */
const FORM_ID = "checkout-place-order";
const GUEST_KEY = "esimflys-guest";

function readGuestEmail() {
  if (typeof window === "undefined") return "";
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(GUEST_KEY) || "null");
    // Tolerates the older {firstName, lastName, email, phone} record still in a tab
    // someone left open across the change.
    if (typeof parsed === "string") return parsed;
    return typeof parsed?.email === "string" ? parsed.email : "";
  } catch {
    return "";
  }
}

function persistGuestEmail(value) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(GUEST_KEY, JSON.stringify(value));
  } catch {
    // Safari private mode throws. Checkout still works for this page.
  }
}

/**
 * Checkout straight from the local selection — one call, no server-side cart.
 *
 * The totals shown here are converted from the committed catalogue with the same rate
 * table the backend prices from, so they should match the charge to the rupee — but
 * they are still only an estimate. `POST /checkout/direct/` names WHAT is bought and
 * in WHICH currency; the server prices every line itself and the order it returns is
 * what we carry forward. Prices here therefore use `<Price usd>` (converts a catalogue
 * figure) and never `<Money minor currency>`, which is for amounts already recorded.
 *
 * Identity is a step of its own: an order needs an address to deliver the QR code to,
 * so either the shopper is signed in or they confirm guest details first. Only then
 * does the pay button do anything.
 */
export function CheckoutView() {
  const router = useRouter();
  const { items, hydrate, remove, reset } = useCart();
  /**
   * The order is created in the currency on screen, not in USD. Two reasons: a total
   * the customer never saw is not a total they agreed to, and Stripe only offers UPI
   * on an INR PaymentIntent — a USD one silently drops it from the payment sheet.
   */
  const currency = useCurrency((s) => s.currency);
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState(null);
  /** Distinct from `account === null`, which is also the answer for a guest. Without
   *  it the guest form flashes on screen before the session probe comes back. */
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestConfirmed, setGuestConfirmed] = useState(false);
  const [promo, setPromo] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  /**
   * The server's verdict on the typed code: `{code, currency, subtotal_minor,
   * discount_minor, total_minor}` or null when nothing is applied.
   *
   * Held in CHARGE-currency minor units because that is what the server priced, so it
   * renders with `<Money>`. Rendering it with `<Price>` would convert an already-converted
   * figure and show an INR shopper a total roughly 88x too large.
   */
  const [promoApplied, setPromoApplied] = useState(null);
  const [promoError, setPromoError] = useState(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const identityRef = useRef(null);
  const submitErrorRef = useRef(null);
  /**
   * One key per purchase ATTEMPT, reused on every retry of that attempt. If a response
   * is lost in flight the order still exists, and retrying with the same key returns
   * that order instead of creating a second one. Regenerating on retry would defeat
   * the whole mechanism.
   */
  const idempotencyKey = useRef(null);

  useEffect(() => {
    setMounted(true);
    hydrate();
    setGuestEmail(readGuestEmail());
    fetchMeOrNull()
      .then((me) => setAccount(me))
      /**
       * `fetchMeOrNull` only swallows 401/403 — the ordinary signed-out answers. Anything
       * else (backend down, a 500 from the proxy) still rejects, and without this the
       * page threw an unhandled rejection into the console on every load.
       *
       * Treating it as "not signed in" is the right fallback: guest checkout only needs
       * an email address, so the purchase can still be completed while accounts are
       * unreachable.
       */
      .catch(() => setAccount(null))
      .finally(() => setAccountLoaded(true));
  }, [hydrate]);

  const email = account?.email || (guestConfirmed ? guestEmail.trim() : "");
  const identityReady = Boolean(account) || guestConfirmed;

  /**
   * A changed selection, address OR currency is a different purchase. Keeping the old
   * key would make the server answer with the order the previous one created — right
   * for a retry, wrong for a basket, an email or a currency the shopper has since
   * changed.
   */
  useEffect(() => {
    idempotencyKey.current = null;
  }, [items, email, currency]);

  /*
   * A preview is priced against a specific basket in a specific currency. Change either
   * and the discount on screen no longer describes what would be charged, so it is
   * dropped rather than left to mislead — the shopper re-applies against the new basket.
   * The typed code is kept so re-applying is one tap, not a retype.
   */
  useEffect(() => {
    setPromoApplied(null);
    setPromoError(null);
  }, [items, currency]);

  /**
   * Sends focus to the problem rather than leaving an error nobody scrolled to.
   *
   * Deferred by a timeout, not requestAnimationFrame: the errors it looks for render on
   * the next commit, and rAF does not fire at all while the document is hidden — which
   * would make this silently do nothing in a background tab.
   */
  function revealIdentitySoon() {
    setTimeout(revealIdentity, 0);
  }

  /**
   * Brings the phone to the submit error, which renders in the summary card next to the
   * total. Below `lg` the button that produces it is the pinned bar's, and that bar
   * follows the viewport — so the failure was being written into a card that could be
   * most of a page away from wherever the shopper was actually looking.
   *
   * An effect keyed on a counter, NOT the `setTimeout` that `revealIdentitySoon` uses.
   * That one can afford a timeout because `identityRef` is on a section that is always
   * mounted; this ref is on the paragraph the very same state update creates, and React
   * schedules its render through the scheduler, which can land after a `setTimeout(0)`.
   * [MEASURED] the timeout version read `submitErrorRef.current === null` and scrolled
   * nowhere: window.scrollY stayed 0 with the alert at y=887 on an 844px viewport. An
   * effect runs after commit by definition, so the node is always there.
   */
  const [errorReveal, setErrorReveal] = useState(0);
  useEffect(() => {
    if (!errorReveal) return;
    const el = submitErrorRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    // Optional call: jsdom does not implement it, and neither do some older WebViews.
    el.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "center" });
  }, [errorReveal]);

  function revealIdentity() {
    const section = identityRef.current;
    if (!section) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    // Optional call: jsdom does not implement it, and neither do some older WebViews.
    section.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "center" });
    const target =
      section.querySelector("[aria-invalid='true']") || section.querySelector("input");
    // preventScroll: the smooth scroll above owns the movement; focus would jump it.
    target?.focus?.({ preventScroll: true });
  }

  /** The one thing an order cannot be delivered without. */
  function emailErrors(candidate) {
    return EMAIL_PATTERN.test(candidate.trim())
      ? {}
      : { customer_email: "Enter the email address we should send your eSIM to." };
  }

  function confirmGuest(event) {
    event.preventDefault();
    setSubmitError(null);
    const errors = emailErrors(guestEmail);
    setFormErrors(errors);
    if (Object.keys(errors).length) {
      revealIdentitySoon();
      return;
    }
    const trimmed = guestEmail.trim();
    setGuestEmail(trimmed);
    persistGuestEmail(trimmed);
    setGuestConfirmed(true);
  }

  /** Lets someone on a shared or wrong account buy under different details. */
  async function signOut() {
    try {
      await logout();
    } catch {
      // Whatever the server said, this browser is done with that session.
    }
    setAccount(null);
    revealIdentitySoon();
  }

  function editGuest() {
    setGuestConfirmed(false);
    setSubmitError(null);
    revealIdentitySoon();
  }

  /**
   * Ask the server what the code is worth before the customer commits to paying.
   *
   * Deliberately not fired on every keystroke: the endpoint is throttled on the `promo`
   * scope precisely because it answers "is this code real" to anonymous callers, and
   * typing a 10-character code would spend ten attempts of that budget.
   */
  async function applyPromo() {
    const code = promo.trim();
    if (!code) return;
    setPromoChecking(true);
    setPromoError(null);
    try {
      const preview = await previewPromo({
        items,
        promoCode: code,
        customerEmail: email || undefined,
        currency,
      });
      setPromoApplied(preview);
      setPromo(preview.code);
    } catch (err) {
      setPromoApplied(null);
      setPromoError(err?.message || "That code could not be applied.");
    } finally {
      setPromoChecking(false);
    }
  }

  function clearPromo() {
    setPromoApplied(null);
    setPromoError(null);
    setPromo("");
  }

  async function placeOrder(event) {
    event.preventDefault();
    setSubmitError(null);

    // An order with no address to deliver to is not an order. Say so where the fix is,
    // not next to a pay button three screens further down.
    if (!identityReady) {
      setFormErrors(emailErrors(guestEmail));
      setSubmitError("Tell us where to send your eSIM before paying.");
      revealIdentitySoon();
      return;
    }

    setFormErrors({});
    setSubmitting(true);
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    try {
      /*
        A typed code wins; otherwise the agency referral captured from the link is sent.
        Both travel in the same `promo_code` field because the server, not the browser,
        decides what a code means — and a tracking code is pinned to zero discount by a
        database constraint, so replaying one can attribute a sale and never discount it.

        `|| undefined` rather than `|| ""`: an empty string is a code the server would
        reject, which would fail a checkout that simply had no referral.
      */
      const order = await checkoutDirect({
        items,
        customerEmail: email,
        promoCode: promo.trim() || storedReferral() || undefined,
        currency,
        idempotencyKey: idempotencyKey.current,
      });
      saveOrderContext({
        orderId: order.id,
        orderNumber: order.order_number,
        email: order.customer_email || email,
      });
      idempotencyKey.current = null;
      // Spent. Leaving it would attribute a second, unrelated purchase to the same
      // agency weeks later, on a visit they had nothing to do with.
      clearReferral();
      reset();
      router.push(`${routes.payment()}?order=${encodeURIComponent(order.id)}`);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) {
        setFormErrors(fields);
        // A rejected email or name is fixed in the identity card, which on mobile is
        // well above the button that was just pressed.
        revealIdentitySoon();
      }
      // `cart_limit_exceeded` is the backend's wire code for the 50-unit cap
      // (verified live: "An order may contain at most 50 eSIMs."). "Try again" is
      // useless advice for it — say what has to change.
      else if (error?.code === "cart_limit_exceeded") {
        setSubmitError(
          "This order holds more than the maximum of 50 eSIMs. Remove some to place it.",
        );
      } else if (error?.code === "plan_unavailable") {
        setSubmitError(
          "A plan in this order is no longer available. Review your selection and try again.",
        );
      } else setSubmitError(error?.message || "We couldn't place your order. Please try again.");
      // Field errors already send the phone to the identity card. Everything else reports
      // into the summary card, which on a phone is nowhere near the pinned pay button.
      if (!Object.keys(fields).length) setErrorReveal((n) => n + 1);
      setSubmitting(false);
    }
  }

  if (!mounted) {
    return (
      <Container className="py-12">
        <div className="h-72 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }

  if (cartIsEmpty(items)) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={ShoppingBag}
          title="No plan selected yet"
          body="Choose a destination and a data plan to get started."
          action={{ label: "Browse destinations", href: routes.destinations() }}
        />
      </Container>
    );
  }

  // Indicative only. Any promo discount is applied by the server when the order is
  // created — there is no preview to compute one from here.
  const subtotal = subtotalUsd(items);
  const units = totalUnits(items);
  const unitLabel = units === 1 ? "eSIM" : "eSIMs";
  const accountName = [account?.first_name, account?.last_name].filter(Boolean).join(" ");



  /*
   * No `pb-44` on the Container. The footer already reserves space for the pinned bar
   * (`body:has([data-checkout-bar]) footer` in globals.css), so reserving it a second
   * time here left ~180px of empty background between the order summary and the footer
   * on every phone.
   */
  return (
    <Container className="pt-6 pb-10 lg:pb-4">
      {/*
        The badge never breaks mid-phrase, and is small enough that the heading does not
        have to either.

        [MEASURED] 390px: the row is 342px and "Secure checkout" needs 224px on one line.
        At `text-label-caps` with `px-3` the badge is 109px, which left the heading 221px
        — three pixels short, so the title wrapped to two lines to make room for a
        decorative trust mark. At 11px with `px-2.5` the badge is ~96px and the heading
        keeps its 234px. Below `sm` only; nothing changes from 640px up, where both have
        always fitted.
      */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="min-w-0 font-display text-headline-md uppercase text-foreground">Secure checkout</h1>
        <span className="shrink-0 whitespace-nowrap rounded-full border border-success-text/20 bg-success-text/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-success-text sm:px-3 sm:text-label-caps">
          Secure SSL
        </span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-4 lg:col-span-7">
          <section className="rounded-lg border border-border bg-white p-5 sm:p-6">
            <h2 className="mb-3 font-display text-headline-md text-foreground">Your plans</h2>
            <ul className="divide-y divide-border">
              {items.map((item) => (
                /*
                  Stacked below sm. Side by side, the price and bin still leave the title
                  about 170px on a 375px screen, and "Saudi Arabia · 10 GB" needs ~200px
                  at `text-headline-md` before it breaks across lines.
                */
                <li
                  key={item.productCode}
                  className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <p className="min-w-0 font-display text-headline-md text-foreground">
                    {item.countryName} · {item.displayName}
                  </p>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    {/*
                      min-width, not width. A fixed 24 (96px) was cut for "$14.99";
                      "₹1,359.00" overruns it and lands on top of the delete button.
                      The floor still keeps prices aligned across rows, and tabular
                      figures keep the digits from shifting between currencies.

                      Still `usd * quantity` rather than `usd`, even though `quantity`
                      is invariantly 1: it is the same arithmetic `subtotalUsd` does, so
                      a line can never disagree with the total it feeds.
                    */}
                    <div className="whitespace-nowrap text-right font-display text-headline-md tabular-nums text-primary sm:min-w-24">
                      <Price usd={item.usd * item.quantity} />
                    </div>
                    {/* 44px. The only control left on the row, and it empties it. */}
                    <button
                      type="button"
                      aria-label={`Remove ${item.displayName}`}
                      onClick={() => remove(item.productCode)}
                      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive-text"
                    >
                      <Trash2 size={18} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section
            ref={identityRef}
            id="identity"
            className="scroll-mt-24 rounded-lg border border-border bg-white p-5 sm:p-6"
          >
            <h2 className="mb-3 font-display text-headline-md text-foreground">Your details</h2>

            {!accountLoaded ? (
              <div className="h-28 animate-pulse rounded-md bg-muted" aria-busy="true" />
            ) : identityReady ? (
              /*
                One card for both routes in. Whether the address came from an account or
                from the box below, the only thing that matters here is where the QR code
                is going — so it says that, and offers a way to change it.
              */
              <div className="flex items-start justify-between gap-4 rounded-md border border-success-text/20 bg-success-text/5 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-text" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{email}</p>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      We'll send your eSIM QR code here.
                    </p>
                  </div>
                </div>
                {/*
                  Says what it does. "Not you?" was accurate and useless: it gave no hint
                  that behind it are the email box AND the Google button, so someone
                  signed in to the wrong account had no visible way to change it.
                */}
                <button
                  type="button"
                  onClick={account ? signOut : editGuest}
                  className="-my-2 flex min-h-11 shrink-0 items-center rounded px-1 text-label-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {account ? "Use another account" : "Change"}
                </button>
              </div>
            ) : (
              <>
                {/*
                  One field, because one field is all the order needs: the eSIM is
                  delivered by email and the backend treats name and phone as optional.
                  Every extra box here is a chance to abandon a purchase.

                  Its own form, submitted by its own button: confirming where the eSIM
                  goes and paying are separate acts, and Enter in this box must not place
                  an order.
                */}
                <form onSubmit={confirmGuest} noValidate>
                  <label className="block">
                    <span className="mb-1.5 block text-body-sm font-medium text-foreground">
                      Email address
                    </span>
                    <input
                      type="email"
                      name="customer_email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoFocus
                      aria-invalid={formErrors.customer_email ? "true" : undefined}
                      aria-describedby={
                        formErrors.customer_email ? "customer_email-error" : "email-hint"
                      }
                      className="w-full rounded-md border border-border bg-muted px-4 py-3 text-body-md outline-none focus:border-primary"
                    />
                  </label>
                  {formErrors.customer_email ? (
                    <p
                      id="customer_email-error"
                      role="alert"
                      className="mt-1.5 text-body-sm text-destructive"
                    >
                      {formErrors.customer_email}
                    </p>
                  ) : (
                    <p id="email-hint" className="mt-1.5 text-body-sm text-muted-foreground">
                      We'll send your eSIM QR code here — no account needed.
                    </p>
                  )}
                  <button
                    type="submit"
                    className="mt-4 w-full rounded-full bg-cta px-6 py-3 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110"
                  >
                    Continue
                  </button>
                </form>

                <div className="my-4 flex items-center gap-3 text-body-sm text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>

                {/* OAuth needs a full-page redirect, so this must be an anchor. */}
                <a
                  href={GOOGLE_LOGIN_PATH}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-white py-3 font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <GoogleLogo />
                  Continue with Google
                </a>

                <p className="mt-3 text-body-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href={routes.signin()} className="font-semibold text-primary hover:underline">
                    Sign in
                  </Link>
                  .
                </p>
              </>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-span-5">
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-3 font-display text-headline-md text-foreground">Order summary</h2>
            <dl className="space-y-3 text-body-md">
              {/*
                Once a promo is applied the whole block switches to the server's figures,
                subtotal included. Rendering only the discount and total from the preview
                left a summary reading "3,99 €" above "−$3.99" and "$0.00": the server can
                resolve a different charge currency than the one the shopper is browsing
                in — a zero total falls back to USD because the converted amount lands
                under the provider minimum — and a payment summary quoting two currencies
                at once is not something anyone should be asked to trust.
              */}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal ({units} {unitLabel})
                </dt>
                <dd>
                  {promoApplied && promoApplied.kind !== "tracking" ? (
                    <Money minor={promoApplied.subtotal_minor} currency={promoApplied.currency} />
                  ) : (
                    <Price usd={subtotal} />
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">eSIM activation</dt>
                <dd className="font-semibold text-success-text">FREE</dd>
              </div>
            </dl>

            {/*
              The code is checked NOW, against the server, not silently at order time.

              It used to say "Applied when you place the order" beside an unchanged total,
              so the only way to find out whether a code was real — or what it was worth —
              was to commit to paying. `/checkout/promo-preview/` runs the same arithmetic
              `create_order` runs and reserves nothing, so the discount shown here is the
              discount charged and previewing cannot burn a usage slot.

              Collapsed until asked for: an empty box labelled "promo code" sends people
              off to hunt for one, and most shoppers here do not have a code at all.
            */}
            <div className="mt-4 border-t border-dashed border-border pt-4">
              {/*
                A TRACKING code is deliberately invisible. It is an agency attribution the
                customer pays full price for, so announcing "applied" beside a Discount row
                of zero would advertise a benefit that does not exist — the exact confusion
                the zero-discount database constraint exists to prevent. It is accepted
                silently and the box closes.
              */}
              {promoApplied && promoApplied.kind === "tracking" ? null : promoApplied ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-label-bold text-success-text">
                      <Tag size={15} aria-hidden />
                      <span className="truncate">{promoApplied.code} applied</span>
                    </p>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      Discount shown in the total below.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearPromo}
                    className="-my-2 flex min-h-11 shrink-0 items-center rounded px-1 text-label-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Remove
                  </button>
                </div>
              ) : promoOpen ? (
                <div>
                  <label className="block">
                    <span className="mb-1.5 block text-body-sm font-medium text-foreground">
                      Promo code
                    </span>
                    {/* Apply beside the field, not under it: the field and the action that
                        validates it are one control, and on a phone a button on its own row
                        reads as the page's primary action, which it is not. */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promo}
                        onChange={(e) => {
                          setPromo(e.target.value);
                          setPromoError(null);
                        }}
                        onKeyDown={(e) => {
                          // Enter must not submit the order form this input sits inside.
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyPromo();
                          }
                        }}
                        placeholder="ENTER CODE"
                        autoFocus
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={promoError ? "true" : undefined}
                        aria-describedby={promoError ? "promo-error" : undefined}
                        className="h-11 min-w-0 flex-1 rounded-md border border-border bg-muted px-3 text-body-md uppercase tracking-wide outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus:border-primary sm:text-body-sm"
                      />
                      <button
                        type="button"
                        onClick={applyPromo}
                        disabled={promoChecking || !promo.trim()}
                        className="h-11 shrink-0 rounded-md border border-border bg-card px-4 text-label-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {promoChecking ? "Checking…" : "Apply"}
                      </button>
                    </div>
                  </label>
                  {promoError ? (
                    <p id="promo-error" role="alert" className="mt-1.5 text-body-sm text-destructive-text">
                      {promoError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPromoOpen(true)}
                  className="flex min-h-11 items-center gap-2 rounded text-label-bold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Tag size={15} aria-hidden />
                  Have a promo code?
                </button>
              )}
            </div>

            {/*
              `<Money>` for the applied case, `<Price>` otherwise, and the split is
              load-bearing. The preview is already priced in the charge currency by the
              server; `<Price>` converts catalogue USD, so using it here would convert an
              already-converted figure and show an INR shopper a total ~88x too large.
            */}
            {promoApplied && promoApplied.kind !== "tracking" ? (
              <dl className="mt-4 space-y-2 border-t border-border pt-4">
                <div className="flex justify-between text-body-md">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="font-semibold text-success-text">
                    −<Money minor={promoApplied.discount_minor} currency={promoApplied.currency} />
                  </dd>
                </div>
                <div className="flex items-end justify-between">
                  <dt className="font-display text-headline-md text-foreground">Total</dt>
                  <dd aria-live="polite" className="font-display text-headline-md text-primary">
                    <Money minor={promoApplied.total_minor} currency={promoApplied.currency} />
                  </dd>
                </div>
              </dl>
            ) : (
              <dl className="mt-4 flex items-end justify-between border-t border-border pt-4">
                <dt className="font-display text-headline-md text-foreground">Total</dt>
                <dd aria-live="polite" className="font-display text-headline-md text-primary">
                  <Price usd={subtotal} />
                </dd>
              </dl>
            )}
            {/*
              The form element stays mounted at every width — the pinned bar's button
              submits it by `form={FORM_ID}` — but its own button is hidden below `lg`,
              where the pinned bar already carries one. Two identical "Proceed to
              payment" buttons 40px apart is what shipped: one pinned, one in the card
              right behind it, and no way to tell which one was the real one.
            */}
            <form id={FORM_ID} onSubmit={placeOrder} className="lg:mt-6">
              <button
                type="submit"
                disabled={submitting}
                className="hidden w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-4 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60 lg:flex"
              >
                {submitting ? "Placing order…" : "Proceed to payment"}
                {submitting ? null : <ArrowRight size={20} aria-hidden />}
              </button>
            </form>
            {/*
              One alert node, at every width — two would announce the same failure twice.
              It lives here beside the total, and `revealSummarySoon` brings the phone to
              it: below `lg` the button that produced it is the pinned bar's, which can be
              most of a page away from this card.
            */}
            {submitError ? (
              <p
                ref={submitErrorRef}
                role="alert"
                className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-center text-body-sm text-destructive-text lg:bg-transparent lg:px-0 lg:py-0"
              >
                {submitError}
              </p>
            ) : null}
            {/* The currency the SERVER resolved, not the one being browsed in — they
                differ whenever the converted total falls under the provider minimum. */}
            <p className="mt-4 text-center text-body-sm text-muted-foreground lg:mt-3">
              Charged in{" "}
              {(promoApplied && promoApplied.kind !== "tracking" && promoApplied.currency) ||
                currency}
              . Your card or bank may add its own conversion fee.
            </p>
          </div>
        </aside>
      </div>

      {/*
        On mobile the summary is the last thing on a long page, so the total and the pay
        button are pinned instead. Mirrors the plan-selector's bar, down to the z-index,
        so the two never fight for the same strip of screen.
      */}
      <div
        data-checkout-bar
        style={{
          bottom: "var(--consent-banner-h, 0px)",
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
        }}
        /*
          `bg-background`, not `bg-background/95`. At 95% the identity card and the order
          summary scrolled visibly through the total and the pay button — "Already have an
          account? Sign in" read straight through the bar. Opaque is also the only option:
          `backdrop-filter` is banned here, it promotes a fixed element to its own
          composited layer and that is what caused the iPhone scroll stalls.
        */
        className="fixed inset-x-0 z-30 border-t border-border bg-background px-4 pt-3 shadow-l3 lg:hidden"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <span className="text-body-sm text-muted-foreground">
              Total · {units} {unitLabel}
            </span>
            {/* Not aria-live: the summary card's total already announces changes, and
                two live regions would read the same number twice. */}
            {/* Must agree with the summary card above, including the discount — the bar
                is the total most phone shoppers actually read before paying. */}
            <span className="font-display text-headline-md leading-none text-primary">
              {promoApplied && promoApplied.kind !== "tracking" ? (
                <Money minor={promoApplied.total_minor} currency={promoApplied.currency} />
              ) : (
                <Price usd={subtotal} />
              )}
            </span>
          </div>
          <button
            type="submit"
            form={FORM_ID}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-3.5 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? "Placing order…" : "Proceed to payment"}
            {submitting ? null : <ArrowRight size={20} aria-hidden />}
          </button>
        </div>
      </div>
    </Container>
  );
}
