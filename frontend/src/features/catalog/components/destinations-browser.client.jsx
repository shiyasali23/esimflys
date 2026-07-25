"use client";
import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { CountryFlag } from "@/components/media/country-flag";

function DestinationList({ items }) {
  if (!items.length) {
    return <p className="mt-8 text-muted-foreground">No destinations match your search.</p>;
  }
  return (
    <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => (
        <li key={c.slug}>
          <Link
            href={`/esim/${c.slug}`}
            className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white"
          >
            <span className="flex items-center gap-3">
              <CountryFlag country={c} className="text-xl" />
              <span className="font-medium">{c.name}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {c.region}
              {c.perDayFrom ? ` · from $${c.perDayFrom.toFixed(2)}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DestinationsBrowser({ countries }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? countries.filter(
        (c) =>
          c.name.toLowerCase().includes(query) || c.iso2.toLowerCase().includes(query),
      )
    : countries;

  return (
    <Tabs defaultValue="all">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="country">Country</TabsTrigger>
          <TabsTrigger value="regional">Regional</TabsTrigger>
        </TabsList>
        <div className="sm:w-80">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by country or code (e.g. JP)"
            aria-label="Search destinations"
          />
        </div>
      </div>
      <TabsContent value="all">
        <DestinationList items={filtered} />
      </TabsContent>
      <TabsContent value="country">
        <DestinationList items={filtered} />
      </TabsContent>
      <TabsContent value="regional">
        <p className="mt-6 rounded-card border border-dashed border-border p-8 text-center text-muted-foreground">
          Regional bundles are on the way — for now, browse by country.
        </p>
      </TabsContent>
    </Tabs>
  );
}
