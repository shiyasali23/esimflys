import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo/metadata";
import { AdminShell } from "@/features/admin/components/admin-shell.client";
import { AdminAgencyDetailRoute } from "./route.client";

export const metadata = buildMetadata({
  title: "Agency · Admin",
  description: "eSIMFlys platform admin.",
  path: "/admin",
  index: false, // noindex — internal staff tooling
});

/*
 * The record id arrives in `?id=`, so only the detail body depends on the client —
 * the shell renders outside the boundary and the nav is up on first paint.
 */
export default function Page() {
  return (
    <AdminShell title="Agency">
      <Suspense fallback={null}>
        <AdminAgencyDetailRoute />
      </Suspense>
    </AdminShell>
  );
}
