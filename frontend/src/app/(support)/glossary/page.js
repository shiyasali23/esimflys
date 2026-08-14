import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { JsonLd } from "@/components/seo/json-ld";
import { GLOSSARY_TERMS, groupTermsByLetter } from "@/content/glossary";
import { glossaryJsonLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata = buildMetadata({
  title: "eSIM terms, demystified — Glossary",
  description:
    "A plain-English guide to eSIM and mobile-data terms — APN, EID, ICCID, IMEI, LTE, MNO, MVNO, roaming, VoLTE and VPN — defined clearly for travelers.",
  path: "/glossary",
});

export default function GlossaryPage() {
  const groups = groupTermsByLetter();
  return (
    <>
      <JsonLd data={glossaryJsonLd(GLOSSARY_TERMS)} />
      <Section>
        <Container>
          <h1 className="mb-4 font-display text-headline-lg uppercase text-foreground">
            eSIM terms, demystified
          </h1>
          <p className="mb-12 max-w-2xl text-body-lg text-muted-foreground">
            Traveling with an eSIM comes with a handful of acronyms. Here&apos;s a plain-English
            glossary of the eSIM and mobile-data terms you&apos;ll actually run into.
          </p>
          <div className="space-y-12">
            {groups.map((g) => (
              <section key={g.letter} id={`section-${g.letter}`} className="scroll-mt-24">
                <h2 className="mb-6 border-b border-border pb-2 font-display text-headline-md text-foreground">
                  {g.letter}
                </h2>
                <dl className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {g.terms.map((t) => (
                    <div key={t.id} id={t.id} className="scroll-mt-24 rounded-md border border-border bg-card p-6">
                      <dt className="mb-2 flex items-center gap-2 font-display text-headline-md text-primary">
                        {t.term}
                        {t.badge ? (
                          <Badge tone={t.badge === "Essential" ? "essential" : "highlight"}>
                            {t.badge}
                          </Badge>
                        ) : null}
                      </dt>
                      <dd className="text-body-md text-muted-foreground">{t.definition}</dd>
                      {t.seeAlso?.length ? (
                        <dd className="mt-3 text-body-sm text-muted-foreground">
                          See also:{" "}
                          {t.seeAlso.map((s, i) => (
                            <span key={s}>
                              {i > 0 ? ", " : ""}
                              <a href={`#${s}`} className="text-primary hover:underline">
                                {s.toUpperCase()}
                              </a>
                            </span>
                          ))}
                        </dd>
                      ) : null}
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
