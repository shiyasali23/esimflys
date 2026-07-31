import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminPayments } from "@/features/admin/components/admin-payments.client";

export const metadata = buildMetadata({
  title: "Payments · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Payments">
      <AdminPayments />
    </AdminShell>
  );
}
