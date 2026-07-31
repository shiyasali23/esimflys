import { DestinationsBrowser } from "@/features/catalog/components/destinations-browser.client";
import { getAllDestinations } from "@/server/catalog/repository";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/config/site";

export const metadata = buildMetadata({
  title: "Travel eSIM Plans by Country",
  description: `Browse prepaid travel eSIM data plans for ${SITE.countryCount} countries. Fast 4G/5G data at local rates, install by scanning a QR code, skip roaming, keep your number.`,
  path: "/destinations",
});

export default async function DestinationsPage() {
  const countries = await getAllDestinations();

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">
        Stay online in {SITE.countryCount} countries
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Every supported destination, alphabetical and searchable. Tap a country to see plans,
        activation rules, and what to expect on arrival.
      </p>
      <div className="mt-10">
        <DestinationsBrowser countries={countries} />
      </div>
    </div>
  );
}
