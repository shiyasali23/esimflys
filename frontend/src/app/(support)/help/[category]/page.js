import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
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
      <Link href="/help" className="text-sm text-cta-text hover:underline">
        ← Help center
      </Link>
      <h1 className="mt-4 font-display text-4xl font-bold uppercase md:text-5xl">{cat.title}</h1>
      <p className="mt-4 text-muted-foreground">{cat.description}</p>
      <Accordion type="single" collapsible className="mt-8">
        {cat.articles.map((a, i) => (
          <AccordionItem key={i} value={`a-${i}`}>
            <AccordionTrigger>{a.q}</AccordionTrigger>
            <AccordionContent>{a.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
