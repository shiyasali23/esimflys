"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Price } from "@/components/currency/price";
import { Search, ArrowRight, Star } from "lucide-react";
import { CountryFlag } from "@/components/media/country-flag";
import { cn } from "@/lib/cn";

function badgeFor(c) {
  if (c.homepageBadge === "popular") return { label: "Popular", className: "fill-highlight text-highlight" };
  if (c.homepageBadge === "best_value") return { label: "Best value", className: "fill-cta-text text-cta-text" };
  return null;
}

function DestinationCard({ c }) {
  const badge = badgeFor(c);
  return (
    <Link
      href={`/esim/${c.slug}`}
      className="group flex min-h-12 w-full items-center gap-2 rounded-full border border-border bg-card py-2 pl-3 pr-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-l2"
    >
      {/*
        Flag, name and badge take the free space; the price and arrow are pinned to the
        right edge. Sized to content, the price landed wherever each country name
        happened to end, so a column of cards had no vertical line to read down.
      */}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <CountryFlag country={c} className="shrink-0 text-xl" />
        <span className="truncate font-display text-sm font-semibold uppercase">{c.name}</span>
        {badge ? (
          <Star className={cn("h-3.5 w-3.5 shrink-0", badge.className)} aria-label={badge.label}>
            <title>{badge.label}</title>
          </Star>
        ) : null}
      </span>
      {c.perDayFrom ? (
        <span className="shrink-0 text-sm font-semibold text-cta-text">
          <Price usd={c.perDayFrom} exact />/d
        </span>
      ) : null}
      <ArrowRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
        aria-hidden
      />
    </Link>
  );
}

export function DestinationsBrowser({ countries }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");

  /*
    Seed the filter from `?q=`, because the site already tells Google that this works.

    `websiteJsonLd()` publishes a SearchAction whose urlTemplate is
    `/destinations?q={search_term_string}` — the sitelinks-searchbox contract. Nothing read
    the parameter, so following that template landed on an unfiltered list: a declared
    capability the site did not have. It is also the obvious entry point for an AI agent
    trying to search the catalogue programmatically.

    Read in an effect rather than via `useSearchParams()` on purpose. This is a static
    export, so there is no server render to match against, and `useSearchParams` would force
    a Suspense boundary purely to obtain something `location.search` already has. The first
    paint shows the full list and the effect narrows it, which is also the correct
    no-JS fallback: every country stays linked and crawlable.
  */
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQ(initial);
  }, []);

  const regions = useMemo(
    () => [...new Set(countries.map((c) => c.region))].sort(),
    [countries],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return countries.filter((c) => {
      const matchesQuery =
        !query || c.name.toLowerCase().includes(query) || c.iso2.toLowerCase().includes(query);
      const matchesRegion = region === "all" || c.region === region;
      return matchesQuery && matchesRegion;
    });
  }, [countries, q, region]);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative shrink-0 sm:w-80">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by country or code (e.g. JP)"
            aria-label="Search destinations"
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-4 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button
            type="button"
            onClick={() => setRegion("all")}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
              region === "all"
                ? "border-cta bg-cta text-cta-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            All regions
          </button>
          {regions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
                region === r
                  ? "border-cta bg-cta text-cta-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        {filtered.length} destination{filtered.length === 1 ? "" : "s"}
        {region !== "all" ? ` in ${region}` : ""}
        {q.trim() ? ` matching “${q.trim()}”` : ""}
      </p>

      {filtered.length ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <DestinationCard key={c.slug} c={c} />
          ))}
        </div>
      ) : (
        <p className="mt-8 rounded-card border border-dashed border-border p-8 text-center text-muted-foreground">
          No destinations match your search.
        </p>
      )}
    </div>
  );
}
