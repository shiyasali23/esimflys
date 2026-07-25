import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { ContactForm } from "@/features/support/components/contact-form.client";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "Contact Us",
  description: "Questions about a plan, an order, or installing your eSIM? Contact the eSIMFlys support team and we'll help you get connected before and during your trip.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <Section>
      <Container className="max-w-xl">
        <h1 className="mb-4 font-display text-headline-lg uppercase text-foreground">Contact us</h1>
        <p className="mb-8 text-body-lg text-muted-foreground">
          Have a question about a plan, an order, or installation? Send us a message and our support
          team will get back to you.
        </p>
        <ContactForm />
      </Container>
    </Section>
  );
}
