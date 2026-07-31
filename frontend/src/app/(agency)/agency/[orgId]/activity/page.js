import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyShell } from "@/features/agency/components/agency-shell.client";
import { AgencyActivity } from "@/features/agency/components/agency-activity.client";

export const metadata = buildMetadata({
  title: "Agency activity",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

export default async function Page({ params }) {
  const { orgId } = await params;
  return (
    <AgencyShell orgId={orgId} title="Activity">
      <AgencyActivity orgId={orgId} />
    </AgencyShell>
  );
}
