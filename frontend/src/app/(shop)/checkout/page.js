import { buildMetadata } from "@/lib/seo/metadata";
import { CheckoutView } from "@/features/checkout/components/checkout-view.client";

export const metadata = buildMetadata({
  title: "Checkout",
  description: "Complete your eSIM purchase.",
  path: "/checkout",
  index: false, // noindex (crawlable) — transactional (blueprint §11, §28.4)
});

export default function CheckoutPage() {
  return <CheckoutView />;
}
