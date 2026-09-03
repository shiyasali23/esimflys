"use client";
import { useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Star } from "lucide-react";
import reviews from "@/content/reviews.json";

/**
 * Customer reviews on the home page.
 *
 * HISTORY, because it is easy to get this wrong twice. The file shipped carrying a
 * template's note — "Sample reviews shown for layout — replace with your own verified
 * customer reviews before launch" — and every entry had `verified: false`. Read on its
 * own that says the reviews are placeholders, so they were removed. The owner then
 * confirmed they are genuine customers, carried over from the business this site
 * rebrands, and that the note was the template's leftover rather than a statement about
 * the content. They are restored on that basis.
 *
 * The `verified` flag is gone from the data at the owner's instruction. Nothing ever
 * checked it, so a "Verified" badge rendered from it was a claim the page could not
 * support. The conditional below is left in place and simply never fires: if a review
 * platform is wired up later and the flag starts meaning something, it works.
 *
 * The null guard is the part to keep. Fabricated consumer reviews are an offence under
 * the UK DMCC Act 2024, and this is a London company taking card payments — so the
 * section must be able to disappear cleanly rather than render an empty shell, and
 * emptying the file has to be a safe operation.
 */
export function Testimonials() {
  const [ref, embla] = useEmblaCarousel({ loop: true, align: "start", dragFree: true });

  useEffect(() => {
    if (!embla) return;
    const id = setInterval(() => embla.scrollNext(), 3000);
    return () => clearInterval(id);
  }, [embla]);

  if (!reviews.items?.length) return null;

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
