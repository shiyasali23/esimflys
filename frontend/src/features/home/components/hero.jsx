import Link from "next/link";
import { Price } from "@/components/currency/price";
import { ShieldCheck } from "lucide-react";
import { CountryFlag } from "@/components/media/country-flag";
import { HeroSearch } from "./hero-search.client";
import home from "@/content/home.json";

export function Hero({ chips, countries }) {
  const { hero } = home;
  return (
    <section className="relative -mt-16 overflow-x-clip bg-background sm:-mt-20">
      {/*
        A radial gradient, not a blurred circle.

        These were five decorative glows across the home page, each a tinted circle with a
        large-radius CSS blur filter (100-120px). `filter: blur()` promotes an element to its
        own composited layer and
        forces the compositor to rasterize a large, expensive surface. On a 10,453 px page
        that is five such layers held in memory at once.

        That is the leading explanation for the symptom reported from a real iPhone:
        scrolling back up shows white, then the content re-appears after a wait. WebKit
        under memory pressure discards rasterized tiles and has to redraw them, and blurred
        layers are among the most expensive things it can be asked to keep.

        A radial gradient renders the same soft coloured halo with no filter, no layer
        promotion and no raster cost. The design is preserved; only the mechanism changes.

        NOT a measured fix. Chrome DevTools showed a frame-time delta of exactly zero when
        these were disabled — but that was Blink on a Mac GPU, and the device with the
        problem is WebKit on an A-series chip, which this tooling cannot reach. If the phone
        reports no improvement, this can be reverted with no loss.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full"
        style={{ backgroundImage: "radial-gradient(circle, rgb(37 99 235 / 0.10) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/3 h-96 w-96 rounded-full"
        style={{ backgroundImage: "radial-gradient(circle, rgb(249 115 22 / 0.10) 0%, transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-6xl px-3 pb-6 pt-16 min-[360px]:px-4 sm:px-6 sm:pt-[4.5rem] md:pb-8 md:pt-24">
        <div className="relative rounded-[2rem] border border-secondary-container bg-gradient-to-br from-secondary-container/50 via-white/80 to-white/80 px-4 py-5 shadow-xl min-[360px]:px-5 min-[360px]:py-6 sm:rounded-[2.5rem] sm:p-8 md:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            {/*
              `min-w-0` is load-bearing, not defensive.

              A grid item defaults to `min-width: auto`, so the column cannot shrink below
              the item's min-content width — and the search box inside it contains a bare
              `<input>`, whose intrinsic contribution is its default `size="20"`, about
              200px. That floor made this column 348px wide inside a 292px card.

              [MEASURED] 390px viewport: the column rendered 348px against a 292px slot, so
              the badge, the h1, the search box and the country chips all ran 56px past the
              card's right padding and were sliced off by the section's `overflow-x-clip`.
              At 320px the overrun is 126px and most of the orange Search button is off the
              screen. Setting `min-width: 0` here collapses the column to 292px and every
              child reflows inside the card.
            */}
            <div className="min-w-0">
              {/*
                Hidden below `sm`. The label is 38 characters of tracked caps that cannot
                fit one line on any phone, so it always wrapped to two — roughly 60px of
                the scarcest space on the page, spent on claims the viewer is about to
                read anyway: "No roaming fees" and "Keep your own number" are the first
                two items in the TrustTicker immediately below, from `content/site.json`.
                Nothing is lost on a phone; the headline and the search box move up.

                From `sm` it returns, and `items-start` + a balanced wrap still matter
                there: with `items-center` the shield centred itself against two lines
                while the greedy wrap left "NUMBER" alone on the second. Balanced, it
                breaks after the separator and the icon sits on the first line, reading
                as a prefix rather than a bullet.
              */}
              <span className="hidden max-w-full items-start gap-2 text-balance rounded-3xl bg-secondary-container px-3.5 py-1.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-on-secondary-container min-[360px]:rounded-full min-[360px]:px-4 min-[360px]:text-label-caps sm:inline-flex">
                <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                No roaming fees · Keep your own number
              </span>
              {/*
                The designed size is `text-4xl` and it holds from 360px up. Below that the
                card interior is 222px, which is narrower than "COUNTRIES." at 36px — the
                headline took seven lines and pushed the search box off the first screen.
                One step down at the narrowest widths, and nothing changes on a normal
                phone.
              */}
              <h1 className="max-w-3xl font-display text-[30px] font-bold uppercase leading-[1.05] text-foreground min-[360px]:text-4xl sm:mt-5 sm:text-5xl md:text-6xl">
                {hero.titleLines.map((line) => (
                  <span
                    key={line}
                    className={
                      line === hero.highlightLine
                        ? "block bg-gradient-to-r from-[#0284c7] via-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent"
                        : "block"
                    }
                  >
                    {line}
                  </span>
                ))}
              </h1>
              {hero.subtitle ? (
                <p className="mt-6 max-w-xl text-lg text-muted-foreground">{hero.subtitle}</p>
              ) : null}
              <div className="mt-7 flex flex-col items-start gap-4 min-[360px]:mt-8 min-[360px]:gap-5">
                <HeroSearch countries={countries} />
                {/*
                  A fixed grid, not a wrapping flex row. Wrapping sized each chip to its
                  own content, so the rows came out ragged and no two column edges lined
                  up. Two columns on a phone and three from `md` gives equal cells and a
                  straight right edge; `HERO_CHIP_COUNT` is six so both fill exactly.

                  [MEASURED] The name and the price CANNOT share a line here, at any
                  viewport. A grid track is a fixed width where the old flex chip sized
                  itself to its content, and the price is the one part that must never be
                  clipped, so it holds its ~55px while the name absorbs the shortfall.
                  At 1440 the cell is 160px and the name was left 37px of it — "Saudi
                  Arabia" needs 85px, so every one of the six truncated. At 375 the cell is
                  134.5px and it is worse.

                  So the price sits on its own line. That buys the name the full cell width
                  and, as a bonus, reads as a price under a label rather than a fragment
                  trailing a clipped country name.

                  The name WRAPS rather than truncating. [MEASURED] at 320px the cell is
                  111px and "Saudi Arabia" needs 85px against 73px available, so with
                  `truncate` it read "Saudi Arab…". A clipped country name is the one thing
                  in this chip a traveller cannot afford to misread, and it is also the
                  failure mode that returns the moment a longer name is added to
                  `FEATURED_SLUGS`. Wrapping degrades to a taller chip instead, which grid
                  absorbs by equalising the row — no overflow at any width, ever.
                */}
                <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-3">
                  {chips.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/esim/${c.slug}`}
                      className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-border bg-muted px-2 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card hover:shadow-l2 sm:px-3"
                    >
                      <span className="flex min-w-0 max-w-full items-center gap-1.5">
                        <CountryFlag country={c} />
                        <span className="min-w-0 text-center">{c.name}</span>
                      </span>
                      {c.perDayFrom ? (
                        <span className="text-xs font-semibold text-primary">
                          <Price usd={c.perDayFrom} exact />/d
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            {/*
              Hidden below `lg`, so the illustration is not downloaded, not painted and not
              an LCP candidate on a phone.

              [MEASURED] /, DPR-2 phone, Slow 4G, cold: LCP 4524 ms with this image as the
              LCP element, against FCP 1012 ms. The headline is already on screen at FCP —
              LCP was being decided by a decorative illustration of which only 144 px of
              276 px was even visible (top y=668 in an 812 px viewport). Its visible area
              scored 43,200 against the headline's 26,284, so it won by a margin the user
              never sees.

              The same image with a warm cache resolved in 1228 ms, which is the proof that
              this was contention, not the image: on a cold load it was sharing the link
              with 335 KB of JS and fonts and getting about a quarter of it.

              Not rendered rather than merely pushed down: phone viewports run 667-932 CSS
              px, so spacing cannot put it below the fold on all of them, and on a tall
              phone a lazy, low-priority image would arrive LATER than it does today —
              worse, not better. `hidden` is the only form that holds on every device.
            */}
            <div className="relative hidden justify-center lg:flex lg:justify-end">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 m-auto h-[85%] w-[85%] rounded-full"
                style={{ backgroundImage: "radial-gradient(circle, rgb(37 99 235 / 0.15) 0%, rgb(14 165 233 / 0.10) 45%, transparent 70%)" }}
              />
              {/*
                A hand-written <img> rather than next/image, and it has to be.

                This is the LCP element of the home page. `output: "export"` forces
                `images.unoptimized: true` (the /_next/image optimiser route does not exist
                without a server), and unoptimized next/image emits NO srcset — verified:
                zero `srcset` occurrences in the entire emitted HTML. The `sizes` prop it
                used to carry was therefore dead code, and every device downloaded the full
                1040x958 / 337 KB original.

                [MEASURED] home page, mobile, Slow 4G, cold: LCP 5380 ms, this image is the
                LCP element, page total 786 KB of which 372 KB is images.

                Re-encoding was tried first and REFUTED: the source is a detailed
                photographic composite with real alpha, so it is inherently ~0.3 bytes/px.
                Quality 60 still weighed 288 KB and visibly degraded (RGB PSNR 33 dB). The
                earlier "12x worse encoded than what-is-esim.webp" reading compared it
                against a flat diagram — different content class, invalid comparison.

                The waste is dimensional. The slot is 300 CSS px on mobile, so a DPR-2 phone
                needs 600x552 and was being sent 1040x958:

                    600x552   126 KB   DPR-2 phone   <- 63% less than today
                    900x828   263 KB   DPR-3 phone, DPR-2 desktop
                    1040x958  337 KB   large / high-DPR desktop (unchanged)

                The explicit preload replaces what `priority` used to emit. It carries
                imageSrcSet/imageSizes so the preload scanner resolves the SAME variant the
                <img> will. A plain `rel=preload href=...` here would eagerly fetch the
                337 KB original on every phone and make this change worse than useless.
                React hoists the link into <head>.

                `src` points at the 900 variant, not the 1040 original: it is only the
                fallback for a browser that ignores srcset, and 900 covers every real
                device without handing that browser the heaviest file.
              */}
              {/*
                `media` is load-bearing, not decoration: a preload without it downloads the
                337 KB image even where the <img> is `display: none`, which would make the
                change above worse than useless. It must stay in step with the `lg:` on the
                container.
              */}
              <link
                rel="preload"
                as="image"
                media="(min-width: 1024px)"
                fetchPriority="high"
                imageSrcSet="/images/hero-portal-600.webp 600w, /images/hero-portal-900.webp 900w, /images/hero-portal.webp 1040w"
                imageSizes="(min-width: 1024px) 460px, (min-width: 640px) 360px, 300px"
              />
              {/*
                eslint-disable-next-line @next/next/no-img-element --
                The rule says <img> "could result in slower LCP". Here the opposite is
                measured: next/image under `unoptimized` emits no srcset, which is what made
                this the 5380 ms LCP element. Suppressed with evidence, not preference.
              */}
              <img
                src="/images/hero-portal-900.webp"
                srcSet="/images/hero-portal-600.webp 600w, /images/hero-portal-900.webp 900w, /images/hero-portal.webp 1040w"
                sizes="(min-width: 1024px) 460px, (min-width: 640px) 360px, 300px"
                alt="Circular travel scene — mountains, a city skyline, a beach and a high-speed train framing a smartphone and suitcase, illustrating travel eSIM data on the go."
                width={1040}
                height={958}
                fetchPriority="high"
                /*
                  `loading="lazy"` is what actually keeps the bytes off phones.
                  [MEASURED] hiding the container alone did NOT: Chrome fetches an <img>
                  inside a `display: none` ancestor regardless, so the first version of this
                  change fixed LCP (4524 -> 1388 ms) while still downloading all 127 KB.
                  A lazy image has no layout box below `lg`, never intersects the viewport,
                  and is therefore never requested. On desktop the media-gated preload above
                  still fetches it at high priority, so `lazy` costs nothing there.
                */
                loading="lazy"
                decoding="async"
                className="relative h-auto w-full max-w-[300px] sm:max-w-[360px] lg:max-w-[460px]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
