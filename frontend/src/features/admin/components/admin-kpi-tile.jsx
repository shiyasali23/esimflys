/**
 * One KPI tile, shared by the platform dashboard and the agency portal.
 *
 * Shared because the two drifted: the platform tiles moved to operational density while
 * the agency's stayed on the storefront card — 22px radius, 24px padding, a 44px value —
 * so a partner opened a panel that looked like a different product from the one the
 * operator was using, built from the same components.
 *
 * The previous tile stacked nineteen of itself to 1792px on the platform dashboard. This
 * is ~68px tall and sits up to six to a row.
 *
 * Label above value, both left-aligned on one axis: a column of figures is read by
 * scanning down, and centring them breaks that line. `note` is optional — the agency
 * tiles carry a qualifier ("0 orders", "Approved and awaiting payout") that the platform
 * ones do not.
 */
export function KpiTile({ label, value, note, alert, accent }) {
  return (
    <div
      className={`rounded-admin border bg-admin-surface px-3 py-2.5 shadow-admin ${
        alert ? "border-destructive/40" : accent ? "border-admin-accent/40" : "border-admin-border"
      }`}
    >
      <p className="truncate text-admin-label text-admin-text-muted">{label}</p>
      <p
        className={`mt-0.5 text-admin-kpi ${
          alert ? "text-destructive-text" : accent ? "text-admin-accent-ink" : "text-admin-text"
        }`}
      >
        {value}
      </p>
      {note ? <p className="mt-0.5 truncate text-admin-label text-admin-text-muted">{note}</p> : null}
    </div>
  );
}
