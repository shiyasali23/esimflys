import { SlidersHorizontal, QrCode, Wifi, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import home from "@/content/home.json";

const STEPS = [
  {
    Icon: SlidersHorizontal,
    badge: "bg-primary text-primary-foreground shadow-[0_12px_28px_-8px_rgba(97,93,229,0.6)]",
    line: "from-primary to-cta",
    label: "text-primary",
  },
  {
    Icon: QrCode,
    badge: "bg-cta text-cta-foreground shadow-[0_12px_28px_-8px_rgba(53,53,255,0.55)]",
    line: "from-cta to-highlight",
    label: "text-cta",
  },
  {
    Icon: Wifi,
    badge: "bg-highlight text-highlight-foreground shadow-[0_12px_30px_-8px_rgba(198,241,53,0.9)]",
    line: "from-highlight to-highlight",
    label: "text-highlight-foreground",
  },
];

export function HowItWorks() {
  const { howItWorks: h } = home;
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-muted py-16 md:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-primary/10 blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-highlight/25 blur-[110px]"
      />
      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-label-caps uppercase text-white shadow-[0_6px_18px_-6px_rgba(10,10,10,0.5)]">
              <span className="h-1.5 w-1.5 rounded-full bg-highlight" aria-hidden />
              {h.eyebrow}
            </span>
            <h2 className="mt-6 font-display text-3xl font-bold uppercase leading-[1.05] sm:text-4xl lg:text-5xl">
              {h.title}
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
              {h.subtitle}
            </p>
            <ul className="mt-8 space-y-3.5">
              {h.features.map((f) => (
                <li key={f} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-highlight text-highlight-foreground">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  <span className="text-[15px] font-medium">{f}</span>
                </li>
              ))}
            </ul>
            <Button
              href={h.cta.href}
              variant="cta"
              size="lg"
              className="group mt-9 shadow-lg shadow-cta/25"
            >
              {h.cta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Button>
          </div>

          <ol className="relative space-y-8">
            {h.steps.map((st, i) => {
              const s = STEPS[i];
              const Icon = s.Icon;
              const isFirst = i === 0;
              const isLast = i === h.steps.length - 1;
              return (
                <li key={st.n} className="relative flex gap-5">
                  <div className="relative flex w-14 shrink-0 items-center justify-center">
                    <div
                      aria-hidden
                      className={cn(
                        "absolute left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b",
                        isFirst ? "top-1/2 -bottom-4" : isLast ? "-top-4 bottom-1/2" : "-top-4 -bottom-4",
                        s.line,
                      )}
                    />
                    <div
                      className={cn(
                        "relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl",
                        s.badge,
                      )}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </div>
                  </div>
                  <div className="flex-1 rounded-card bg-card p-6 shadow-[0_4px_24px_-10px_rgba(20,20,60,0.15)] ring-1 ring-black/[0.04] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_-16px_rgba(97,93,229,0.3)]">
                    <div className="flex items-center gap-2">
                      <span className={cn("shrink-0 whitespace-nowrap font-display text-sm font-bold", s.label)}>
                        STEP {st.n}
                      </span>
                      <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                      <span className="text-label-caps uppercase text-muted-foreground">{st.kicker}</span>
                    </div>
                    <h3 className="mt-2 font-display text-xl font-semibold uppercase">{st.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{st.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
