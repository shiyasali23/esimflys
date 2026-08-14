import { notFound } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Price } from "@/components/currency/price";
import { CountryFlag } from "@/components/media/country-flag";
import { PlanSelector } from "@/features/catalog/components/plan-selector.client";
import { CountryContent } from "@/features/catalog/components/country-content";
import { CountryFaq } from "@/features/catalog/components/country-faq";
import { RelatedCountries } from "@/features/catalog/components/related-countries";
import { RecentlyViewed } from "@/features/catalog/components/recently-viewed.client";
import {
  getCountryBySlug,
  getCountrySlugs,
  getPerDayFrom,
  getPlansForCountry,
  getPopularCountries,
} from "@/server/catalog/repository";
import { toClientPlans } from "@/features/catalog/lib/to-client-plan";
import { getCountryContent } from "@/content/countries";
import { breadcrumbJsonLd, countryProductJsonLd, faqPageJsonLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";
import { countryIndexDecision } from "@/config/indexing";
import { routes } from "@/config/routes";

const CONFIDENCE = [
  "QR code emailed to you instantly",
  "Data-only — your number stays",
  "Runs on local 4G/5G networks",
  "No contracts, no deposits",
];

export async function generateStaticParams() {
  return (await getCountrySlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  if (!country) return {};
  const decision = countryIndexDecision(country);
  const content = getCountryContent(slug);
  const perDay = await getPerDayFrom(slug);
  const priceLine = perDay ? ` from $${perDay.toFixed(2)}/day` : "";
  return buildMetadata({
    title: content?.metaTitle || `${country.name} eSIM — Travel Data Plans`,
    description:
      content?.metaDescription ||
      `Buy a prepaid travel eSIM for ${country.name}${priceLine}. Fast 4G/5G data on trusted local networks, install by QR code, skip roaming fees, and keep your number.`,
    path: routes.country(slug),
    index: decision.index,
  });
}

export default async function CountryPage({ params }) {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  if (!country) notFound();

  const plans = await getPlansForCountry(slug);
  const clientPlans = toClientPlans(plans);
  const content = getCountryContent(slug);
  const related = (await getPopularCountries(7)).filter((c) => c.slug !== slug).slice(0, 6);
  const perDay = await getPerDayFrom(slug);
  const introText =
    content?.intro ||
    `Get online the moment you land in ${country.name} with a data-only travel eSIM. Buy it online, scan one QR code to install, and keep your usual number for calls and texts — no physical SIM and no roaming bills.`;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Destinations", path: "/destinations" },
            { name: country.name, path: routes.country(slug) },
          ]),
          countryProductJsonLd(country, plans),
          ...(content?.faqs?.length ? [faqPageJsonLd(content.faqs)] : []),
        ]}
      />
      <Container className="pb-16 pt-3 md:pt-4">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Destinations", href: "/destinations" },
            { name: country.name },
          ]}
        />
        <header className="mb-5 mt-3">
          {/*
            The flag is sized in `em`, so it tracks the heading through the lg step
            instead of needing a second size. 0.7em rather than 1em because an emoji
            occupies the full ascender-to-descender box while the caps beside it do
            not — at 1em it reads as a badge stuck on the end of the words.
          */}
          <h1 className="mb-2 flex flex-wrap items-center gap-x-3 font-display text-display-lg uppercase text-foreground">
            eSIM {country.name}
            <CountryFlag country={country} className="text-[0.7em]" decorative />
          </h1>
        </header>

        {clientPlans.length ? (
          <>
            <PlanSelector
              country={country}
              plans={clientPlans}
              belowPlans={
                /*
                  What the plan actually is, and the four things a shopper checks before
                  committing: how it arrives, whether they keep their number, which
                  network, what commitment.

                  Rendered INSIDE the left column, under the grid, rather than after the
                  whole selector: the summary card beside it is taller than the plans, so
                  the old placement left this stranded below an empty column.

                  The `key` is not decoration. This page is a Server Component and
                  PlanSelector is a Client one, so an element handed over as a prop is
                  reconciled as part of that component's children array — without it React
                  warns "Each child in a list should have a unique key prop" on every plan
                  page. Verified both ways against a clean console.
                */
                <section key="below-plans" className="mt-6 border-t border-border pt-5">
                  <p className="max-w-2xl text-body-lg text-muted-foreground">
                    {perDay ? (
                      <>
                        Prepaid travel data from{" "}
                        <span className="font-semibold text-foreground">
                          <Price usd={perDay} />/day
                        </span>
                        . Install by QR code and keep your number for calls and texts.
                      </>
                    ) : (
                      "Install by QR code and keep your number for calls and texts — no roaming, no physical SIM."
                    )}
                  </p>
                  <ul className="mt-4 grid max-w-2xl gap-x-6 gap-y-2 text-body-sm text-muted-foreground sm:grid-cols-2">
                    {CONFIDENCE.map((c) => (
                      <li key={c} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cta" aria-hidden />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              }
            />
          </>
        ) : (
          <div className="rounded-card border border-border bg-muted p-10 text-center">
            <h2 className="font-display text-headline-md uppercase text-foreground">Plans coming soon</h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              eSIM plans for {country.name} aren&apos;t available right now. Browse other destinations
              or check back shortly.
            </p>
            <Link
              href={routes.destinations()}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-cta px-6 py-3 text-sm font-semibold text-cta-foreground transition hover:brightness-110"
            >
              Browse destinations
            </Link>
          </div>
        )}

        <CountryContent country={country} plans={plans} content={content} intro={introText} />
        <CountryFaq country={country} faqs={content?.faqs} />
        <RelatedCountries countries={related} />
        <RecentlyViewed
          current={{ slug: country.slug, name: country.name, flagEmoji: country.flagEmoji }}
        />
      </Container>
    </>
  );
}
