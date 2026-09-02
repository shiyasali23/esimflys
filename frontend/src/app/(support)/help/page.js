import Link from "next/link";
import { Download, Zap, Smartphone, CreditCard, Globe, Activity, Shield, Wrench } from "lucide-react";
import help from "@/content/help.json";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { itemListJsonLd } from "@/lib/seo/jsonld";

export const metadata = buildMetadata({
  title: "Help Center",
  description: "Clear answers for your travel eSIM: installing, activating, device support, billing, coverage, data usage, and troubleshooting — all in one help center.",
  path: "/help",
});

const ICONS = {
  download: Download, bolt: Zap, devices: Smartphone, payments: CreditCard,
  public: Globe, data: Activity, security: Shield, build: Wrench,
};

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      {/* Mirrors the eight category cards below, each of which is a real link in the DOM. */}
      <JsonLd
        data={itemListJsonLd(
          "eSIMFlys help centre categories",
          help.categories.map((c) => ({ name: c.title, path: `/help/${c.slug}` })),
        )}
      />
      <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">{help.hub.title}</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">{help.hub.subtitle}</p>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {help.categories.map((c) => {
          const Icon = ICONS[c.icon] || Smartphone;
          return (
            <Link
              key={c.slug}
              href={`/help/${c.slug}`}
              className="rounded-card border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-l2"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/5 text-primary">
                <Icon size={22} aria-hidden />
              </div>
              <h2 className="font-display text-lg font-semibold uppercase">{c.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
