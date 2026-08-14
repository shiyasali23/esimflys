import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo/metadata";
import { EsimDetailRoute } from "./route.client";

export const metadata = buildMetadata({
  title: "eSIM details",
  description: "Your eSIM activation details and remaining data.",
  path: "/account/esims",
  index: false, // noindex — returns activation credentials
});

/*
 * The eSIM id arrives in `?id=` and is therefore only readable on the client, so the
 * body is wrapped in Suspense — `useSearchParams` suspends during the static
 * prerender, and without a boundary that failure propagates to the whole route.
 */
export default function EsimDetailPage() {
  return (
    <Suspense fallback={null}>
      <EsimDetailRoute />
    </Suspense>
  );
}
