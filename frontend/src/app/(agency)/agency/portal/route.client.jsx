"use client";
import { useSearchParams } from "next/navigation";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyDashboard } from "@/features/agency/components/agency-dashboard.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function AgencyDashboardRoute() {
  const orgId = useSearchParams().get("org");
  if (!orgId) {
    return <MissingReference backHref={routes.agencies()} backLabel="Choose an organization" />;
  }
  return (
    <AgencyShell orgId={orgId}>
      <AgencyDashboard orgId={orgId} />
    </AgencyShell>
  );
}
