import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminOrders } from "@/features/admin/components/admin-orders.client";

export const metadata = buildMetadata({
  title: "Orders · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Orders">
      <AdminOrders />
    </AdminShell>
  );
}
