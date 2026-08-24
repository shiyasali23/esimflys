import Link from "next/link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { faqPageJsonLd } from "@/lib/seo/jsonld";
import faq from "@/content/faq.json";

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-4xl px-6 py-20">
      {/*
        FAQPage mirrors the accordion below, exactly as the country pages already do.
        It earns no Google rich result — that feature was retired on 2026-05-07 — so this
        is here purely so answer engines can read the pairs as structured Q&A rather than
        having to infer them from prose. The <details> markup is what serves Google.
      */}
      <JsonLd data={faqPageJsonLd(faq.items)} />
      <h2 className="font-display text-3xl font-bold uppercase md:text-4xl">{faq.title}</h2>
      <p className="mt-4 text-muted-foreground">{faq.subtitle}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Still curious?{" "}
        {faq.stillCurious.map((l, i) => (
          <span key={l.href}>
            {i > 0 ? " · " : ""}
            <Link href={l.href} className="text-cta-text hover:underline">
              {l.label}
            </Link>
          </span>
        ))}
      </p>
      <Accordion className="mt-8">
        {faq.items.map((item, i) => (
          <AccordionItem key={i} name="home-faq">
            <AccordionTrigger>{item.q}</AccordionTrigger>
            <AccordionContent>{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
