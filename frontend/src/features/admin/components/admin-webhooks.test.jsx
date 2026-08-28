// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminWebhooks } from "@/features/admin/components/admin-webhooks.client";

/**
 * Stripe webhook deliveries.
 *
 * This table recorded every delivery since launch and had no screen. A mismatched
 * STRIPE_WEBHOOK_SECRET meant every delivery was rejected with a 400: two customers
 * paid, the money sat in Stripe, no eSIM was bought, and the panel could count
 * "webhooks rejected" without being able to show one. `signature_valid = false` was the
 * whole explanation and it was already in the database.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const event = (overrides) => ({
  id: "wh-1",
  provider: "stripe",
  external_event_id: "evt_123",
  event_type: "payment_intent.succeeded",
  signature_valid: true,
  status: "processed",
  attempt_count: 1,
  last_error: null,
  received_at: "2026-08-28T10:00:00Z",
  processed_at: "2026-08-28T10:00:01Z",
  created_at: "2026-08-28T10:00:00Z",
  ...overrides,
});

const listBody = (results) => ({ count: results.length, next: null, previous: null, results });

function mockApi(rows = [event()]) {
  globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse(listBody(rows))));
}

const urls = () => globalThis.fetch.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("the signature failure", () => {
  /**
   * Spelled out rather than badged. A rejected signature does not mean one delivery
   * failed — it means the secret does not match the sender, so every delivery is being
   * dropped and no order will ever be fulfilled.
   */
  it("explains what a rejected signature actually means", async () => {
    mockApi([event({ signature_valid: false, status: "rejected" })]);
    render(<AdminWebhooks />);
    expect(await screen.findByText(/webhook secret does not match/i)).toBeTruthy();
  });

  it("does not shout about a valid signature", async () => {
    mockApi();
    render(<AdminWebhooks />);
    expect(await screen.findByText(/^Valid$/)).toBeTruthy();
    expect(screen.queryByText(/does not match/i)).toBeNull();
  });
});

describe("filtering", () => {
  /** On a healthy day this is thousands of uneventful rows. */
  it("defaults to problems only", async () => {
    mockApi();
    render(<AdminWebhooks />);
    await waitFor(() => expect(urls().length).toBeGreaterThan(0));
    expect(urls()[0]).toContain("problems=true");
  });

  it("can show every delivery when asked", async () => {
    mockApi();
    render(<AdminWebhooks />);
    await waitFor(() => expect(urls().length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("checkbox", { name: /problems only/i }));

    await waitFor(() => expect(urls().length).toBeGreaterThan(1));
    expect(urls()[urls().length - 1]).not.toContain("problems=true");
  });
});

describe("reading a failure", () => {
  it("shows the delivery error verbatim", async () => {
    mockApi([event({ status: "failed", last_error: "signature verification failed" })]);
    render(<AdminWebhooks />);
    expect(await screen.findByText(/signature verification failed/i)).toBeTruthy();
  });

  it("says plainly when there is nothing wrong", async () => {
    mockApi([]);
    render(<AdminWebhooks />);
    expect(await screen.findByText(/no webhook problems/i)).toBeTruthy();
  });
});
