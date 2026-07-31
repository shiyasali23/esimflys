import { notFound } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Price } from "@/components/currency/price";
import { PlanSelector } from "@/features/catalog/components/plan-selector.client";
import { CountryContent } from "@/features/catalog/components/country-content";
import { CountryFaq } from "@/features/catalog/components/country-faq";
import { RelatedCountries } from "@/features/catalog/components/related-countries";
import { RecentlyViewed } from "@/features/catalog/components/recently-viewed.client";
import {
  getCountryBySlug,
  getCountrySlugs,
  getCountryWithNetworks,
  getPerDayFrom,
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
  const { country, plans } = await getCountryWithNetworks(slug);
  if (!country) notFound();

  const clientPlans = toClientPlans(plans);
  const content = getCountryContent(slug);
  const related = (await getPopularCountries(7)).filter((c) => c.slug !== slug).slice(0, 6);
  const perDay = country.priceFrom ?? (await getPerDayFrom(slug));
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
      <Container className="pb-16 pt-4 md:pt-6">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Destinations", href: "/destinations" },
            { name: country.name },
          ]}
        />
        <header className="mb-8 mt-5">
          <h1 className="mb-3 font-display text-display-lg uppercase text-foreground">
            eSIM {country.name}
          </h1>
          <p className="max-w-xl text-body-lg text-muted-foreground">
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
        </header>

        {clientPlans.length ? (
          <>
            <PlanSelector country={country} plans={clientPlans} />
            <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              {CONFIDENCE.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-cta" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
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
