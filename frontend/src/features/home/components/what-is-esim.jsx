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
          `priority` on the MOBILE image only, and it is a bug fix rather than a tweak.

          next/image defaults every image to `loading="lazy"` unless `priority` is passed.
          Nobody wrote that attribute here — it is the framework default, and it was
          confirmed present in the live HTML.

          On Chrome the lazy threshold is generous enough that the image is already there
          by the time you scroll to it. WebKit's is much tighter, and Chrome on iOS IS
          WebKit, so on a real iPhone over a real connection the section paints as a blank
          box, then the alt text, then finally the image — reported first-hand as "it comes
          purely white and I have to wait".

          The image is 25 KB, it sits inside `lg:hidden` so it only exists on phones, and
          it is the one people actually see. Fetching it with the page instead of on
          approach is worth 25 KB.

          The DESKTOP image above is deliberately left lazy: it lives in `hidden lg:block`,
          so on a phone it has no layout box, never intersects the viewport, and is
          therefore never downloaded at all. Making that one eager would add 36 KB to every
          mobile load for something no phone displays.
        */}
        <Image
          src="/images/what-is-esim-mobile.webp"
          alt="A smartphone showing a Wi-Fi signal in front of a city skyline with an airplane overhead — travel eSIM data on arrival."
          width={640}
          height={576}
          priority
          className="mx-auto mt-6 w-full max-w-[300px]"
        />
      </div>
    </section>
  );
}
