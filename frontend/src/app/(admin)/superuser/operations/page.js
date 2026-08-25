import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminOperations } from "@/features/admin/components/admin-operations.client";

export const metadata = buildMetadata({
  title: "Operations · Admin",
  description: "eSIMFlys platform admin.",
  path: "/superuser",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Operations">
      <AdminOperations />
    </AdminShell>
  );
}
