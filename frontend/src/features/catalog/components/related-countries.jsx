import Link from "next/link";
import { CountryFlag } from "@/components/media/country-flag";

export function RelatedCountries({ countries }) {
  if (!countries.length) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-xl font-semibold uppercase">Continue your trip</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {countries.map((c) => (
          <Link
            key={c.slug}
            href={`/esim/${c.slug}`}
            className="flex items-center gap-2 rounded-card border border-border p-3 text-sm transition-colors hover:border-primary/40"
          >
            <CountryFlag country={c} className="text-xl" /> {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
