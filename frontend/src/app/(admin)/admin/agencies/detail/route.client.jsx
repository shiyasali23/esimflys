"use client";
import { useSearchParams } from "next/navigation";
import { AdminAgencyDetail } from "@/features/admin/components/admin-agency-detail.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function AdminAgencyDetailRoute() {
  const id = useSearchParams().get("id");
  if (!id) return <MissingReference backHref={routes.admin()} backLabel="Back to admin" />;
  return <AdminAgencyDetail orgId={id} />;
}
