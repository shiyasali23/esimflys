import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyCommissions } from "@/features/agency/components/agency-commissions.client";

export const metadata = buildMetadata({
  title: "Agency commissions",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Commissions">
      <AgencyCommissions orgId={orgId} />
    </AgencyShell>
  );
}
