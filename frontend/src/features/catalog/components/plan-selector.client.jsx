"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Price } from "@/components/currency/price";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/features/cart/use-cart.client";
import { useCurrency } from "@/components/currency/use-currency.client";
import { checkoutDirect } from "@/lib/api/orders";
import { fetchMeOrNull, GOOGLE_LOGIN_PATH } from "@/lib/api/session";
import { hasSessionHint } from "@/features/auth/use-session.client";
import { saveOrderContext } from "@/features/checkout/order-context";
import { GoogleLogo } from "@/components/media/google-logo";
import { cn } from "@/lib/cn";
import { routes } from "@/config/routes";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `belowPlans` renders inside the LEFT column, under the plan grid — not after the
 * whole component. The summary card beside it is taller than the grid, so anything
 * placed after the grid left a column of dead space next to it. Passed in rather than
 * imported so the page keeps owning its own copy.
 */
export function PlanSelector({ country, plans, belowPlans = null }) {
  const router = useRouter();
  const addSelection = useCart((s) => s.add);
  /**
   * Which plan opens preselected. No Albania plan sets `is_default_selected`, so this
   * used to fall through to `plans[0]` — the 10 GB only because that is where the
   * supplier happened to put it. Sorting the grid would have silently moved the
   * default to the 1 GB. Fall back to the merchandised "popular" plan instead, which
   * is the same card today and stays right when the order changes.
   */
  const defaultId =
    plans.find((p) => p.isDefaultSelected)?.product_id ||
    plans.find((p) => p.badge === "popular")?.product_id ||
    plans[0]?.product_id;
  const [selectedId, setSelectedId] = useState(defaultId);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const selected = plans.find((p) => p.product_id === selectedId) || plans[0];

  /**
   * Buying one plan does not need a cart OR a checkout page: `POST /checkout/direct/`
   * creates the order from this one line, and /checkout/payment mounts Stripe off the
   * order id. So the desktop summary takes an email and goes straight to payment.
   *
   * DESKTOP ONLY, by construction — this whole aside is `hidden lg:block`. On a phone
   * the same box would push the buy button off screen, so the pinned bar keeps its
   * one job: get to /checkout.
   */
  const currency = useCurrency((s) => s.currency);
  const [account, setAccount] = useState(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(null);
  /** One key per purchase ATTEMPT: a lost response must resolve to the same order. */
  const idempotencyKey = useRef(null);

  /*
   * The probe is gated on `hasSessionHint()`, the same guard `AccountNav` already uses.
   *
   * Its only job is to prefill `buyerEmail` for someone already signed in. A browser with
   * no hint has never signed in, so there is nothing to prefill and the request can only
   * come back 403 — which is what was happening on every country page, the site's main
   * SEO landing surface.
   *
   * [MEASURED] fresh browser context, no session hint, no cookies beyond `recentCountries`:
   * `/api/v1/account/me/` fired and 403'd, 328 ms on that sample. Median API latency
   * through the proxy measured 885 ms across three endpoints, 5 samples each.
   *
   * This also makes true a claim that was already written down and was false: the comment
   * in `account-currency-sync.client.jsx` states that public pages make no `/account/me/`
   * request at all. That was the documented invariant; this effect had been quietly
   * breaking it.
   */
  useEffect(() => {
    if (!hasSessionHint()) return;
    fetchMeOrNull()
      .then((me) => {
        if (me?.email) setAccount(me);
      })
      // Accounts being unreachable must not block a guest purchase.
      .catch(() => setAccount(null));
  }, []);

  const buyerEmail = account?.email || email.trim();

  // A changed plan, address or currency is a different purchase.
  useEffect(() => {
    idempotencyKey.current = null;
  }, [selectedId, buyerEmail, currency]);

  /**
   * Selecting a plan is now a local act — no request, so nothing here can fail on a
   * backend that is slow or down. The order is created in one call at checkout, and
   * the server prices every line then; `usd` is carried only to render a total.
   */
  function handleContinue() {
    setAdding(true);
    setError(null);
    try {
      addSelection({
        productCode: selected.product_id,
        displayName: label(selected),
        countryName: country.name,
        countrySlug: country.slug,
        usd: selected.retail_price_usd,
        quantity: 1,
      });
      router.push(routes.checkout());
    } catch {
      setError("We couldn't add that plan. Please try again.");
      setAdding(false);
    }
  }

  /**
   * One plan, one address, straight to Stripe. The selection store is deliberately NOT
   * touched: this plan becomes an order here, so leaving a copy in the basket would
   * offer it for sale a second time on the checkout page.
   */
  async function buyNow(event) {
    event.preventDefault();
    setError(null);

    if (!account && !EMAIL_PATTERN.test(email.trim())) {
      setEmailError("Enter the email address we should send your eSIM to.");
      return;
    }
    setEmailError(null);
    setAdding(true);
    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    try {
      const order = await checkoutDirect({
        items: [{ productCode: selected.product_id, quantity: 1 }],
        customerEmail: buyerEmail,
        currency,
        idempotencyKey: idempotencyKey.current,
      });
      saveOrderContext({
        orderId: order.id,
        orderNumber: order.order_number,
        email: order.customer_email || buyerEmail,
      });
      idempotencyKey.current = null;
      router.push(`${routes.payment()}?order=${encodeURIComponent(order.id)}`);
    } catch (err) {
      setError(
        err?.code === "plan_unavailable"
          ? "That plan has just become unavailable. Refresh to see current plans."
          : err?.message || "We couldn't start your order. Please try again.",
      );
      setAdding(false);
    }
  }


  const label = (p) => (p.isUnlimited ? "Unlimited" : `${p.data_gb} GB`);
  const sub = (p) =>
    p.isUnlimited ? `${p.perDayGb} GB/day · ${p.validity_days} days` : `Valid ${p.validity_days} days`;

  /**
   * Merchandised plans lead — popular, then value — because they are the two the
   * business wants chosen and the first cards carry the most attention. Everything
   * after them climbs by size, since the supplier's own order (10, 20, 5, 50, 3, 1
   * for Albania) is no order at all. Unlimited is a different unit and sits last.
   */
  const BADGE_RANK = { popular: 0, value: 1 };
  const ordered = [...plans].sort((a, b) => {
    const ra = BADGE_RANK[a.badge] ?? 9;
    const rb = BADGE_RANK[b.badge] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.isUnlimited !== b.isUnlimited) return a.isUnlimited ? 1 : -1;
    return a.isUnlimited
      ? (a.validity_days || 0) - (b.validity_days || 0)
      : (a.data_gb || 0) - (b.data_gb || 0);
  });

  /**
   * What one gigabyte costs on this plan — the only figure that makes eight sizes
   * comparable. Albania spans $0.82/GB (50 GB) to $3.00/GB (3 GB) and nothing on the
   * card said so. Suppressed at 1 GB, where it would just repeat the price, and for
   * unlimited plans, which are priced per day instead.
   */
  const unitPrice = (p) => {
    if (p.isUnlimited) return p.validity_days ? { usd: p.retail_price_usd / p.validity_days, per: "day" } : null;
    if (!p.data_gb || p.data_gb <= 1) return null;
    return { usd: p.retail_price_usd / p.data_gb, per: "GB" };
  };

  if (!selected) return null;

  const networks = country.networks || [];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-8">
        <h2 className="mb-4 font-display text-headline-md uppercase text-foreground">Choose your plan</h2>
        <fieldset>
          <legend className="sr-only">Choose a data plan for {country.name}</legend>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {ordered.map((p) => {
              const isSel = p.product_id === selectedId;
              const unit = unitPrice(p);
              return (
                <label
                  key={p.product_id}
                  className={cn(
                    "relative flex h-full cursor-pointer flex-col rounded-card border bg-card p-4 transition-all hover:border-primary/50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    isSel ? "border-primary bg-muted ring-1 ring-primary" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={p.product_id}
                    checked={isSel}
                    onChange={() => setSelectedId(p.product_id)}
                    className="sr-only"
                  />
                  <div className="flex min-h-5 items-start justify-between gap-1">
                    {p.badge ? (
                      <Badge
                        tone={p.badge === "value" ? "essential" : "highlight"}
                        className="px-2 py-0.5 text-[10px]"
                      >
                        {p.badge}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        isSel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-transparent",
                      )}
                    >
                      <Check size={12} />
                    </span>
                  </div>
                  {/*
                    Size and length on one line. Six of Albania's eight plans run 30
                    days, so a separate "Valid 30 days" row repeated the same words six
                    times and separated nothing — the size is what the shopper is
                    choosing between. Baseline-aligned so the number stays dominant.
                  */}
                  {/*
                    No reserved height. `h-full` already equalises the cards in a row and
                    `mt-auto` pins every price to the bottom, so a row stays aligned on
                    its own — the old min-heights just held 36px of nothing open on every
                    fixed-size plan.
                  */}
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 content-start">
                    <span className="font-display text-xl leading-none text-foreground sm:text-2xl">
                      {label(p)}
                    </span>
                    <span className="text-sm font-medium text-foreground/70">
                      / {p.validity_days} days
                    </span>
                  </div>
                  {p.isUnlimited ? (
                    <p className="mt-1 text-xs leading-4 text-muted-foreground">
                      {p.perDayGb} GB/day at full speed
                    </p>
                  ) : null}
                  <div className="mt-auto pt-2">
                    <div className="font-display text-2xl font-bold leading-none text-primary">
                      <Price usd={p.retail_price_usd} />
                    </div>
                    {/* Still reserved: this one IS filled on all but the 1 GB plan, so
                        collapsing it would step that single price up out of line with
                        the rest of its row. */}
                    <p className="mt-0.5 min-h-4 text-[13px] leading-4 text-muted-foreground">
                      {unit ? (
                        <>
                          <Price usd={unit.usd} />
                          <span> / {unit.per}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        {belowPlans}

        <div
          data-checkout-bar
          style={{ bottom: "var(--consent-banner-h, 0px)" }}
          className="fixed inset-x-0 z-30 border-t border-border bg-background/95 px-4 pb-4 pt-3 shadow-l3 backdrop-blur lg:hidden"
        >
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your plan</p>
                <p className="truncate font-display text-lg leading-tight text-foreground">
                  {label(selected)} · {selected.validity_days} days
                </p>
              </div>
              <div aria-live="polite" className="font-display text-2xl leading-none text-primary">
                <Price usd={selected.retail_price_usd} />
              </div>
            </div>
            <button
              type="button"
              onClick={handleContinue}
              disabled={adding}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-3 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110"
            >
              {adding ? "Adding…" : "Continue to checkout"}
              {adding ? null : <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />}
            </button>
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success-text" aria-hidden />
              Secure encrypted payment
            </p>
          </div>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="lg:sticky lg:top-20">
          <div className="rounded-card border border-border bg-card p-5 shadow-l2">
            <h2 className="mb-4 font-display text-headline-md uppercase text-foreground">Purchase summary</h2>
            <dl className="space-y-2 text-body-md">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-semibold text-foreground">{label(selected)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Validity</dt>
                <dd className="font-semibold text-foreground">{selected.validity_days} days</dd>
              </div>
              {networks.length ? (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">
                    Network{networks.length > 1 ? "s" : ""}
                  </dt>
                  <dd className="text-right font-medium text-foreground">{networks.join(", ")}</dd>
                </div>
              ) : null}
              {/* `hotspot_supported` is null for every plan today, and null means
                  UNKNOWN — not unsupported. Rendering it as "No" would deny a
                  feature the plan may well have; claiming "Yes" would promise one
                  we cannot verify. Say we don't know. */}
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">Hotspot</dt>
                <dd
                  className={
                    selected.hotspotSupported === null || selected.hotspotSupported === undefined
                      ? "text-right text-muted-foreground"
                      : "text-right font-medium text-foreground"
                  }
                >
                  {selected.hotspotSupported === true
                    ? "Supported"
                    : selected.hotspotSupported === false
                      ? "Not supported"
                      : "Check with your carrier"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-muted-foreground">eSIM type</dt>
                <dd className="text-right font-medium text-foreground">Data only</dd>
              </div>
              {/* Dashed, so the total reads as a sum of the rows above rather than a
                  separate block behind a hard rule. */}
              <div className="flex items-end justify-between border-t border-dashed border-border pt-3">
                <dt className="font-display text-headline-md text-foreground">Total</dt>
                <dd aria-live="polite" className="font-display text-headline-lg text-primary">
                  <Price usd={selected.retail_price_usd} />
                </dd>
              </div>
            </dl>
            {/*
              Everything needed to buy, in the card that shows the price. One field for a
              guest, none at all when signed in — then straight to Stripe.
            */}
            <form onSubmit={buyNow} noValidate className="mt-3 border-t border-border pt-3">
              {account ? (
                <p className="mb-3 flex items-start gap-2 text-body-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden />
                  <span className="min-w-0">
                    Sending to <span className="font-semibold text-foreground">{account.email}</span>
                  </span>
                </p>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-body-sm font-medium text-foreground">
                    Email address
                  </span>
                  <input
                    type="email"
                    name="customer_email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    aria-invalid={emailError ? "true" : undefined}
                    aria-describedby={emailError ? "plan-email-error" : "plan-email-hint"}
                    className="w-full rounded-md border border-border bg-muted px-4 py-2 text-body-md outline-none focus:border-primary"
                  />
                  {emailError ? (
                    <span
                      id="plan-email-error"
                      role="alert"
                      className="mt-1.5 block text-body-sm text-destructive-text"
                    >
                      {emailError}
                    </span>
                  ) : (
                    <span id="plan-email-hint" className="mt-1.5 block text-body-sm text-muted-foreground">
                      We'll send your eSIM QR code here.
                    </span>
                  )}
                </label>
              )}
              <button
                type="submit"
                disabled={adding}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-cta px-6 py-3 text-body-lg font-semibold text-cta-foreground transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {adding ? "Starting…" : "Proceed to payment"}
                {adding ? null : <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />}
              </button>
            </form>

            {!account ? (
              <>
                <div className="my-2.5 flex items-center gap-3 text-body-sm text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
                {/* OAuth needs a full-page redirect, so this must be an anchor. */}
                <a
                  href={GOOGLE_LOGIN_PATH}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-card py-2 font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <GoogleLogo />
                  Continue with Google
                </a>
                <p className="mt-2 text-center text-body-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href={routes.signin()} className="font-semibold text-primary hover:underline">
                    Sign in
                  </Link>
                  .
                </p>
              </>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-center text-body-sm text-destructive-text">
                {error}
              </p>
            ) : null}

            {/* The multi-destination path still exists, just no longer the default. */}
            <button
              type="button"
              onClick={handleContinue}
              disabled={adding}
              className="mt-2 w-full rounded text-center text-body-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
              Buying for more than one country? Use the cart
            </button>

            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-body-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-success-text" aria-hidden />
              Secure encrypted payment
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
