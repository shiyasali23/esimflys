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
      {/*
        ONE copy of the heading and body, positioned differently per breakpoint.

        This used to be two sibling blocks — `hidden lg:block` and `lg:hidden` — each
        rendering the same `w.title` and `w.body`. Both were in the DOM on every device, so
        the home page shipped the section's entire copy twice and carried a duplicate
        <h2>What is an eSIM?</h2> in its outline. Verified in the emitted HTML.

        The two layouts really are different — on a wide screen the text is overlaid on the
        illustration at a tuned position, on a phone it sits above a separate image — so the
        difference is expressed as responsive classes on one element rather than by
        duplicating the markup. The images stay separate because they are different assets,
        each gated to the breakpoint that displays it.
      */}
      <div className="relative mx-auto max-w-6xl">
        <Image
          src="/images/what-is-esim.webp"
          alt="Travel eSIM journey — a suitcase and phone at departure linked by a flight path to a city skyline and a connected phone on arrival."
          width={1600}
          height={746}
          className="hidden w-full lg:block"
        />

        {/*
          Left-aligned below `sm`, centred above it. The paragraph runs eight lines on a
          390px screen, and centred copy that long starts every line at a different x, so the
          eye has to re-find the left edge on each one — centring is only free at two or three
          lines, which is what it becomes at `sm`. Every other section heading on this page is
          left-aligned on a phone, so this was the only one breaking the column.
        */}
        <div className="mx-auto max-w-xl px-6 py-12 text-left sm:py-16 sm:text-center lg:absolute lg:inset-y-0 lg:left-[45.5%] lg:flex lg:w-[36%] lg:max-w-[430px] lg:-translate-x-1/2 lg:items-center lg:px-0 lg:py-0 lg:text-center">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase text-foreground sm:text-3xl xl:text-4xl">
              {w.title}
            </h2>
            <p className="mt-4 text-muted-foreground">{w.body}</p>
            <Link
              href={w.href}
              className="mt-4 inline-flex min-h-11 items-center font-semibold text-cta-text hover:underline lg:mt-5"
            >
              Learn more about eSIMs →
            </Link>
            {/*
              Phone-only image. The preload is media-gated to match: without the `media`
              attribute next/image's `priority` fetched this 25 KB file on every desktop load
              for something inside `lg:hidden`. A lazy <img> inside a hidden ancestor never
              intersects the viewport, so desktop never requests it at all.
            */}
            <link
              rel="preload"
              as="image"
              media="(max-width: 1023px)"
              fetchPriority="high"
              href="/images/what-is-esim-mobile.webp"
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot emit a media-gated preload. */}
            <img
              src="/images/what-is-esim-mobile.webp"
              alt="A smartphone showing a Wi-Fi signal in front of a city skyline with an airplane overhead — travel eSIM data on arrival."
              width={640}
              height={576}
              loading="lazy"
              decoding="async"
              className="mx-auto mt-6 w-full max-w-[300px] lg:hidden"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
