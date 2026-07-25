import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";
import { SITE } from "@/config/site";

export const metadata = buildMetadata({
  title: "About",
  description: "eSIMFlys sells prepaid, data-only travel eSIMs for 60+ countries. Get online the moment you land — no physical SIM, no roaming bills, keep your number.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="mb-6 font-display text-headline-lg uppercase text-foreground">About eSIMFlys</h1>
        <div className="space-y-5 text-body-lg text-muted-foreground">
          <p>
            eSIMFlys is a travel-connectivity store. We sell prepaid, data-only eSIM plans that get you
            online the moment you land — with no physical SIM to collect, no roaming bills, and no need
            to change your everyday number.
          </p>
          <p>
            Choose a destination from {SITE.countryCount} countries, pick a plan by data amount and
            validity, and get your eSIM QR code by email — ready to install in minutes.
          </p>
          <p>
            Prices are shown per plan in US dollars, with your local currency for reference, so you know
            the cost before you buy. Check out as a guest, or create an account to re-download your eSIMs
            and reorder faster.
          </p>
          <p>
            Our goal is simple: make staying connected abroad fast, transparent, and fairly priced.
          </p>
        </div>
        <div className="mt-10">
          <Button href={routes.destinations()} variant="primary" size="md">Explore destinations</Button>
        </div>
      </Container>
    </Section>
  );
}
