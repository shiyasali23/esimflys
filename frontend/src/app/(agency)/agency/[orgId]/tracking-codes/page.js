import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyTrackingCodes } from "@/features/agency/components/agency-tracking-codes.client";

export const metadata = buildMetadata({
  title: "Agency tracking codes",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Tracking codes">
      <AgencyTrackingCodes orgId={orgId} />
    </AgencyShell>
  );
}
