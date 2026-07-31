import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminCustomers } from "@/features/admin/components/admin-customers.client";

export const metadata = buildMetadata({
  title: "Customers · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Customers">
      <AdminCustomers />
    </AdminShell>
  );
}
