import { buildMetadata } from "@/lib/seo/metadata";
import { OrderLookupView } from "@/features/checkout/components/order-lookup-view.client";

export const metadata = buildMetadata({
  title: "Find my order",
  description: "Look up your eSIMFlys order and activation QR code with your order number and email.",
  path: "/orders/lookup",
  index: false, // noindex (crawlable) — transactional, returns customer data
});

export default function OrderLookupPage() {
  return <OrderLookupView />;
}
