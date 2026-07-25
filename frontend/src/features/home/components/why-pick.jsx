import home from "@/content/home.json";

export function WhyPick() {
  const { whyPick: w } = home;
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl font-bold uppercase md:text-4xl">{w.title}</h2>
        <p className="mt-4 text-muted-foreground">{w.subtitle}</p>
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {w.benefits.map((b) => (
          <div key={b.title} className="rounded-card border border-border bg-card p-6">
            <h3 className="font-display text-lg font-semibold uppercase text-primary">{b.title}</h3>
            <p className="mt-3 text-sm text-muted-foreground">{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
