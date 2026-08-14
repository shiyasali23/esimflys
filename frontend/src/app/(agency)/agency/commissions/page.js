import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo/metadata";
import { AgencyCommissionsRoute } from "./route.client";

export const metadata = buildMetadata({
  title: "Agency commissions",
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
      <AgencyCommissionsRoute />
    </Suspense>
  );
}
