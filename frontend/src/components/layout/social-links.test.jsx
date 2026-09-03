// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * What may be published as a social profile.
 *
 * `sameAs` is a primary input to entity resolution, and a dead, typo'd or http:// profile
 * URL is worse than an absent one: it teaches Google something false about who this
 * company is, and nothing errors — the page renders and the build passes. So the filter
 * is the safety mechanism, and it had no test.
 *
 * The footer and the schema share `publishableProfiles`, so the two can never disagree
 * about which profiles exist.
 */
async function withProfiles(profiles) {
  vi.resetModules();
  vi.doMock("@/content/site.json", () => ({ default: { socialProfiles: profiles } }));
  return import("./social-links");
}

beforeEach(() => vi.resetModules());

const slot = (key, url, extra = {}) => ({ key, label: key, url, ...extra });

describe("which profiles may be published", () => {
  it("publishes a well-formed https profile", async () => {
    const { publishableProfiles } = await withProfiles([
      slot("trustpilot", "https://www.trustpilot.com/review/esimflys.com"),
    ]);
    expect(publishableProfiles()).toHaveLength(1);
  });

  it("rejects http, which is not a profile we would link to", async () => {
    const { publishableProfiles } = await withProfiles([slot("instagram", "http://instagram.com/x")]);
    expect(publishableProfiles()).toEqual([]);
  });

  it("rejects a malformed string rather than throwing", async () => {
    const { publishableProfiles } = await withProfiles([slot("x", "not a url")]);
    expect(publishableProfiles()).toEqual([]);
  });

  it("rejects an empty slot", async () => {
    const { publishableProfiles } = await withProfiles([slot("tiktok", null)]);
    expect(publishableProfiles()).toEqual([]);
  });

  it("keeps only the valid ones from a mixed list", async () => {
    const { publishableProfiles } = await withProfiles([
      slot("trustpilot", "https://www.trustpilot.com/review/esimflys.com"),
      slot("instagram", "http://instagram.com/x"),
      slot("x", "nonsense"),
      slot("youtube", null),
    ]);
    expect(publishableProfiles().map((p) => p.key)).toEqual(["trustpilot"]);
  });
});

describe("the footer block", () => {
  it("renders nothing at all while every slot is empty", async () => {
    const { SocialLinks } = await withProfiles([slot("trustpilot", null), slot("x", null)]);
    const { container } = render(<SocialLinks />);
    expect(container.innerHTML).toBe("");
  });

  it("links out safely and claims the identity", async () => {
    const { SocialLinks } = await withProfiles([
      slot("trustpilot", "https://www.trustpilot.com/review/esimflys.com"),
    ]);
    render(<SocialLinks />);
    const link = screen.getByRole("link", { name: /trustpilot/i });
    expect(link.getAttribute("href")).toBe("https://www.trustpilot.com/review/esimflys.com");
    // `rel="me"` states this profile and this site are the same entity — the convention
    // identity verifiers read. `noopener` because it opens in a new tab.
    expect(link.getAttribute("rel")).toContain("me");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});


/**
 * Icons for platforms this business has no account on.
 *
 * Added on the owner's explicit instruction, after the trade-off was put to them: the
 * design calls for the icons and no real profiles exist yet, so these point at each
 * platform's front door. They are navigation, not identity.
 *
 * The line that must not move is `sameAs`. Claiming instagram.com there asserts this
 * company IS that page — a false statement about the business, made to a search engine,
 * with nothing to flag it. So an unowned slot may render an icon and must never reach
 * the schema, and it carries `nofollow` instead of the `rel="me"` identity claim.
 */
describe("platform links we do not own", () => {
  const unowned = [slot("instagram", "https://www.instagram.com/", { owned: false })];

  it("still renders as a footer icon", async () => {
    const { SocialLinks } = await withProfiles(unowned);
    render(<SocialLinks />);
    expect(screen.getByRole("link", { name: /instagram/i })).toBeTruthy();
  });

  it("is EXCLUDED from sameAs", async () => {
    const { ownedProfiles } = await withProfiles(unowned);
    expect(ownedProfiles()).toEqual([]);
  });

  it("does not claim identity with rel=me", async () => {
    const { SocialLinks } = await withProfiles(unowned);
    render(<SocialLinks />);
    const rel = screen.getByRole("link", { name: /instagram/i }).getAttribute("rel");
    expect(rel).not.toContain("me");
    expect(rel).toContain("nofollow");
    expect(rel).toContain("noopener");
  });

  it("a real profile still reaches sameAs and keeps rel=me", async () => {
    const owned = [slot("trustpilot", "https://www.trustpilot.com/review/esimflys.com")];
    const { ownedProfiles, SocialLinks } = await withProfiles(owned);
    expect(ownedProfiles()).toHaveLength(1);
    render(<SocialLinks />);
    expect(screen.getByRole("link", { name: /trustpilot/i }).getAttribute("rel")).toContain("me");
  });

  it("separates the two in a mixed list", async () => {
    const { publishableProfiles, ownedProfiles } = await withProfiles([
      ...unowned,
      slot("trustpilot", "https://www.trustpilot.com/review/esimflys.com"),
    ]);
    expect(publishableProfiles().map((p) => p.key)).toEqual(["instagram", "trustpilot"]);
    expect(ownedProfiles().map((p) => p.key)).toEqual(["trustpilot"]);
  });
});
