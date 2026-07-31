import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo/metadata";
import { Container } from "@/components/ui/container";
import { PaymentView } from "@/features/checkout/components/payment-view.client";

export const metadata = buildMetadata({
  title: "Payment",
  description: "Secure payment.",
  path: "/checkout/payment",
  index: false,
});

/**
 * PaymentView reads the order id from the query string, and `useSearchParams`
 * cannot be prerendered without a Suspense boundary — without this the route
 * fails the production build outright.
 */
export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <Container className="py-12">
          <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-lg bg-muted" aria-busy="true" />
        </Container>
      }
    >
      <PaymentView />
    </Suspense>
  );
}
