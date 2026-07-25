"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, QrCode, Mail } from "lucide-react";
import { useCart } from "@/features/cart/use-cart.client";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/feedback/empty-state";
import { routes } from "@/config/routes";

const INSTALL_STEPS = [
  "Check your email for the eSIM QR code.",
  "Open Settings → Cellular / Mobile Data → Add eSIM.",
  "Scan the QR code shown here or in your email.",
  "Turn on the eSIM line when you land at your destination.",
];

/** Deterministic decorative QR placeholder (no real activation code). */
function QrPlaceholder() {
  return (
    <div
      className="mx-auto mb-4 grid h-40 w-40 grid-cols-8 gap-0.5 rounded-md border border-border bg-white p-2"
      role="img"
      aria-label="eSIM QR code placeholder"
    >
      {Array.from({ length: 64 }).map((_, i) => (
        <span
          key={i}
          className={(i * 7 + (i % 5)) % 3 === 0 ? "bg-foreground" : "bg-transparent"}
        />
      ))}
    </div>
  );
}

/**
 * Order confirmation (blueprint §13.12). Consumes the cart, shows the order,
 * a QR placeholder + install steps. The real activation QR/ICCID is issued by
 * the eSIM provider via the backend and emailed to the customer.
 */
export function ConfirmationView() {
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState(null);
  const item = useCart((s) => s.item);
  const clear = useCart((s) => s.clear);

  useEffect(() => {
    setMounted(true);
    if (item) {
      const number = "ESF-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      setOrder({ number, item });
      clear(); // consume the cart so a refresh doesn't re-create the order
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) {
    return (
      <Container className="py-12">
        <div className="mx-auto h-72 max-w-3xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </Container>
    );
  }
  if (!order) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={QrCode}
          title="No recent order"
          body="Your order confirmation isn't available."
          action={{ label: "Browse destinations", href: routes.destinations() }}
        />
      </Container>
    );
  }

  return (
    <Container className="max-w-3xl py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-text/10 text-success-text">
          <CheckCircle2 size={36} aria-hidden />
        </div>
        <h1 className="mb-2 font-display text-headline-lg uppercase text-foreground">Order confirmed</h1>
        <p className="text-body-md text-muted-foreground">
          Order <span className="font-semibold text-foreground">{order.number}</span> ·{" "}
          {order.item.countryName} {order.item.dataLabel}
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-8 text-center">
          <h2 className="mb-4 font-display text-headline-md text-foreground">Your eSIM QR</h2>
          <QrPlaceholder />
          <p className="text-body-sm text-muted-foreground">
            <Mail size={14} className="inline" aria-hidden /> Also emailed to you. (Demo QR — the real
            activation code is issued by the eSIM provider.)
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white p-8">
          <h2 className="mb-4 font-display text-headline-md text-foreground">Install in 4 steps</h2>
          <ol className="space-y-3">
            {INSTALL_STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-body-md text-foreground">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-label-caps text-on-primary">
                  {i + 1}
                </span>
                {s}
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
