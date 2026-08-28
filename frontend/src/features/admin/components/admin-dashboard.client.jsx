"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Lock } from "lucide-react";
import { fetchAdminDashboard, hasPricingVisibility } from "@/lib/api/admin";
import { Money } from "@/components/currency/money";
import { KpiTile } from "@/features/admin/components/admin-kpi-tile";
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

  const money = (minor) => <Money minor={minor} currency="USD" />;

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

  /*
   * The alert strip.
   *
   * The counters below have always been on this page and a 100% email failure still ran
   * unnoticed for weeks — five customers paid and none received their QR code, while
   * "Notifications failed: 10" sat in a tile among eleven other numbers. A number is not
   * a warning. This says what is wrong, in a sentence, above everything else, and only
   * when something actually is.
   *
   * Ordered by what it costs the customer: money taken with nothing delivered first,
   * then delivery broken, then the provider, then the backlog.
   */
  const ops = data.operations || {};
  const alerts = [
    ops.paid_without_esim > 0 && {
      key: "paid",
      text: `${ops.paid_without_esim} paid order${ops.paid_without_esim === 1 ? " has" : "s have"} no eSIM after 10 minutes — those customers were charged and have nothing.`,
      href: "/superuser/orders",
    },
    ops.webhooks_bad_signature > 0 && {
      key: "signature",
      text: `${ops.webhooks_bad_signature} webhook${ops.webhooks_bad_signature === 1 ? "" : "s"} failed signature checks — the Stripe secret does not match the sender, so no payment can complete.`,
      href: "/superuser/webhooks",
    },
    ops.notifications_failed > 0 && {
      key: "email",
      text: `${ops.notifications_failed} email${ops.notifications_failed === 1 ? "" : "s"} could not be delivered — order confirmations and QR codes are not reaching customers.`,
      href: "/superuser/operations",
    },
    ops.supplier_jobs_manual_review > 0 && {
      key: "supplier",
      text: `${ops.supplier_jobs_manual_review} supplier job${ops.supplier_jobs_manual_review === 1 ? " needs" : "s need"} manual review — provisioning stopped and will not retry on its own.`,
      href: "/superuser/operations",
    },
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      {alerts.length ? (
        <section aria-labelledby="admin-alerts">
          <h2 id="admin-alerts" className="mb-3 text-label-caps uppercase text-destructive-text">
            Needs attention
          </h2>
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.key}>
                <Link
                  href={alert.href}
                  className="flex items-start gap-3 rounded-card border border-destructive/40 bg-destructive/5 p-4 text-body-md text-destructive-text hover:bg-destructive/10"
                >
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{alert.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.heading}>
          <h2 className="mb-1.5 text-admin-caps uppercase text-admin-text-muted">{group.heading}</h2>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {group.tiles.map((tile) => (
              <KpiTile key={tile.label} {...tile} />
            ))}
          </div>
        </section>
      ))}

      {showPricing ? (
        <section>
          <h2 className="mb-1.5 text-admin-caps uppercase text-admin-text-muted">
            Platform economics
          </h2>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            <KpiTile label="Collected" value={money(data.margin?.retail_minor)} />
            <KpiTile label="Supplier cost" value={money(data.margin?.wholesale_minor)} />
            <KpiTile label="Gross margin" value={money(data.margin?.margin_minor)} accent />
          </div>
        </section>
      ) : (
        <section>
          <p className="flex items-center gap-2 rounded-admin border border-admin-border bg-admin-surface px-3 py-2.5 text-admin-body text-admin-text-muted">
            <Lock size={14} aria-hidden />
            Platform economics are hidden for your role.
          </p>
        </section>
      )}

    </div>
  );
}
