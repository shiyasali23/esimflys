// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPayouts } from "./admin-payouts.client";

/**
 * Commission payouts — the last step of review → approve → group → mark paid.
 *
 * The dangerous misunderstanding this guards: "mark paid" moves no money. There is
 * no bank integration; it RECORDS a transfer made elsewhere. A UI that reads like
 * a payment button invites someone to click it expecting the agency to be paid.
 *
 * The server also owns the amount — it groups every approved commission in the
 * period and totals them. No amount may ever be sent from here.
 *
 * This list is a PLAIN ARRAY, not a paginated envelope (verified live).
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ORG = { id: "org-1", name: "Sunrise Travel", status: "active" };

const DRAFT = {
  id: "po-1",
  organization: ORG.id,
  organization_name: "Sunrise Travel",
  currency: "USD",
  amount_minor: 299,
  status: "draft",
  commission_count: 1,
  period_start: "2026-07-01",
  period_end: "2026-07-31",
  external_reference: null,
  payment_method: null,
  paid_at: null,
};

function mockApi({ payouts = [DRAFT], write } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    const path = String(url);
    if (init?.method === "POST") {
      return Promise.resolve(write ? write(path) : jsonResponse({ ...DRAFT, status: "paid" }));
    }
    if (path.includes("/organizations/")) {
      return Promise.resolve(jsonResponse({ count: 1, next: null, previous: null, results: [ORG] }));
    }
    return Promise.resolve(jsonResponse(payouts));
  });
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

/**
 * Scoped to the list: the agency name is ALSO an <option> in the draft form, so an
 * unscoped getByText matches twice.
 */
