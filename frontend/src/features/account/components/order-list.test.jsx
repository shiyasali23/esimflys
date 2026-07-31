// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OrderList } from "./order-list.client";
import { useSession } from "@/features/auth/use-session.client";
import { ORDER, page } from "@/features/catalog/storefront-fixtures";

/**
 * The customer's own order history.
 *
 * `GET /orders/` is owner-scoped and answers 403 when signed out. That is the
 * ordinary anonymous case, NOT a failure — rendering an error there would tell a
 * guest something is broken when they simply need the lookup page instead.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const USER = { id: "u1", email: "traveller@example.com" };

function mockApi(respond) {
  globalThis.fetch = vi.fn((url) => {
    if (String(url).includes("/account/me/")) return Promise.resolve(jsonResponse(USER));
    return Promise.resolve(respond ? respond() : jsonResponse(page([ORDER])));
  });
}

const signedIn = () => useSession.setState({ user: USER, error: null, loading: false });

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("before the session is known", () => {
  /**
   * The heading renders in every state and the placeholder matches the table's own
   * skeleton, so resolving the session must not shift the page. Layout shift here
   * was a real regression once.
   */
  it("shows the heading and a placeholder rather than nothing", () => {
    mockApi();
    const { container } = render(<OrderList />);

    expect(screen.getByRole("heading", { name: /your orders/i })).toBeTruthy();
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
  });

  it("does not request orders until it knows who is asking", () => {
    mockApi();
    render(<OrderList />);

    const orderCalls = globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes("/orders/"));
    expect(orderCalls).toHaveLength(0);
  });
});

describe("signed out", () => {
  it("invites sign-in instead of reporting an error", () => {
    useSession.setState({ user: null, error: null, loading: false });
    mockApi();
    render(<OrderList />);

    expect(screen.getByText(/sign in to see your orders/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  /** A guest's orders exist — just not here. The route out must be offered. */
  it("points a guest at the lookup page", () => {
    useSession.setState({ user: null, error: null, loading: false });
    mockApi();
    render(<OrderList />);

    const link = screen.getByRole("link", { name: /find a guest order/i });
    expect(link.getAttribute("href")).toBe("/orders/lookup");
  });
});

describe("signed in", () => {
  it("lists the orders with money in major units", async () => {
    signedIn();
    mockApi();
    render(<OrderList />);

    const row = (await screen.findByText("ESF-79039D08EF7C")).closest("tr");
    expect(within(row).getByText("$16.99")).toBeTruthy();
  });

  /** Paid is not delivered — conflating them would mislead about fulfilment. */
  it("shows payment and fulfilment as separate states", async () => {
    signedIn();
    mockApi();
    render(<OrderList />);

    const row = (await screen.findByText("ESF-79039D08EF7C")).closest("tr");
    expect(within(row).getByText(/paid/i)).toBeTruthy();
    expect(within(row).getByText(/delivered/i)).toBeTruthy();
  });

  it("links each order to its own page", async () => {
    signedIn();
    mockApi();
    render(<OrderList />);

    await screen.findByText("ESF-79039D08EF7C");
    const link = screen.getByRole("link", { name: /view/i });
    expect(link.getAttribute("href")).toBe(`/account/orders/${ORDER.id}`);
  });

  it("dashes an unplaced order rather than printing an invalid date", async () => {
    signedIn();
    mockApi(() => jsonResponse(page([{ ...ORDER, placed_at: null }])));
    render(<OrderList />);

    await screen.findByText("ESF-79039D08EF7C");
    expect(document.body.textContent).not.toContain("Invalid Date");
  });

  it("states an empty history rather than showing a bare table", async () => {
    signedIn();
    mockApi(() => jsonResponse(page([])));
    render(<OrderList />);

    expect(await screen.findByText(/no orders/i)).toBeTruthy();
  });

  it("reports a genuine failure as a failure", async () => {
    signedIn();
    mockApi(() => jsonResponse({ error: { code: "internal_error", message: "Upstream down." } }, 500));
    render(<OrderList />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Upstream down.")).toBeTruthy();
  });
});
