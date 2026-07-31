import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyProfile } from "@/features/agency/components/agency-profile.client";

export const metadata = buildMetadata({
  title: "Agency profile",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Profile">
      <AgencyProfile orgId={orgId} />
    </AgencyShell>
  );
}
