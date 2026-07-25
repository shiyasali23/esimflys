import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";

function Inline({ content }) {
  const spans = Array.isArray(content) ? content : [content];
  return spans.map((span, i) => {
    if (typeof span === "string") return span;
    const external = span.href.startsWith("mailto:") || span.href.startsWith("http");
    if (external) {
      return (
        <a key={i} href={span.href} className="font-medium text-primary hover:underline">
          {span.label}
        </a>
      );
    }
    return (
      <Link key={i} href={span.href} className="font-medium text-primary hover:underline">
        {span.label}
      </Link>
    );
  });
}

function Block({ block }) {
  if (block.ul) {
    return (
      <ul className="list-disc space-y-2 pl-6 text-body-md leading-relaxed text-secondary-foreground marker:text-muted-foreground">
        {block.ul.map((item, i) => (
          <li key={i}>
            <Inline content={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-body-md leading-relaxed text-secondary-foreground">
      <Inline content={block.p} />
    </p>
  );
}

export function LegalDoc({ doc }) {
  return (
    <Section className="py-12 md:py-16">
      <Container>
        <header className="max-w-3xl">
          <h1 className="font-display text-display-lg text-foreground">{doc.title}</h1>
          {doc.subtitle ? (
            <p className="mt-4 text-body-lg text-muted-foreground">{doc.subtitle}</p>
          ) : null}
        </header>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:mt-16 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="On this page" className="self-start lg:sticky lg:top-24">
            <p className="mb-4 text-label-caps uppercase text-muted-foreground">On this page</p>
            <ul className="space-y-1 border-l border-border">
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1.5 pl-4 text-body-sm text-muted-foreground hover:border-primary hover:text-foreground"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-3xl space-y-14">
            {doc.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 space-y-4">
                <h2 className="font-display text-2xl text-foreground md:text-3xl">{section.title}</h2>
                {section.body.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </section>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
