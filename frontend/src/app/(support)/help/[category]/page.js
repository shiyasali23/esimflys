import { notFound } from "next/navigation";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo/jsonld";
import help from "@/content/help.json";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return help.categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }) {
  const { category } = await params;
  const cat = help.categories.find((c) => c.slug === category);
  if (!cat) return {};
  return buildMetadata({
    title: `${cat.title} — Help`,
    description: cat.description,
    path: `/help/${cat.slug}`,
  });
}

export default async function HelpCategoryPage({ params }) {
  const { category } = await params;
  const cat = help.categories.find((c) => c.slug === category);
  if (!cat) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      {/*
        Two nodes, for two different readers. BreadcrumbList is the only one of these that
        still earns a Google SERP feature; FAQPage mirrors the answers below so answer
        engines get them as structured pairs. Both mirror content visible on the page.
      */}
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Help", path: "/help" },
            { name: cat.title, path: `/help/${cat.slug}` },
          ]),
          faqPageJsonLd(cat.articles),
        ]}
      />
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Help", href: "/help" },
          { name: cat.title },
        ]}
      />
      <h1 className="mt-4 font-display text-4xl font-bold uppercase md:text-5xl">{cat.title}</h1>
      <p className="mt-4 text-muted-foreground">{cat.description}</p>
      {/*
        This h2 is not decoration: the accordion emits its questions as h3, so without it
        the page ran h1 -> h3 and skipped a level on all eight help categories.
      */}
      <h2 className="mt-10 font-display text-xl font-semibold uppercase">Common questions</h2>
      <Accordion className="mt-6">
        {cat.articles.map((a, i) => (
          <AccordionItem key={i} name="help-faq">
            <AccordionTrigger>{a.q}</AccordionTrigger>
            <AccordionContent>{a.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
