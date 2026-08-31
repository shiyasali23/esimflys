"use client";
import Link from "next/link";
import { Price } from "@/components/currency/price";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
      className="group relative flex h-full flex-col overflow-hidden rounded-card border border-border/70 bg-card p-4 shadow-l2 transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-l3 sm:p-5"
    >
      {/*
        A hairline that draws itself along the top edge on hover, left to right.

        `scale-x` on a 2px bar rather than a colour change on the card's own border:
        animating `border-color` repaints the whole 1px ring on every frame and cannot
        be directional. This is one compositor-friendly transform, and it gives the grid
        a single deliberate motion instead of six competing ones.
      */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-primary to-highlight transition-transform duration-300 group-hover:scale-x-100"
      />

      {/*
        The flag sits in its own tinted tile, not loose in the corner.

        An emoji alone renders at whatever size the platform's font decides and reads as
        stray text next to a heading. A fixed tile gives every card the same optical
        weight in the same place, which is what makes a grid of fourteen scan as a set.

        `rounded-md` is 16px here, NOT Tailwind's default 12px — this theme redefines the
        whole radius scale in `@theme`, and `rounded-xl` resolves to 32px, which on a 44px
        tile is a circle. Flags are rectangular; a soft square frames one, a circle crops
        the eye's sense of it.

        Nothing shares this row. The badge used to, and at 320px a 30px flag plus an
        83px pill overflowed the card's right padding and pushed the whole document
        4px wider than the viewport — the home page scrolled sideways. Moving the badge
        under the name retires that whole class of bug rather than tuning around it.
      */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary-container/60 ring-1 ring-inset ring-primary/5 transition-colors group-hover:bg-secondary-container sm:h-11 sm:w-11">
        <CountryFlag country={c} className="text-xl sm:text-2xl" />
      </span>

      <h3 className="mt-3.5 font-display text-base font-semibold uppercase leading-tight text-foreground sm:text-lg">
        {c.name}
      </h3>

      <p className="mt-1 text-sm text-muted-foreground">{c.region}</p>

      {badge ? (
        <span className="mt-2 inline-flex w-fit max-w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-highlight-text">
          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-highlight" />
          <span className="truncate">{badge}</span>
        </span>
      ) : null}

      {/*
        The amount and its unit are kept together, so the line breaks after "from"
        rather than between the price and "day". At 320px a card is 128px wide and this
        line cannot fit on one — it wrapped to "from 0,99 € /" over "day", which reads
        as a broken fraction.
      */}
      {c.perDayFrom ? (
        <p className="mt-auto border-t border-border/70 pt-3 text-sm text-muted-foreground">
          <span className="text-xs">from </span>
          <span className="whitespace-nowrap font-semibold text-cta-text">
            <Price usd={c.perDayFrom} exact />
            <span className="font-medium text-muted-foreground"> / day</span>
          </span>
        </p>
      ) : (
        <span className="mt-auto" />
      )}
    </Link>
  );
}

/**
 * Only `best_value` earns a label.
 *
 * `homepageBadge` also carries "popular", which sat on three of the first five cards —
 * so the thing meant to single a destination out was the most repeated element in the
 * grid, and said nothing once three neighbours wore it too. "Best value" is on two of
 * fourteen, which is rare enough to read as information.
 *
 * Restoring it is one line: `if (c.homepageBadge === "popular") return "Popular";`
 */
function badgeFor(c) {
  return c.homepageBadge === "best_value" ? "Best value" : null;
}

export function WhereTravelersGo({ destinations }) {
  const { whereTravelersGo: w } = home;
  const cards = destinations.map((c) => ({ c, badge: badgeFor(c) }));

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-background via-muted to-background py-14 md:py-20">
      {/*
        Atmosphere built from gradients, never from `filter: blur()`.

        A blurred element is promoted to its own composited layer and forces the
        compositor to rasterize a large surface it must then keep in memory. On this
        10,000px page that was five such layers, and it is the leading explanation for
        the iPhone symptom where scrolling back up showed white until the tiles redrew.
        A radial gradient paints the same soft field with no layer promotion and no
        raster cost — the same substitution the hero already makes.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-24 h-[30rem] w-[30rem] rounded-full"
        style={{ backgroundImage: "radial-gradient(circle, rgb(37 99 235 / 0.08) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-40 h-[34rem] w-[34rem] rounded-full"
        style={{ backgroundImage: "radial-gradient(circle, rgb(249 115 22 / 0.07) 0%, transparent 70%)" }}
      />
      {/*
        A dot lattice, faded out at the edges by a mask so it never ends on a hard line.
        It is what stops the slab reading as flat colour: at 5% it is not a pattern
        anyone notices, only depth they feel behind the cards.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgb(15 23 42 / 0.05) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          maskImage: "radial-gradient(ellipse 80% 60% at 50% 45%, black 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 45%, black 40%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Destinations
          </p>
          <h2 className="mt-2 font-display text-[26px] font-bold uppercase leading-[1.1] sm:text-3xl md:text-4xl">
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
            <p className="rounded-card border border-dashed border-border bg-card/50 p-8 text-center text-muted-foreground">
              Regional bundles are on the way — for now, browse by country.
            </p>
          </TabsContent>
        </Tabs>
        <div className="mt-8">
          <Link
            href={w.cta.href}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cta px-6 text-sm font-semibold text-cta-foreground shadow-l2 transition hover:-translate-y-0.5 hover:shadow-l3 hover:brightness-110"
          >
            {w.cta.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
