import Image from "next/image";
import Link from "next/link";
import home from "@/content/home.json";

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
          sizes="(min-width: 1152px) 1152px, 100vw"
          className="w-full"
        />
        <div className="absolute inset-y-0 left-[45.5%] flex w-[36%] max-w-[430px] -translate-x-1/2 items-center">
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold uppercase text-foreground xl:text-4xl">
              {w.title}
            </h2>
            <p className="mt-4 text-muted-foreground">{w.body}</p>
            <Link href={w.href} className="mt-5 inline-block font-semibold text-cta hover:underline">
              Learn more about eSIMs →
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-6 py-16 text-center lg:hidden">
        <h2 className="font-display text-2xl font-bold uppercase text-foreground sm:text-3xl">
          {w.title}
        </h2>
        <p className="mt-4 text-muted-foreground">{w.body}</p>
        <Link href={w.href} className="mt-5 inline-block font-semibold text-cta hover:underline">
          Learn more about eSIMs →
        </Link>
        <Image
          src="/images/what-is-esim-mobile.webp"
          alt="A smartphone showing a Wi-Fi signal in front of a city skyline with an airplane overhead — travel eSIM data on arrival."
          width={640}
          height={576}
          sizes="300px"
          className="mx-auto mt-6 w-full max-w-[300px]"
        />
      </div>
    </section>
  );
}
