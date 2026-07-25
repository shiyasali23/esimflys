import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "eSIM Plans for Business",
  description: "Keep your travelling team connected across 60+ countries with prepaid travel eSIMs and no roaming surprises. Ask eSIMFlys about plans for your business.",
  path: "/for-business",
});

export default function ForBusinessPage() {
  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="mb-6 font-display text-headline-lg uppercase text-foreground">eSIMFlys for Business</h1>
        <div className="space-y-5 text-body-lg text-muted-foreground">
          <p>
            Keep your travelling team connected across the 60+ countries we cover. Business travel eSIMs
            mean no surprise roaming bills, no chasing local SIM cards, and one simple way to manage data
            on the road.
          </p>
          <p>
            We&apos;re building tools for teams — bulk ordering, consolidated invoicing, and shared
            management. Get in touch and tell us what your business needs.
          </p>
        </div>
        <div className="mt-10">
          <Button href={routes.contact()} variant="primary" size="md">Contact our team</Button>
        </div>
      </Container>
    </Section>
  );
}
