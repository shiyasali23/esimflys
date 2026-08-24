import Image from "next/image";
import Link from "next/link";
import home from "@/content/home.json";

/*
 * No `sizes` props on the images below, deliberately.
 *
 * `output: "export"` forces `images.unoptimized: true`, and unoptimized next/image emits
 * no srcset — verified: zero `srcset` occurrences in the emitted HTML before the hero was
 * converted. With no candidate set to choose from, `sizes` is inert, and leaving it in
 * implied responsive images that did not exist.
 *
 * These two are cheap (36 KB and 25 KB) and only one is shown per breakpoint, so neither
 * justifies the hand-written srcset the hero needed. If that changes, follow the pattern
 * in `hero.jsx`: variants plus a plain <img> with srcset AND a matching preload.
 */
export function WhatIsEsim() {
  const { whatIsEsim: w } = home;
  return (
    <section className="bg-muted">
      <div className="relative mx-auto hidden max-w-6xl lg:block">
        <Image
          src="/images/what-is-esim.webp"
          alt="Travel eSIM journey — a suitcase and phone at departure linked by a flight path to a city skyline and a connected phone on arrival."
          width={1600}
          height={746}
          className="w-full"
        />
        <div className="absolute inset-y-0 left-[45.5%] flex w-[36%] max-w-[430px] -translate-x-1/2 items-center">
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold uppercase text-foreground xl:text-4xl">
              {w.title}
            </h2>
            <p className="mt-4 text-muted-foreground">{w.body}</p>
            <Link href={w.href} className="mt-5 inline-block font-semibold text-cta-text hover:underline">
              Learn more about eSIMs →
            </Link>
          </div>
        </div>
      </div>

      {/*
        Left-aligned below `sm`, centred above it.

        Two reasons, and they point the same way. The paragraph runs eight lines on a
        390px screen, and centred copy that long starts every line at a different x, so
        the eye has to re-find the left edge on each one — centring is only free at two or
        three lines, which is what it becomes at `sm`. And every other section heading on
        this page ("Where travelers go", "Buy it. Scan it.") is left-aligned on a phone, so
        this was the only one breaking the column.
      */}
      <div className="mx-auto max-w-xl px-6 py-12 text-left sm:py-16 sm:text-center lg:hidden">
        <h2 className="font-display text-2xl font-bold uppercase text-foreground sm:text-3xl">
          {w.title}
        </h2>
        <p className="mt-4 text-muted-foreground">{w.body}</p>
        <Link
          href={w.href}
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-cta-text hover:underline"
        >
          Learn more about eSIMs →
        </Link>
        {/*
          A media-gated preload plus a lazy <img>, mirroring `hero.jsx` — and it replaces a
          bare next/image `priority`, for a measured reason.

          The problem `priority` was solving is real: next/image defaults to
          `loading="lazy"`, and WebKit's lazy threshold is tight enough that on a real
          iPhone this section painted as a blank box, then alt text, then the image.

          But `priority` emits `<link rel="preload" as="image">` with NO `media` attribute,
          so every DESKTOP visitor downloaded a phone-only image sitting inside `lg:hidden`.
          [MEASURED] desktop Lighthouse at 1350px, production: this file appears in the
          network log as `isLinkPreload: true, transferSize: 25232, statusCode: 200` — 24.6 KB
          fetched to be displayed to nobody.

          The pair below gets both halves right, and it is the inverse of the hero's gating
          because this image is the phone-only one:

            - phones  -> the preload matches, so the bytes are in flight with the document
                         and WebKit never shows the blank box.
            - desktop -> the preload does not match, and a lazy image inside a
                         `display: none` ancestor has no layout box, so it never intersects
                         the viewport and is never requested at all.

          A plain eager <img> cannot express that: Chrome fetches eager images inside
          `display: none` regardless, which is the same trap documented in `hero.jsx`.
        */}
        <link
          rel="preload"
          as="image"
          media="(max-width: 1023px)"
          fetchPriority="high"
          href="/images/what-is-esim-mobile.webp"
        />
        {/*
          eslint-disable-next-line @next/next/no-img-element --
          next/image cannot emit a media-gated preload, and its `priority` prop is precisely
          what caused the desktop waste measured above.
        */}
        <img
          src="/images/what-is-esim-mobile.webp"
          alt="A smartphone showing a Wi-Fi signal in front of a city skyline with an airplane overhead — travel eSIM data on arrival."
          width={640}
          height={576}
          loading="lazy"
          decoding="async"
          className="mx-auto mt-6 w-full max-w-[300px]"
        />
      </div>
    </section>
  );
}
