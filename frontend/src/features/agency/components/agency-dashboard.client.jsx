"use client";
import { useEffect, useState } from "react";
import { fetchAgencyDashboard } from "@/lib/api/agency";
import { Money } from "@/components/currency/money";
import { ErrorState } from "@/components/feedback/error-state";
import { KpiTile } from "@/features/admin/components/admin-kpi-tile";

/**
 * Agency overview.
 *
 * `outstanding_minor` is the headline because it is what the agency is owed —
 * `earned_minor` ignores claw-backs. There is no `margin` key on this payload and
 * never will be: platform economics are not the agency's to see.
 */
export function AgencyDashboard({ orgId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetchAgencyDashboard(orgId)
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err));
    return () => {
      active = false;
    };
  }, [orgId]);

  if (error) return <ErrorState error={error} title="We couldn't load your dashboard" />;

  if (!data) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[68px] animate-pulse rounded-admin bg-admin-border-subtle" />
        ))}
      </div>
    );
  }

  const tiles = [
    {
      label: "Commission outstanding",
      value: <Money minor={data.commissions?.outstanding_minor} currency="USD" />,
      note: "Approved and awaiting payout",
      accent: true,
    },
    {
      label: "Attributed sales",
      value: <Money minor={data.attributed_sales?.total_minor} currency="USD" />,
      note: `${data.attributed_sales?.order_count ?? 0} order${
        data.attributed_sales?.order_count === 1 ? "" : "s"
      }`,
    },
    {
      label: "Commission earned",
      value: <Money minor={data.commissions?.earned_minor} currency="USD" />,
      note: "No reversals",
      reversed: data.commissions?.reversed_minor,
    },
    {
      label: "Paid out",
      value: <Money minor={data.payouts?.paid_out_minor} currency="USD" />,
      note: `${data.payouts?.payout_count ?? 0} payout${
        data.payouts?.payout_count === 1 ? "" : "s"
      }`,
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <KpiTile
          key={tile.label}
          label={tile.label}
          value={tile.value}
          accent={tile.accent}
          note={
            tile.reversed > 0 ? (
              <>
                Less reversals of <Money minor={tile.reversed} currency="USD" />
              </>
            ) : (
              tile.note
            )
          }
        />
      ))}
    </div>
  );
}
