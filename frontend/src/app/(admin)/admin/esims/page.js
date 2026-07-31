import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminEsims } from "@/features/admin/components/admin-esims.client";

export const metadata = buildMetadata({
  title: "eSIMs · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="eSIMs">
      <AdminEsims />
    </AdminShell>
  );
}
