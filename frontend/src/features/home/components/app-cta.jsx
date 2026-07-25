import home from "@/content/home.json";

export function AppCta() {
  const { appCta: a } = home;
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="rounded-card border border-border bg-muted p-10 text-center md:p-14">
        <h2 className="font-display text-3xl font-bold uppercase md:text-4xl">{a.title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{a.subtitle}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <span className="rounded-lg border border-border px-5 py-3 text-sm text-muted-foreground">
            App Store · soon
          </span>
          <span className="rounded-lg border border-border px-5 py-3 text-sm text-muted-foreground">
            Google Play · soon
          </span>
        </div>
      </div>
    </section>
  );
}
