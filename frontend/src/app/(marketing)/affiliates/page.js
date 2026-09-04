import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  /* noindex until the programme is real: the page currently says it is being finalised. */
  index: false,
  title: "Affiliates & Partners",
  description: "Partner with eSIMFlys and earn by referring travelers to prepaid travel eSIMs. Built for creators, travel agencies, and communities always on the move.",
  path: "/affiliates",
});

export default function AffiliatesPage() {
  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="mb-6 font-display text-headline-lg uppercase text-foreground">Affiliates & Partners</h1>
        <div className="space-y-5 text-body-lg text-muted-foreground">
          <p>
            Travel creators, agencies, and communities can earn by referring travelers to eSIMFlys.
            If your audience travels, mobile data is something they need on every trip.
          </p>
          <p>
            Our partner program is being finalised. Reach out and we&apos;ll share how it works and how
            you can join.
          </p>
        </div>
        <div className="mt-10">
          <Button href={routes.contact()} variant="primary" size="md">Become a partner</Button>
        </div>
      </Container>
    </Section>
  );
}
