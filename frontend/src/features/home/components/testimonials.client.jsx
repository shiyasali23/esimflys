"use client";
import { useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Star } from "lucide-react";
import reviews from "@/content/reviews.json";

export function Testimonials() {
  const [ref, embla] = useEmblaCarousel({ loop: true, align: "start", dragFree: true });

  useEffect(() => {
    if (!embla) return;
    const id = setInterval(() => embla.scrollNext(), 3000);
    return () => clearInterval(id);
  }, [embla]);

  return (
    <section id="testimonials" className="bg-muted py-20">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-label-caps uppercase text-cta">{reviews.eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-bold uppercase md:text-4xl">{reviews.title}</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">{reviews.subtitle}</p>
      </div>
      <div className="mt-10 overflow-hidden" ref={ref}>
        <div className="flex gap-5 px-6">
          {reviews.items.map((t, i) => (
            <figure
              key={i}
              className="w-[85%] shrink-0 rounded-card border border-border bg-card p-6 sm:w-[380px]"
            >
              <div className="flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-highlight text-highlight" aria-hidden />
                ))}
              </div>
              <blockquote className="mt-4 text-sm leading-relaxed">&ldquo;{t.text}&rdquo;</blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {t.initial}
                </span>
                <span className="text-sm">
                  <span className="font-semibold">{t.name}</span>
                  {t.verified ? <span className="ml-2 text-xs text-cta">Verified</span> : null}
                  <br />
                  <span className="text-muted-foreground">{t.trip}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
