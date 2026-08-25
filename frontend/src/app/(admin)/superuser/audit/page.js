import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminAudit } from "@/features/admin/components/admin-audit.client";

export const metadata = buildMetadata({
  title: "Audit · Admin",
  description: "eSIMFlys platform admin.",
  path: "/superuser",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Audit">
      <AdminAudit />
    </AdminShell>
  );
}
