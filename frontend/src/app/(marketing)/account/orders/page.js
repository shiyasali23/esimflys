import { buildMetadata } from "@/lib/seo/metadata";
import { OrderList } from "@/features/account/components/order-list.client";

export const metadata = buildMetadata({
  title: "Your orders",
  description: "Your eSIMFlys order history.",
  path: "/account/orders",
  index: false, // noindex — authenticated, personal
});

export default function OrdersPage() {
  return <OrderList />;
}
