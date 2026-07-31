import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminCatalogue } from "@/features/admin/components/admin-catalogue.client";

export const metadata = buildMetadata({
  title: "Catalogue · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Catalogue">
      <AdminCatalogue />
    </AdminShell>
  );
}
