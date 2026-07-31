import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminCommissions } from "@/features/admin/components/admin-commissions.client";

export const metadata = buildMetadata({
  title: "Commissions · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Commissions">
      <AdminCommissions />
    </AdminShell>
  );
}
