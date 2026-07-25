export function CountryContent({ country, plans, content, intro }) {
  const networks = country.networks || [];

  let items = [];
  if (content) {
    items = [
      { h: `Staying connected in ${country.name}`, p: content.countryContext },
      networks.length ? { h: "Network partners", p: content.networkNotes } : null,
      { h: "Connection details", p: content.connectionDetails },
      { h: "When to activate", p: content.activationNotes },
      { h: `Why choose an eSIM for ${country.name}?`, p: content.whyEsim },
    ].filter((it) => it && it.p);
  }

  if (!items.length) {
    const gbs = plans.filter((p) => !p.isUnlimited && p.data_gb).map((p) => p.data_gb);
    const minGb = gbs.length ? Math.min(...gbs) : null;
    const maxGb = gbs.length ? Math.max(...gbs) : null;
    const maxValidity = Math.max(0, ...plans.map((p) => p.validity_days || 0));

    items = [
      {
        h: "When to activate",
        p: `Install the eSIM while you're still on Wi-Fi at home, then switch it on once you land in ${country.name}. Your allowance doesn't start at checkout — it begins when the eSIM first connects to a local network, so buying a few days ahead costs you nothing.`,
      },
      networks.length
        ? {
            h: "Network partners",
            p: `Across ${country.name}, your eSIMFlys data runs on established local networks — ${networks.join(", ")} — and your phone locks onto whichever gives the strongest signal wherever you are.`,
          }
        : null,
      {
        h: "Connection details",
        p: `Connections use 4G/5G where the local network offers it${minGb ? `, with plans from ${minGb} GB up to ${maxGb} GB` : ""}${maxValidity ? ` and validity of up to ${maxValidity} days` : ""}. That's plenty for maps, messaging, browsing, and internet-based calls while you travel.`,
      },
      {
        h: `Why an eSIM for ${country.name}?`,
        p: `No hunting for an airport SIM kiosk and no shock roaming bill when you get home. Your normal number stays live for calls and texts, your eSIMFlys plan carries the data, and there's no plastic SIM, deposit, or contract to deal with.`,
      },
    ].filter(Boolean);
  }

  if (!intro && !items.length) return null;

  return (
    <section className="mt-16 border-t border-border pt-12">
      <h2 className="font-display text-headline-md uppercase text-foreground">
        About eSIM in {country.name}
      </h2>
      {intro ? <p className="mt-4 max-w-3xl text-body-lg text-muted-foreground">{intro}</p> : null}
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {items.map((it) => (
          <div key={it.h}>
            <h3 className="font-display text-xl font-semibold uppercase">{it.h}</h3>
            <p className="mt-3 text-muted-foreground">{it.p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
