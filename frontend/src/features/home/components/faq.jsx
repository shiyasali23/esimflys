import Link from "next/link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import faq from "@/content/faq.json";

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="font-display text-3xl font-bold uppercase md:text-4xl">{faq.title}</h2>
      <p className="mt-4 text-muted-foreground">{faq.subtitle}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Still curious?{" "}
        {faq.stillCurious.map((l, i) => (
          <span key={l.href}>
            {i > 0 ? " · " : ""}
            <Link href={l.href} className="text-cta hover:underline">
              {l.label}
            </Link>
          </span>
        ))}
      </p>
      <Accordion type="single" collapsible className="mt-8">
        {faq.items.map((item, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger>{item.q}</AccordionTrigger>
            <AccordionContent>{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
