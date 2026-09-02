import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { PaymentBadges } from "@/components/media/payment-badges";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/config/site";
import about from "@/content/about.json";

export const metadata = buildMetadata({
  title: "About",
  description:
    "eSIMFlys is the travel eSIM service of 4estolondon, London. Prepaid data-only eSIMs for 68 countries, delivered by QR code, with support around the clock.",
  path: "/about",
});

export default function AboutPage() {
  const { operator, support } = SITE;

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="mb-6 font-display text-headline-lg uppercase text-foreground">
          {about.title}
        </h1>
        <p className="text-body-lg text-muted-foreground">{about.intro}</p>

        <div className="mt-10 space-y-8">
          {about.sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-xl font-semibold uppercase text-foreground">{s.h}</h2>
              <p className="mt-2 text-body-lg text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>

        {/*
          The operator block, and the reason it is on the page rather than only in the legal
          documents: this shop takes card payments on a domain registered in 2026, and a
          visitor deciding whether to trust it has no other way to find out who is behind it.
          Search engines read the same signal — it is the human-readable half of the
          Organization schema in the head.

          Only facts that are known are rendered. The registration number and registered
          office are null in `config/site.js` until the business supplies them, and each row
          simply does not appear until then, rather than showing a placeholder.
        */}
        <section className="mt-12 rounded-card border border-border bg-card p-6">
          <h2 className="font-display text-xl font-semibold uppercase text-foreground">
            Company details
          </h2>
          <dl className="mt-4 grid gap-x-8 gap-y-3 text-body-md sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Trading name</dt>
            <dd className="text-foreground">{SITE.name}</dd>

            <dt className="text-muted-foreground">Operated by</dt>
            <dd className="text-foreground">{operator.name}</dd>

            <dt className="text-muted-foreground">Based in</dt>
            <dd className="text-foreground">
              {operator.city}, {operator.country}
            </dd>

            {operator.streetAddress ? (
              <>
                <dt className="text-muted-foreground">Registered office</dt>
                <dd className="text-foreground">{operator.streetAddress}</dd>
              </>
            ) : null}

            {operator.registrationNumber ? (
              <>
                <dt className="text-muted-foreground">Company number</dt>
                <dd className="text-foreground">{operator.registrationNumber}</dd>
              </>
            ) : null}

            <dt className="text-muted-foreground">Support</dt>
            <dd className="text-foreground">
              <a className="text-cta-text hover:underline" href={`mailto:${support.email}`}>
                {support.email}
              </a>{" "}
              · {support.hours}
            </dd>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold uppercase text-foreground">
            How you can pay
          </h2>
          <PaymentBadges className="mt-4" />
        </section>

        <div className="mt-10">
          <Button href={about.cta.href} variant="primary" size="md">
            {about.cta.label}
          </Button>
        </div>
      </Container>
    </Section>
  );
}
