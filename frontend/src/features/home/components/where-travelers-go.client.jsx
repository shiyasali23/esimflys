"use client";
import Link from "next/link";
import { Price } from "@/components/currency/price";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CountryFlag } from "@/components/media/country-flag";
import home from "@/content/home.json";

function DestCard({ c, badge }) {
  return (
    /*
      `flex h-full flex-col` with the price on `mt-auto`.

      The grid stretches every card in a row to the same height, but the content was
      top-aligned, so a two-line country name ("United Arab Emirates" wraps at every
      phone width) pushed its own price a line lower than the card beside it. Pinning
      the price to the bottom aligns the figure people are comparing, which is the one
      thing in this grid that has to line up.

    */
    <Link
      href={`/esim/${c.slug}`}
      className="group flex h-full flex-col rounded-card border border-border bg-card p-4 transition-all sm:p-5 hover:-translate-y-1 hover:border-primary/40 hover:shadow-l2"
    >
      {/*
        `gap-2` and `min-w-0`, and a smaller badge below `sm`.

        In a two-column grid a card is 163px wide at 390px and 128px at 320px, against a
        30px flag plus an 83px "POPULAR" pill. `justify-between` with no gap put them
        edge to edge at 390px and overflowed the card's right padding by 15px; at 320px
        the badge escaped the card entirely and pushed the whole document 4px wider than
        the viewport, so the home page scrolled sideways. The smaller badge and the gap
        together leave the pair fitting at both widths.
      */}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <CountryFlag country={c} className="text-2xl sm:text-3xl" />
        {badge ? (
          <Badge tone={badge.tone} className="shrink px-2 py-0.5 text-[10px] tracking-normal sm:px-3 sm:py-1">
            {badge.label}
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-3 font-display text-base font-semibold uppercase leading-tight sm:mt-4 sm:text-lg">
        {c.name}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{c.region}</p>
      {/*
        The amount and its unit are kept together below, so the line breaks after "from"
        rather than between the price and "day". At 320px a card is 128px wide and this
        line cannot fit on one — it wrapped to "from 0,99 € /" over "day", which reads as
        a broken fraction.
      */}
      {c.perDayFrom ? (
        <p className="mt-auto pt-3 text-sm font-semibold text-cta-text">
          from <span className="whitespace-nowrap"><Price usd={c.perDayFrom} exact /> / day</span>
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
    <section className="bg-muted py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="font-display text-[26px] font-bold uppercase leading-[1.1] sm:text-3xl md:text-4xl">
            {w.title}
          </h2>
          <p className="mt-3 text-muted-foreground sm:mt-4">{w.subtitle}</p>
        </div>
        <Tabs defaultValue="country" className="mt-7 md:mt-8">
          <TabsList>
            <TabsTrigger value="country">Country</TabsTrigger>
            <TabsTrigger value="regional">Regional</TabsTrigger>
          </TabsList>
          <TabsContent value="country">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
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
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cta px-6 text-sm font-semibold text-cta-foreground transition hover:brightness-110"
          >
            {w.cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
