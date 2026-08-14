import Link from "next/link";
import { Check } from "lucide-react";
import home from "@/content/home.json";

export function CtaBand() {
  const { ctaBand: c } = home;
  return (
    <section className="bg-gradient-to-br from-primary to-[#0f766e] py-20 text-white">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="font-display text-3xl font-bold uppercase md:text-4xl">{c.title}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-white/80">{c.subtitle}</p>
        <div className="mt-8">
          <Link
            href={c.cta.href}
            className="inline-flex rounded-full bg-highlight px-8 py-3.5 font-semibold text-highlight-foreground transition hover:brightness-95"
          >
            {c.cta.label}
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-white/80">
          {c.assurances.map((a) => (
            <span key={a} className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-highlight" aria-hidden />
              {a}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
