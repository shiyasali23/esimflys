"use client";
import Link from "next/link";
import { Price } from "@/components/currency/price";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CountryFlag } from "@/components/media/country-flag";
import home from "@/content/home.json";

function DestCard({ c, badge }) {
  return (
    <Link
      href={`/esim/${c.slug}`}
      className="group rounded-card border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-l2"
    >
      <div className="flex items-start justify-between">
        <CountryFlag country={c} className="text-3xl" />
        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold uppercase">{c.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{c.region}</p>
      {c.perDayFrom ? (
        <p className="mt-3 text-sm font-semibold text-cta">
          from <Price usd={c.perDayFrom} /> / day
        </p>
      ) : null}
    </Link>
  );
}

function badgeFor(c) {
  if (c.homepageBadge === "popular") return { label: "Popular", tone: "highlight" };
  if (c.homepageBadge === "best_value") return { label: "Best value", tone: "essential" };
  return null;
}

export function WhereTravelersGo({ destinations }) {
  const { whereTravelersGo: w } = home;
  const cards = destinations.map((c) => ({ c, badge: badgeFor(c) }));

  return (
    <section className="bg-muted py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-bold uppercase md:text-4xl">{w.title}</h2>
          <p className="mt-4 text-muted-foreground">{w.subtitle}</p>
        </div>
        <Tabs defaultValue="country" className="mt-8">
          <TabsList>
            <TabsTrigger value="country">Country</TabsTrigger>
            <TabsTrigger value="regional">Regional</TabsTrigger>
          </TabsList>
          <TabsContent value="country">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {cards.map(({ c, badge }) => (
                <DestCard key={c.slug} c={c} badge={badge} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="regional">
            <p className="rounded-card border border-dashed border-border p-8 text-center text-muted-foreground">
              Regional bundles are on the way — for now, browse by country.
            </p>
          </TabsContent>
        </Tabs>
        <div className="mt-8">
          <Link
            href={w.cta.href}
            className="inline-flex items-center gap-2 rounded-full bg-cta px-6 py-3 text-sm font-semibold text-cta-foreground transition hover:brightness-110"
          >
            {w.cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
