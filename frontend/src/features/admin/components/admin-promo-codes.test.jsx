// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPromoCodes } from "@/features/admin/components/admin-promo-codes.client";

/**
 * Discount codes in the admin panel.
 *
 * The costly mistake this screen can make is a unit error. The column underneath is
 * basis points (10% = 1000) and the operator types a percent; submitting the wrong one
 * is a silent 100x pricing error in whichever direction it lands. So the request body is
 * asserted directly rather than the rendered output.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const promo = (overrides) => ({
  id: "promo-1",
  code: "SAVE10",
  kind: "discount",
  discount_type: "percentage_bps",
  discount_value: 1000,
  percent_off: 10,
  usage_limit: null,
  per_customer_limit: null,
  starts_at: null,
  ends_at: null,
  is_active: true,
  redemption_count: 3,
  created_at: "2026-08-01T00:00:00Z",
  ...overrides,
});

const listBody = (results) => ({ count: results.length, next: null, previous: null, results });

function mockApi({ rows = [promo()], write } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method && init.method !== "GET") {
      return Promise.resolve(write ? write(String(url), init) : jsonResponse(promo(), 201));
    }
    return Promise.resolve(jsonResponse(listBody(rows)));
  });
}

const writes = () =>
  globalThis.fetch.mock.calls.filter((c) => c[1]?.method && c[1].method !== "GET");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  globalThis.fetch = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("listing", () => {
  it("shows a code with its percentage", async () => {
    mockApi();
    render(<AdminPromoCodes />);
    expect(await screen.findByText("SAVE10")).toBeTruthy();
    expect(screen.getByText("10% off")).toBeTruthy();
  });

  it("shows usage against the limit when one is set", async () => {
    mockApi({ rows: [promo({ usage_limit: 5, redemption_count: 2 })] });
    render(<AdminPromoCodes />);
    expect(await screen.findByText("2 of 5")).toBeTruthy();
  });

  it("says no expiry rather than leaving the cell blank", async () => {
    mockApi();
    render(<AdminPromoCodes />);
    expect(await screen.findByText(/no expiry/i)).toBeTruthy();
  });
});

describe("creating", () => {
  async function openForm() {
    await userEvent.click(screen.getByRole("button", { name: /new promo code/i }));
  }

  it("sends the percentage as a percent, never as basis points", async () => {
    mockApi();
    render(<AdminPromoCodes />);
    await screen.findByText("SAVE10");
    await openForm();

    await userEvent.type(screen.getByLabelText(/^code$/i), "SUMMER20");
    const percent = screen.getByLabelText(/discount %/i);
    await userEvent.clear(percent);
    await userEvent.type(percent, "20");
    await userEvent.click(screen.getByRole("button", { name: /create code/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const body = JSON.parse(writes()[0][1].body);
    expect(body.code).toBe("SUMMER20");
    expect(String(body.percent_off)).toBe("20");
  });

  it("omits the usage limit entirely when left blank", async () => {
    mockApi();
    render(<AdminPromoCodes />);
    await screen.findByText("SAVE10");
    await openForm();

    await userEvent.type(screen.getByLabelText(/^code$/i), "NOLIMIT");
    await userEvent.click(screen.getByRole("button", { name: /create code/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    expect(JSON.parse(writes()[0][1].body)).not.toHaveProperty("usage_limit");
  });

  it("sends a usage limit as a number when one is given", async () => {
    mockApi();
    render(<AdminPromoCodes />);
    await screen.findByText("SAVE10");
    await openForm();

    await userEvent.type(screen.getByLabelText(/^code$/i), "FIVE");
    await userEvent.type(screen.getByLabelText(/usage limit/i), "5");
    await userEvent.click(screen.getByRole("button", { name: /create code/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    expect(JSON.parse(writes()[0][1].body).usage_limit).toBe(5);
  });

  it("shows the server's reason when the code is rejected", async () => {
    mockApi({
      write: () =>
        jsonResponse(
          {
            error: {
              code: "validation_error",
              message: "The request could not be processed.",
              fields: { code: ["A promo code with that name already exists."] },
            },
          },
          400,
        ),
    });
    render(<AdminPromoCodes />);
    await screen.findByText("SAVE10");
    await openForm();

    await userEvent.type(screen.getByLabelText(/^code$/i), "SAVE10");
    await userEvent.click(screen.getByRole("button", { name: /create code/i }));

    expect(await screen.findByText(/already exists/i)).toBeTruthy();
  });
});

describe("retiring", () => {
  it("deactivates rather than deleting", async () => {
    mockApi({ write: () => jsonResponse(promo({ is_active: false })) });
    render(<AdminPromoCodes />);
    await screen.findByText("SAVE10");

    await userEvent.click(screen.getByRole("button", { name: /retire/i }));

    await waitFor(() => expect(writes().length).toBeGreaterThan(0));
    const [url, init] = writes()[0];
    expect(init.method).toBe("PATCH");
    expect(String(url)).toContain("/admin/promo-codes/promo-1/");
    expect(JSON.parse(init.body)).toEqual({ is_active: false });
  });

  it("offers to reactivate a retired code", async () => {
    mockApi({ rows: [promo({ is_active: false })] });
    render(<AdminPromoCodes />);
    expect(await screen.findByRole("button", { name: /reactivate/i })).toBeTruthy();
  });

  it("says plainly that checkout will now refuse it", async () => {
    mockApi({ write: () => jsonResponse(promo({ is_active: false })) });
    render(<AdminPromoCodes />);
    await screen.findByText("SAVE10");

    await userEvent.click(screen.getByRole("button", { name: /retire/i }));

    expect(await screen.findByText(/checkout will refuse it/i)).toBeTruthy();
  });
});

describe("keeping the two kinds of code apart", () => {
  /**
   * Agency referral codes share the database table but carry no discount. Someone
   * hunting for one here and finding nothing must be told where it lives, not left to
   * conclude it was deleted.
   */
  it("points at Agencies for referral codes when empty", async () => {
    mockApi({ rows: [] });
    render(<AdminPromoCodes />);
    expect(await screen.findByText(/agencies/i)).toBeTruthy();
  });
});
