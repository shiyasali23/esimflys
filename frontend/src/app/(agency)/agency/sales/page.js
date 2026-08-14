import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo/metadata";
import { AgencySalesRoute } from "./route.client";

export const metadata = buildMetadata({
  title: "Agency sales",
  description: "eSIMFlys agency portal.",
  path: "/agency",
  index: false, // noindex — authenticated partner reporting
});

/*
 * The tenant arrives in `?org=` and the shell itself needs it (name, switcher,
 * membership check), so the whole screen sits inside the Suspense boundary here
 * rather than only the body as on the admin detail pages.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AgencySalesRoute />
    </Suspense>
  );
}
