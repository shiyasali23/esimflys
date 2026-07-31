import { buildMetadata } from "@/lib/seo/metadata";
import { OrderDetail } from "@/features/account/components/order-detail.client";

export const metadata = buildMetadata({
  title: "Order details",
  description: "Your eSIMFlys order details and receipt.",
  path: "/account/orders",
  index: false, // noindex — authenticated, personal
});

export default async function OrderDetailPage({ params }) {
  const { id } = await params;
  return <OrderDetail orderId={id} />;
}
