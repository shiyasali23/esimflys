import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminPayouts } from "@/features/admin/components/admin-payouts.client";

export const metadata = buildMetadata({
  title: "Payouts · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Payouts">
      <AdminPayouts />
    </AdminShell>
  );
}
