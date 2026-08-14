import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo/metadata";
import { OrderDetailRoute } from "./route.client";

export const metadata = buildMetadata({
  title: "Order details",
  description: "Your eSIMFlys order details and receipt.",
  path: "/account/orders",
  index: false, // noindex — authenticated, personal
});

export default function OrderDetailPage() {
  return (
    <Suspense fallback={null}>
      <OrderDetailRoute />
    </Suspense>
  );
}
