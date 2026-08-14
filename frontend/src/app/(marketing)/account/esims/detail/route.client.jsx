"use client";
import { useSearchParams } from "next/navigation";
import { EsimDetail } from "@/features/account/components/esim-detail.client";
import { MissingReference } from "@/components/feedback/missing-reference";
import { routes } from "@/config/routes";

export function EsimDetailRoute() {
  const esimId = useSearchParams().get("id");
  if (!esimId) {
    return <MissingReference backHref={routes.accountEsims()} backLabel="Back to my eSIMs" />;
  }
  return <EsimDetail esimId={esimId} />;
}
