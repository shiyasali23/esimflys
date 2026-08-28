import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminWebhooks } from "@/features/admin/components/admin-webhooks.client";

export const metadata = buildMetadata({
  title: "Webhooks · Admin",
  description: "eSIMFlys platform admin.",
  path: "/superuser",
  index: false, // noindex — internal staff tooling
});

export default function Page() {
  return (
    <AdminShell title="Webhooks">
      <AdminWebhooks />
    </AdminShell>
  );
}
