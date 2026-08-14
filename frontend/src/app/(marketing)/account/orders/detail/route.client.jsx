"use client";
import { useSearchParams } from "next/navigation";
import { OrderDetail } from "@/features/account/components/order-detail.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function OrderDetailRoute() {
  const orderId = useSearchParams().get("id");
  if (!orderId) {
    return <MissingReference backHref={routes.accountOrders()} backLabel="Back to my orders" />;
  }
  return <OrderDetail orderId={orderId} />;
}
