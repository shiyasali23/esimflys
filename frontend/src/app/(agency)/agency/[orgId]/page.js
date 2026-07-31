import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyDashboard } from "@/features/agency/components/agency-dashboard.client";

export const metadata = buildMetadata({
  title: "Agency dashboard",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId}>
      <AgencyDashboard orgId={orgId} />
    </AgencyShell>
  );
}
