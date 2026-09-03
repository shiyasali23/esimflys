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

const slot = (key, url) => ({ key, label: key, url });

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
