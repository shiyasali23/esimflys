import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminEsimDetail } from "@/features/admin/components/admin-esim-detail.client";

export const metadata = buildMetadata({
  title: "eSIM · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <AdminShell title="eSIM">
      <AdminEsimDetail esimId={id} />
    </AdminShell>
  );
}
