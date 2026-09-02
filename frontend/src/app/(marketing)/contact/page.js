import { Mail, Clock, MapPin } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { ContactForm } from "@/features/support/components/contact-form.client";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/config/site";
import { routes } from "@/config/routes";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "Contact Us",
  description:
    "Reach eSIMFlys support any time, day or night. Email work4estolondon@gmail.com about a plan, an order, or installing your eSIM, or send a message from this page.",
  path: "/contact",
});

export default function ContactPage() {
  const { support, operator } = SITE;

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="mb-4 font-display text-headline-lg uppercase text-foreground">Contact us</h1>
        <p className="mb-8 text-body-lg text-muted-foreground">
          Question about a plan, an order, or installing your eSIM? Send a message below, or email
          us directly. Support runs {support.hours} — travel problems do not keep office hours.
        </p>

        {/*
          Real, reachable details ABOVE the form, not just a form.

          A contact page whose only content is a form asks the visitor to trust a black box:
          there is no address to check, no inbox to reach, and nothing to fall back on if the
          form fails. This page was also the thinnest indexable page on the site, and a form
          contributes no text for search engines or answer engines to read.
        */}
        <div className="mb-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold uppercase text-foreground">
              <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              Email us
            </h2>
            <p className="mt-2 text-body-md text-muted-foreground">
              <a className="text-cta-text hover:underline" href={`mailto:${support.email}`}>
                {support.email}
              </a>
            </p>
            <p className="mt-1 text-body-sm text-muted-foreground">{support.responseTime}</p>
          </div>

          <div className="rounded-card border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold uppercase text-foreground">
              <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              Support hours
            </h2>
            <p className="mt-2 text-body-md text-muted-foreground">
              {support.hours}, including weekends and public holidays.
            </p>
          </div>

          <div className="rounded-card border border-border bg-card p-5 sm:col-span-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold uppercase text-foreground">
              <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              Who you are contacting
            </h2>
            <p className="mt-2 text-body-md text-muted-foreground">
              {SITE.name} is the travel eSIM service of {operator.name}, based in {operator.city},{" "}
              {operator.country}. More about the company is on the{" "}
              <Link href="/about" className="text-cta-text hover:underline">
                about page
              </Link>
              .
            </p>
          </div>
        </div>

        <h2 className="mb-4 font-display text-xl font-semibold uppercase text-foreground">
          Send us a message
        </h2>
        <ContactForm />

        <p className="mt-8 text-body-sm text-muted-foreground">
          Already ordered and need your QR code again? You can{" "}
          <Link href={routes.orderLookup()} className="text-cta-text hover:underline">
            look up your order
          </Link>{" "}
          with your order number and email, or browse the{" "}
          <Link href={routes.help()} className="text-cta-text hover:underline">
            help centre
          </Link>
          .
        </p>
      </Container>
    </Section>
  );
}
