import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { buildMetadata } from "@/lib/seo/metadata";
import { LegalDoc } from "@/features/legal/components/legal-doc";
import { TERMS } from "@/content/legal/terms";
import { REFUND } from "@/content/legal/refund";
import { PRIVACY } from "@/content/legal/privacy";
import { COOKIES } from "@/content/legal/cookies";

const DOCS = {
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  refund: "Refund Policy",
  cookies: "Cookie Policy",
};

const CONTENT = {
  terms: TERMS,
  refund: REFUND,
  privacy: PRIVACY,
  cookies: COOKIES,
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }) {
  const { doc } = await params;
  const title = DOCS[doc];
  if (!title) return {};
  const content = CONTENT[doc];
  const description = content?.subtitle || `${title} for eSIMFlys.`;
  return buildMetadata({ title, description, path: `/legal/${doc}`, index: false });
}

export default async function LegalPage({ params }) {
  const { doc } = await params;
  const title = DOCS[doc];
  if (!title) notFound();

  const content = CONTENT[doc];
  if (content) return <LegalDoc doc={content} />;

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="mb-6 font-display text-headline-lg uppercase text-foreground">{title}</h1>
        <div className="rounded-card border border-border bg-muted p-6 text-body-md text-foreground">
          <p>
            <strong>Placeholder — pending legal review.</strong> This page is intentionally noindexed.
            Real, approved {title.toLowerCase()} must be added before launch (blueprint §38 P3). Do not
            treat this as a binding legal document.
          </p>
        </div>
      </Container>
    </Section>
  );
}
