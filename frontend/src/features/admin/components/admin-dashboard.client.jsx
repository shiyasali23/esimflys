"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { fetchAdminDashboard, hasPricingVisibility } from "@/lib/api/admin";
import { fromMinor } from "@/lib/format/units";
import { Price } from "@/components/currency/price";
import { ErrorState } from "@/components/feedback/error-state";

/**
 * Platform overview.
 *
 * The `margin` block is ABSENT for roles without pricing capability — popped from
 * the payload, not nulled — so its section is rendered from a key-presence check.
 * Reading `data.margin.margin_minor` directly would throw for a support or finance
 * admin, taking the whole page down.
 */
export function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAdminDashboard()
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <ErrorState error={error} title="We couldn't load the dashboard" />;

  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-muted" />
        ))}
      </div>
    );
  }

  const showPricing = hasPricingVisibility(data);

  const money = (minor) => <Price usd={fromMinor(minor)} />;

  const groups = [
    {
      heading: "Revenue",
      tiles: [
        { label: "Gross", value: money(data.revenue?.gross_minor) },
        { label: "Refunded", value: money(data.revenue?.refunded_minor) },
        { label: "Net", value: money(data.revenue?.net_minor), accent: true },
      ],
    },
    {
      heading: "Orders",
      tiles: [
        { label: "Total", value: data.orders?.total ?? 0 },
        { label: "Paid", value: data.orders?.paid ?? 0 },
        {
          label: "Fulfilled",
          value: data.orders?.by_status?.fulfilled ?? 0,
        },
      ],
    },
    {
      heading: "eSIMs",
      tiles: [
        { label: "Total", value: data.esims?.total ?? 0 },
        { label: "Live", value: data.esims?.live ?? 0 },
        {
          label: "Failed",
          value: data.esims?.failed ?? 0,
          alert: (data.esims?.failed ?? 0) > 0,
        },
      ],
    },
    {
      heading: "Commissions",
      tiles: [
        { label: "Outstanding", value: money(data.commissions?.outstanding_minor) },
        { label: "Paid", value: money(data.commissions?.paid_minor) },
        { label: "Reversed", value: money(data.commissions?.reversed_minor) },
      ],
    },
    {
      heading: "Operations",
      tiles: [
        { label: "Jobs pending", value: data.operations?.supplier_jobs_pending ?? 0 },
        {
          label: "Manual review",
          value: data.operations?.supplier_jobs_manual_review ?? 0,
          alert: (data.operations?.supplier_jobs_manual_review ?? 0) > 0,
        },
        {
          label: "Emails failed",
          value: data.operations?.notifications_failed ?? 0,
          alert: (data.operations?.notifications_failed ?? 0) > 0,
        },
        {
          label: "Webhooks rejected",
          value: data.operations?.webhooks_rejected ?? 0,
          alert: (data.operations?.webhooks_rejected ?? 0) > 0,
        },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.heading}>
          <h2 className="mb-3 text-label-caps uppercase text-muted-foreground">{group.heading}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {group.tiles.map((tile) => (
              <div
                key={tile.label}
                className={`rounded-card border bg-white p-5 ${
                  tile.alert ? "border-destructive/40" : tile.accent ? "border-primary/40" : "border-border"
                }`}
              >
                <p className="text-body-sm text-muted-foreground">{tile.label}</p>
                <p
                  className={`mt-1 font-display text-headline-md ${
                    tile.alert ? "text-destructive" : tile.accent ? "text-primary" : "text-foreground"
                  }`}
                >
                  {tile.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {showPricing ? (
        <section>
          <h2 className="mb-3 text-label-caps uppercase text-muted-foreground">
            Platform economics
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-card border border-border bg-white p-5">
              <p className="text-body-sm text-muted-foreground">Retail</p>
              <p className="mt-1 font-display text-headline-md text-foreground">
                {money(data.margin?.retail_minor)}
              </p>
            </div>
            <div className="rounded-card border border-border bg-white p-5">
              <p className="text-body-sm text-muted-foreground">Wholesale</p>
              <p className="mt-1 font-display text-headline-md text-foreground">
                {money(data.margin?.wholesale_minor)}
              </p>
            </div>
            <div className="rounded-card border border-primary/40 bg-white p-5">
              <p className="text-body-sm text-muted-foreground">Margin</p>
              <p className="mt-1 font-display text-headline-md text-primary">
                {money(data.margin?.margin_minor)}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section>
          <p className="flex items-center gap-2 rounded-card border border-border bg-muted p-4 text-body-sm text-muted-foreground">
            <Lock size={16} aria-hidden />
            Platform economics are hidden for your role.
          </p>
        </section>
      )}

    </div>
  );
}
