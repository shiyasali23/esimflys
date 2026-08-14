"use client";
import { useSearchParams } from "next/navigation";
import { AdminOrderDetail } from "@/features/admin/components/admin-order-detail.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function AdminOrderDetailRoute() {
  const id = useSearchParams().get("id");
  if (!id) return <MissingReference backHref={routes.admin()} backLabel="Back to admin" />;
  return <AdminOrderDetail orderId={id} />;
}
