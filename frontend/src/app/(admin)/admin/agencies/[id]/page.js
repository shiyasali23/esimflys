import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminAgencyDetail } from "@/features/admin/components/admin-agency-detail.client";

export const metadata = buildMetadata({
  title: "Agency · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <AdminShell title="Agency">
      <AdminAgencyDetail orgId={id} />
    </AdminShell>
  );
}
