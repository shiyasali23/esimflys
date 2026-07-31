import Image from "next/image";
import Link from "next/link";
import { CountryFlag } from "@/components/media/country-flag";
import { HeroSearch } from "./hero-search.client";
import home from "@/content/home.json";

export function Hero({ chips, countries }) {
  const { hero } = home;
  return (
    <section className="relative -mt-20 overflow-x-clip bg-gradient-to-br from-primary via-primary to-[#4a47c4] text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 pb-16 pt-32 md:pb-28 md:pt-44 lg:grid-cols-2">
        <div>
          <h1 className="max-w-3xl font-display text-4xl font-bold uppercase leading-[1.05] sm:text-5xl md:text-6xl">
            {hero.titleLines.map((line) => (
              <span
                key={line}
                className={line === hero.highlightLine ? "block text-highlight" : "block"}
              >
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white">{hero.subtitle}</p>
          <div className="mt-8 flex flex-col items-start gap-5">
            <HeroSearch countries={countries} />
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <Link
                  key={c.slug}
                  href={`/esim/${c.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:bg-white/20"
                >
                  <CountryFlag country={c} /> {c.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <Image
            src="/images/hero-portal.png"
            alt="Circular travel scene — mountains, a city skyline, a beach and a high-speed train framing a smartphone and suitcase, illustrating travel eSIM data on the go."
            width={1040}
            height={958}
            priority
            sizes="(min-width: 1024px) 460px, 300px"
            className="h-auto w-full max-w-[300px] sm:max-w-[360px] lg:max-w-[460px]"
          />
        </div>
      </div>
    </section>
  );
}
