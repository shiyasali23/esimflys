import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyReports } from "@/features/agency/components/agency-reports.client";

export const metadata = buildMetadata({
  title: "Agency reports",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Reports">
      <AgencyReports orgId={orgId} />
    </AgencyShell>
  );
}
