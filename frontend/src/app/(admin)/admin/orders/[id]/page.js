import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminOrderDetail } from "@/features/admin/components/admin-order-detail.client";

export const metadata = buildMetadata({
  title: "Order · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <AdminShell title="Order">
      <AdminOrderDetail orderId={id} />
    </AdminShell>
  );
}
