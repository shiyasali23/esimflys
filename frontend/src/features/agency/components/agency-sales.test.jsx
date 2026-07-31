// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgencySales } from "@/features/agency/components/agency-sales.client";

/**
 * A regression lock on the platform's core privacy rule.
 *
 * A referral order belongs to the PLATFORM's customer, who merely used the
 * agency's code. The sales payload therefore carries no `customer_email` — not
 * masked, absent — and the agency panel must never grow a customer column.
 *
 * The risk isn't that today's code is wrong; it's that a future change adds an
 * innocuous-looking column and quietly turns a privacy boundary into a leak. So
 * the assertions here are deliberately about ABSENCE.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SALES = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: "7a38968d",
      order_number: "ESF-FC3B3AAD47AD",
      currency: "USD",
      total_minor: 3398,
      status: "fulfilled",
      payment_status: "paid",
      placed_at: "2026-07-29T17:56:40Z",
      promo_code_snapshot: "SUNRISE20",
      commission_minor: 679,
      commission_status: "paid",
    },
  ],
};

beforeEach(() => {
  globalThis.fetch = vi.fn();
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("the privacy boundary", () => {
  it("has no customer, email or buyer column", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(SALES));
    render(<AgencySales orgId="org-1" />);
    await screen.findByText("ESF-FC3B3AAD47AD");

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent.toLowerCase());
    for (const forbidden of ["customer", "email", "buyer", "name"]) {
      expect(headers.some((h) => h.includes(forbidden))).toBe(false);
    }
  });

  it("renders no email address even if the API ever starts sending one", async () => {
    // Deliberately feeding a field the contract says cannot exist: if the backend
    // regresses, the UI must still not surface it.
    globalThis.fetch.mockResolvedValue(
      jsonResponse({
        ...SALES,
        results: [{ ...SALES.results[0], customer_email: "traveller@example.com" }],
      }),
    );
    render(<AgencySales orgId="org-1" />);
    await screen.findByText("ESF-FC3B3AAD47AD");
    expect(document.body.textContent).not.toContain("traveller@example.com");
    expect(document.body.textContent).not.toMatch(/@example\.com/);
  });
});

describe("what it does show", () => {
  it("shows the order, its value and the commission earned", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(SALES));
    render(<AgencySales orgId="org-1" />);
    await screen.findByText("ESF-FC3B3AAD47AD");
    expect(screen.getAllByText("$33.98").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$6.79").length).toBeGreaterThan(0);
  });

  it("shows the tracking code that attributed the sale", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(SALES));
    render(<AgencySales orgId="org-1" />);
    expect(await screen.findByText("SUNRISE20")).toBeTruthy();
  });

  it("explains an empty result rather than showing a bare table", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({ count: 0, next: null, previous: null, results: [] }));
    render(<AgencySales orgId="org-1" />);
    expect(await screen.findByText(/no attributed sales yet/i)).toBeTruthy();
  });

  it("surfaces a load failure with the server's own message", async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ error: { code: "internal_error", message: "Reporting is unavailable." } }, 500),
    );
    render(<AgencySales orgId="org-1" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Reporting is unavailable.")).toBeTruthy();
  });
});
