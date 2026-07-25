import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export function CountryFaq({ country, faqs }) {
  const items = faqs?.length
    ? faqs
    : [
    {
      q: `Will my phone work with an eSIM in ${country.name}?`,
      a: `If your phone supports eSIM and isn't carrier-locked, it will work in ${country.name}. Most iPhones from the XS onward, Google Pixel 3 and later, and Samsung Galaxy S20 and newer support eSIM. Dial *#06# and look for an EID number to confirm before you buy.`,
    },
    {
      q: `When does my ${country.name} plan start?`,
      a: `Not when you pay. The validity clock starts when you install the eSIM and it first connects to a network in ${country.name}. Install over Wi-Fi before you leave, keep the line switched off, and turn it on when you arrive so none of your days go to waste.`,
    },
    {
      q: `Can I keep my number while using data in ${country.name}?`,
      a: `Yes. The plan is data-only, so it sits alongside your usual SIM: your home number keeps handling calls and texts while the eSIM carries data in ${country.name}. Switch off data roaming on your primary line to avoid charges from your home carrier.`,
    },
    {
      q: `What if I need more data in ${country.name}?`,
      a: `You can buy another ${country.name} plan whenever you run low — no need to wait for your current one to expire. Some plans also support top-ups; if yours does, you can add data to the eSIM you've already installed instead of setting one up again.`,
    },
  ];

  return (
    <section className="mt-16 border-t border-border pt-12">
      <h2 className="font-display text-2xl font-bold uppercase">{country.name} eSIM — FAQ</h2>
      <Accordion type="single" collapsible className="mt-6">
        {items.map((it, i) => (
          <AccordionItem key={i} value={`c-${i}`}>
            <AccordionTrigger>{it.q}</AccordionTrigger>
            <AccordionContent>{it.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
