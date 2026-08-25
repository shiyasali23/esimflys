"use client";
import { useSearchParams } from "next/navigation";
import { AdminCustomerDetail } from "@/features/admin/components/admin-customer-detail.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function AdminCustomerDetailRoute() {
  const id = useSearchParams().get("id");
  if (!id) return <MissingReference backHref={routes.admin()} backLabel="Back to admin" />;
  return <AdminCustomerDetail customerId={id} />;
}
