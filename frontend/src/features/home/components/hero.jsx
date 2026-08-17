import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CountryFlag } from "@/components/media/country-flag";
import { HeroSearch } from "./hero-search.client";
import home from "@/content/home.json";

export function Hero({ chips, countries }) {
  const { hero } = home;
  return (
    <section className="relative -mt-20 overflow-x-clip bg-background">
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
      <div className="relative mx-auto max-w-6xl px-6 pb-6 pt-[4.5rem] md:pb-8 md:pt-24">
        <div className="relative rounded-[2.5rem] border border-secondary-container bg-gradient-to-br from-secondary-container/50 via-white/80 to-white/80 p-6 shadow-xl sm:p-8 md:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary-container px-4 py-1.5 text-label-caps uppercase text-on-secondary-container">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                No roaming fees · Keep your own number
              </span>
              <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold uppercase leading-[1.05] text-foreground sm:text-5xl md:text-6xl">
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
              <div className="mt-8 flex flex-col items-start gap-5">
                <HeroSearch countries={countries} />
                <div className="flex flex-wrap items-center gap-2">
                  {chips.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/esim/${c.slug}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card hover:shadow-l2"
                    >
                      <CountryFlag country={c} /> {c.name}
                      {c.perDayFrom ? (
                        <span className="font-semibold text-primary">
                          ${c.perDayFrom.toFixed(2)}/d
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
