import { DestinationsBrowser } from "@/features/catalog/components/destinations-browser.client";
import { getAllDestinations } from "@/server/catalog/repository";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { destinationsItemListJsonLd } from "@/lib/seo/jsonld";
import { SITE } from "@/config/site";

export const metadata = buildMetadata({
  title: "Travel eSIM Plans by Country",
  description: `Browse prepaid travel eSIM data plans for ${SITE.countryCount} countries. Fast 4G/5G data at local rates, install by scanning a QR code, skip roaming, keep your number.`,
  path: "/destinations",
});

export default async function DestinationsPage() {
  const countries = await getAllDestinations();

  return (
    <div className="bg-muted">
      <JsonLd data={destinationsItemListJsonLd(countries)} />
      {/*
        `py-10` below `md`. With the shell's own `pt-20` for the fixed header on top of it,
        `py-16` opened 144px of empty background above the first thing on the page.
      */}
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-16">
        {/* `items-start` so the dot stays on the first line when the label wraps — it
            does at every phone width, on "every region covered". */}
        <span className="inline-flex max-w-full items-start gap-2 text-balance rounded-full bg-foreground px-4 py-2 text-label-caps uppercase text-white">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" aria-hidden />
          {SITE.countryCount} destinations · every region covered
        </span>
        <h1 className="mt-5 font-display text-[32px] font-bold uppercase leading-[1.08] sm:text-4xl md:text-5xl">
          Stay online in {SITE.countryCount} countries
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every supported destination, searchable and filterable by region. Tap a country to see
          plans, activation rules, and what to expect on arrival.
        </p>
        <div className="mt-10">
          <DestinationsBrowser countries={countries} />
        </div>
      </div>
    </div>
  );
}
