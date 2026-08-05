import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import devices from "@/content/devices.json";

export function CategoryTabs() {
  return (
    <Tabs defaultValue={devices.categories[0].name}>
      <TabsList className="flex flex-wrap">
        {devices.categories.map((c) => (
          <TabsTrigger key={c.name} value={c.name}>
            {c.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {devices.categories.map((c) => (
        <TabsContent key={c.name} value={c.name} forceMount>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.brands.map((b) => (
              <div key={b.brand} className="rounded-card border border-border bg-card p-5">
                <h3 className="font-display text-lg font-semibold uppercase">{b.brand}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.examples}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
