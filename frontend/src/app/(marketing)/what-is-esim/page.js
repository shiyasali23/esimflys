import { Button } from "@/components/ui/button";
import content from "@/content/what-is-esim.json";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { techArticleJsonLd } from "@/lib/seo/jsonld";

export const metadata = buildMetadata({
  title: "What is an eSIM?",
  description:
    "An eSIM is a digital SIM built into your device — buy a data plan online, scan a QR code, and connect abroad without roaming fees or a physical SIM.",
  path: "/what-is-esim",
});

export default function WhatIsEsimPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <JsonLd
        data={techArticleJsonLd({
          title: content.title,
          description: content.intro,
          path: "/what-is-esim",
          // Real last-change date of content/what-is-esim.json, from version control.
          dateModified: "2026-07-25",
        })}
      />
      <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">{content.title}</h1>
      <p className="mt-6 text-lg text-muted-foreground">{content.intro}</p>
      <div className="mt-10 space-y-8">
        {content.sections.map((s) => (
          <section key={s.h}>
            <h2 className="font-display text-xl font-semibold uppercase">{s.h}</h2>
            <p className="mt-2 text-muted-foreground">{s.p}</p>
          </section>
        ))}
      </div>
      <div className="mt-10">
        <Button href={content.cta.href} variant="cta" size="lg">
          {content.cta.label}
        </Button>
      </div>
    </div>
  );
}
