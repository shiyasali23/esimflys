"use client";
import { useSearchParams } from "next/navigation";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyPayouts } from "@/features/agency/components/agency-payouts.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function AgencyPayoutsRoute() {
  const orgId = useSearchParams().get("org");
  if (!orgId) {
    return <MissingReference backHref={routes.agencies()} backLabel="Choose an organization" />;
  }
  return (
    <AgencyShell orgId={orgId} title="Payouts">
      <AgencyPayouts orgId={orgId} />
    </AgencyShell>
  );
}