const listSection = async () =>
  (await screen.findByRole("heading", { name: /^payouts \(/i })).closest("section");
const firstRow = async () => within(await listSection()).getByRole("listitem");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("reading the list", () => {
  /** A plain array — reading it as `{results}` shows an empty page. */
  it("renders payouts from a plain array response", async () => {
    mockApi();
    render(<AdminPayouts />);

    const row = await firstRow();
    expect(within(row).getByText("Sunrise Travel")).toBeTruthy();
    expect(within(row).getByText("$2.99")).toBeTruthy();
  });

  it("shows the period and how many commissions it groups", async () => {
    mockApi();
    render(<AdminPayouts />);

    const row = await firstRow();
    expect(within(row).getByText(/2026-07-01 → 2026-07-31/)).toBeTruthy();
    expect(within(row).getByText(/1 commission\b/)).toBeTruthy();
  });

  it("explains an empty list rather than showing a bare panel", async () => {
    mockApi({ payouts: [] });
    render(<AdminPayouts />);

    expect(await screen.findByText(/approve some commissions/i)).toBeTruthy();
  });
});

describe("drafting a payout", () => {
  /** The server groups and totals. Sending an amount would let the UI disagree. */
  it("sends only the agency and the period — never an amount", async () => {
    mockApi();
    render(<AdminPayouts />);
    await firstRow();

    await userEvent.selectOptions(screen.getByLabelText(/agency/i), "org-1");
    await userEvent.type(screen.getByLabelText(/period start/i), "2026-08-01");
    await userEvent.type(screen.getByLabelText(/period end/i), "2026-08-31");
    await userEvent.click(screen.getByRole("button", { name: /draft payout/i }));

    const body = JSON.parse(posts()[0][1].body);
    expect(body).toEqual({
      organization: "org-1",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
    });
    expect(Object.keys(body)).not.toContain("amount_minor");
  });

  /**
   * A period with nothing approved yields an empty payout. Silently adding a $0
   * row to the list looks like a bug; say why it is empty.
   */
  it("says when a period caught no approved commissions", async () => {
    mockApi({
      write: () => jsonResponse({ ...DRAFT, id: "po-2", commission_count: 0, amount_minor: 0 }, 201),
    });
    render(<AdminPayouts />);
    await firstRow();

    await userEvent.selectOptions(screen.getByLabelText(/agency/i), "org-1");
    await userEvent.type(screen.getByLabelText(/period start/i), "2026-09-01");
    await userEvent.type(screen.getByLabelText(/period end/i), "2026-09-30");
    await userEvent.click(screen.getByRole("button", { name: /draft payout/i }));

    expect(await screen.findByText(/no approved commissions fell in that period/i)).toBeTruthy();
  });

  it("surfaces a per-field rejection", async () => {
    mockApi({
      write: () =>
        jsonResponse(
          {
            error: {
              code: "validation_error",
              message: "Invalid.",
              fields: { period_end: ["End must be after start."] },
            },
          },
          400,
        ),
    });
    render(<AdminPayouts />);
    await firstRow();

    await userEvent.selectOptions(screen.getByLabelText(/agency/i), "org-1");
    await userEvent.type(screen.getByLabelText(/period start/i), "2026-09-30");
    await userEvent.type(screen.getByLabelText(/period end/i), "2026-09-01");
    await userEvent.click(screen.getByRole("button", { name: /draft payout/i }));

    expect(await screen.findByText(/end must be after start/i)).toBeTruthy();
  });
});

describe("marking one paid", () => {
  /** The single most important thing on this screen to state correctly. */
  it("says plainly that it records rather than sends money", async () => {
    mockApi();
    render(<AdminPayouts />);
    await firstRow();

    await userEvent.click(screen.getByRole("button", { name: /mark paid/i }));

    expect(await screen.findByText(/does not send any money/i)).toBeTruthy();
    expect(screen.getByText(/already made elsewhere/i)).toBeTruthy();
  });

  it("records the reference that links it to the bank record", async () => {
    mockApi();
    render(<AdminPayouts />);
    await firstRow();

    await userEvent.click(screen.getByRole("button", { name: /mark paid/i }));
    await userEvent.type(await screen.findByLabelText(/reference/i), "WISE-2026-07-001");
    await userEvent.type(screen.getByLabelText(/method/i), "bank_transfer");
    await userEvent.click(screen.getByRole("button", { name: /record payment/i }));

    const post = posts().find((c) => String(c[0]).includes("/pay/"));
    expect(post).toBeTruthy();
    expect(JSON.parse(post[1].body)).toEqual({
      reference: "WISE-2026-07-001",
      method: "bank_transfer",
    });
  });

  it("can be abandoned without recording anything", async () => {
    mockApi();
    render(<AdminPayouts />);
    await firstRow();

    await userEvent.click(screen.getByRole("button", { name: /mark paid/i }));
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText(/reference/i)).toBeNull();
    expect(posts().filter((c) => String(c[0]).includes("/pay/"))).toHaveLength(0);
  });

  /** Paying twice would double-record a transfer that happened once. */
  it("is not offered for a payout already paid", async () => {
    mockApi({
      payouts: [{ ...DRAFT, status: "paid", external_reference: "WISE-1", paid_at: "2026-07-31T00:00:00Z" }],
    });
    render(<AdminPayouts />);

    const row = await firstRow();
    expect(within(row).queryByRole("button", { name: /mark paid/i })).toBeNull();
    expect(within(row).getByText(/ref WISE-1/)).toBeTruthy();
  });

  it("is not offered for a cancelled payout", async () => {
    mockApi({ payouts: [{ ...DRAFT, status: "cancelled" }] });
    render(<AdminPayouts />);

    const row = await firstRow();
    expect(within(row).queryByRole("button", { name: /mark paid/i })).toBeNull();
  });

  it("reports a refusal rather than appearing to succeed", async () => {
    mockApi({
      write: (path) =>
        path.includes("/pay/")
          ? jsonResponse({ error: { code: "conflict", message: "Payout is already paid." } }, 409)
          : jsonResponse(DRAFT, 201),
    });
    render(<AdminPayouts />);
    await firstRow();

    await userEvent.click(screen.getByRole("button", { name: /mark paid/i }));
    await userEvent.click(await screen.findByRole("button", { name: /record payment/i }));

    expect(await screen.findByText("Payout is already paid.")).toBeTruthy();
  });
});
