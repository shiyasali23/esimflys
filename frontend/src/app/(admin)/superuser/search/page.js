import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminSearch } from "@/features/admin/components/admin-search.client";

export const metadata = buildMetadata({
  title: "Search · Admin",
  description: "eSIMFlys platform admin.",
  path: "/superuser",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Search">
      <AdminSearch />
    </AdminShell>
  );
}
