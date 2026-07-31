import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyPayouts } from "@/features/agency/components/agency-payouts.client";

export const metadata = buildMetadata({
  title: "Agency payouts",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Payouts">
      <AgencyPayouts orgId={orgId} />
    </AgencyShell>
  );
}
