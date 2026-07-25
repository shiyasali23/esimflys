import site from "@/content/site.json";

export function StatsBand() {
  return (
    <section className="bg-primary py-14 text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
        {site.stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="font-display text-4xl font-bold">{s.value}</div>
            <div className="mt-1 text-sm text-white">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
