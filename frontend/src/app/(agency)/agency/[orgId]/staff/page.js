import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyStaff } from "@/features/agency/components/agency-staff.client";

export const metadata = buildMetadata({
  title: "Agency staff",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Staff">
      <AgencyStaff orgId={orgId} />
    </AgencyShell>
  );
}
