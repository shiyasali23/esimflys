import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminPromoCodes } from "@/features/admin/components/admin-promo-codes.client";

export const metadata = buildMetadata({
  title: "Promo codes · Admin",
  description: "eSIMFlys platform admin.",
  path: "/superuser",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Promo codes">
      <AdminPromoCodes />
    </AdminShell>
  );
}
