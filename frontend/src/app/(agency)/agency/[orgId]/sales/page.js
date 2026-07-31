import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencySales } from "@/features/agency/components/agency-sales.client";

export const metadata = buildMetadata({
  title: "Agency sales",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Sales">
      <AgencySales orgId={orgId} />
    </AgencyShell>
  );
}
