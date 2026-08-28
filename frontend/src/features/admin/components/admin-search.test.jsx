// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSearch } from "@/features/admin/components/admin-search.client";

/**
 * The global search box.
 *
 * Support is handed whatever identifier the customer quoted and had to guess which tab
 * it belonged to before searching — guessing wrong looks exactly like "we have no record
 * of you". So the behaviour that matters is that ONE box covers all three kinds, and
 * that a miss says so plainly instead of rendering nothing.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const results = (overrides) => ({
  query: "test",
  orders: [],
  customers: [],
  esims: [],
  ...overrides,
});

function mockApi(body) {
  globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(body)));
}

const urls = () => globalThis.fetch.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

async function search(term) {
  await userEvent.type(screen.getByLabelText(/order number, email/i), term);
  await userEvent.click(screen.getByRole("button", { name: /^search$/i }));
}

describe("one box, three kinds", () => {
  it("finds an order", async () => {
    mockApi(results({
      orders: [{ id: "o1", order_number: "ESF-ABC", customer_email: "a@b.com", payment_status: "paid" }],
    }));
    render(<AdminSearch />);
    await search("ESF-ABC");
    expect(await screen.findByText("ESF-ABC")).toBeTruthy();
  });

  it("finds a customer", async () => {
    mockApi(results({ customers: [{ id: "u1", email: "buyer@example.com", name: "Dana" }] }));
    render(<AdminSearch />);
    await search("buyer@example.com");
    expect(await screen.findByText("buyer@example.com")).toBeTruthy();
  });

  it("finds an eSIM by the last four of its ICCID", async () => {
    mockApi(results({
      esims: [{ id: "e1", iccid_last4: "7510", order_number: "ESF-XYZ", status: "ready" }],
    }));
    render(<AdminSearch />);
    await search("7510");
    expect(await screen.findByText(/••••7510/)).toBeTruthy();
  });
});

describe("not finding things", () => {
  /** Rendering nothing is indistinguishable from the page being broken. */
  it("says plainly that all three were checked", async () => {
    mockApi(results({ query: "nobody" }));
    render(<AdminSearch />);
    await search("nobody");
    expect(await screen.findByText(/orders, customers and esims were all checked/i)).toBeTruthy();
  });

  it("refuses a term too short to mean anything, without calling the server", async () => {
    mockApi(results());
    render(<AdminSearch />);
    await search("ab");
    expect(await screen.findByText(/at least three characters/i)).toBeTruthy();
    expect(urls().length).toBe(0);
  });
});
