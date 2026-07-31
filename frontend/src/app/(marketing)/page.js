import { Hero } from "@/features/home/components/hero";
import { TrustTicker } from "@/components/layout/trust-ticker";
import { WhatIsEsim } from "@/features/home/components/what-is-esim";
import { WhereTravelersGo } from "@/features/home/components/where-travelers-go.client";
import { TripQuiz } from "@/features/home/components/trip-quiz.client";
import { HowItWorks } from "@/features/home/components/how-it-works";
import { WhyPick } from "@/features/home/components/why-pick";
import { Testimonials } from "@/features/home/components/testimonials.client";
import { CtaBand } from "@/features/home/components/cta-band";
import { StatsBand } from "@/features/home/components/stats-band";
import { Faq } from "@/features/home/components/faq";
import { AppCta } from "@/features/home/components/app-cta";
import { Reveal } from "@/components/motion/reveal.client";
import {
  getAllCountries,
  getFeaturedCountries,
  getHomeDestinations,
} from "@/server/catalog/repository";

export const metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const [destinations, chips, allCountries] = await Promise.all([
    getHomeDestinations(8),
    getFeaturedCountries(4),
    getAllCountries(),
  ]);
  const searchCountries = allCountries.map((c) => ({
    slug: c.slug,
    name: c.name,
    iso2: c.iso2,
    flagEmoji: c.flagEmoji,
    region: c.region,
  }));

  return (
    <>
      <Hero chips={chips} countries={searchCountries} />
      <TrustTicker />
      <Reveal><WhatIsEsim /></Reveal>
      <WhereTravelersGo destinations={destinations} />
      <Reveal><TripQuiz /></Reveal>
      <HowItWorks />
      <Reveal><WhyPick /></Reveal>
      <Testimonials />
      <CtaBand />
      <StatsBand />
      <Reveal><Faq /></Reveal>
      <Reveal><AppCta /></Reveal>
    </>
  );
}
