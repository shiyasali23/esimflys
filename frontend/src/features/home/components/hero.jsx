import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CountryFlag } from "@/components/media/country-flag";
import { HeroSearch } from "./hero-search.client";
import home from "@/content/home.json";

export function Hero({ chips, countries }) {
  const { hero } = home;
  return (
    <section className="relative -mt-20 overflow-x-clip bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-primary/10 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-cta/10 blur-[120px]"
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
            <div className="relative flex justify-center lg:justify-end">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 m-auto h-[85%] w-[85%] rounded-full bg-gradient-to-br from-primary/15 via-highlight/10 to-cta/15 blur-[70px]"
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
              <link
                rel="preload"
                as="image"
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/hero-portal-900.webp"
                srcSet="/images/hero-portal-600.webp 600w, /images/hero-portal-900.webp 900w, /images/hero-portal.webp 1040w"
                sizes="(min-width: 1024px) 460px, (min-width: 640px) 360px, 300px"
                alt="Circular travel scene — mountains, a city skyline, a beach and a high-speed train framing a smartphone and suitcase, illustrating travel eSIM data on the go."
                width={1040}
                height={958}
                fetchPriority="high"
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
