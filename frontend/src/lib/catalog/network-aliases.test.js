import { describe, it, expect } from "vitest";
import { displayNetworks, withDisplayNetworks, withDisplayNetworkNames } from "@/lib/catalog/network-aliases";
import catalog from "@/data/catalog.json";

describe("displayNetworks", () => {
  it("removes a defunct operator", () => {
    expect(displayNetworks("turkey", ["Türk Telekom 5G", "Aycell 5G", "Vodafone 5G"])).toEqual([
      "Türk Telekom 5G",
      "Vodafone 5G",
    ]);
  });

  it("renames retired brands", () => {
    expect(displayNetworks("united-kingdom", ["O2 5G", "T-Mobile UK 5G", "3 4G"])).toEqual([
      "O2 5G",
      "EE 5G",
      "Three 4G",
    ]);
  });

  it("collapses a merged pair into one entry", () => {
    expect(displayNetworks("indonesia", ["Telkomsel 5G", "XL 4G", "Smartfren 4G"])).toEqual([
      "Telkomsel 5G",
      "XLSmart",
    ]);
  });

  it("applies per-country entries only to that country", () => {
    expect(displayNetworks("malta", ["Vodafone 5G", "GO 5G"])).toEqual(["Epic 5G", "GO 5G"]);
    expect(displayNetworks("qatar", ["ooredoo 5G", "Vodafone 5G"])).toEqual(["ooredoo 5G", "Vodafone 5G"]);
  });

  it("leaves unknown names untouched", () => {
    expect(displayNetworks("thailand", ["AIS 5G"])).toEqual(["AIS 5G"]);
  });

  it("never shows a stale supplier brand for any catalogue country", () => {
    const stale = ["Aycell", "T-Mobile UK", "Telenor", "Tele2", "Wind ", "IAM ", "Telekom.mk", "Smartfren", "XL 4G"];
    for (const c of catalog.countries) {
      const shown = withDisplayNetworks(c).networks.join(" | ");
      for (const s of stale) expect(shown, `${c.slug}: ${shown}`).not.toContain(s);
    }
    for (const p of catalog.plans) {
      const shown = withDisplayNetworkNames(p).networkNames.join(" | ");
      expect(shown).not.toContain("Aycell");
    }
  });
});
