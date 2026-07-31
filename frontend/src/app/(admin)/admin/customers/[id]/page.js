import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminCustomerDetail } from "@/features/admin/components/admin-customer-detail.client";

export const metadata = buildMetadata({
  title: "Customer · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <AdminShell title="Customer">
      <AdminCustomerDetail customerId={id} />
    </AdminShell>
  );
}
