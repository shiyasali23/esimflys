"use client";
import { useSearchParams } from "next/navigation";
import { AdminEsimDetail } from "@/features/admin/components/admin-esim-detail.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function AdminEsimDetailRoute() {
  const id = useSearchParams().get("id");
  if (!id) return <MissingReference backHref={routes.admin()} backLabel="Back to admin" />;
  return <AdminEsimDetail esimId={id} />;
}
