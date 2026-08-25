import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminAgencies } from "@/features/admin/components/admin-agencies.client";

export const metadata = buildMetadata({
  title: "Agencies · Admin",
  description: "eSIMFlys platform admin.",
  path: "/superuser",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Agencies">
      <AdminAgencies />
    </AdminShell>
  );
}
