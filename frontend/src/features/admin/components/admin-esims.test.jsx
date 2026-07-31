// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminEsims } from "@/features/admin/components/admin-esims.client";

/**
 * Credential reveal — the most sensitive action in the product.
 *
 * Neither the list nor the detail payload contains credentials; only
 * `POST …/reveal/` returns them. That call needs a capability finance does not
 * have, is limited to 10 per HOUR, and every use is written to the audit trail.
 *
 * So the properties worth locking are: nothing is revealed until an operator
 * explicitly asks, the request is made only for the row they asked about, and a
 * refusal explains itself instead of failing silently.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ESIM_A = {
  id: "e1",
  status: "ready",
  product_name: "Saudi Arabia 10 GB",
  order_number: "ESF-AAA",
  country_iso2: "SA",
  iccid_last4: "1502",
  total_data_bytes: 10000000000,
  remaining_data_bytes: 10000000000,
};

const ESIM_B = {
  ...ESIM_A,
  id: "e2",
  product_name: "Thailand 5 GB",
  order_number: "ESF-BBB",
  iccid_last4: "9999",
};

const CREDENTIALS = {
  credentials: {
    iccid: "8944138302270011502",
    smdp_address: "smdp.fake-esim.example.com",
    activation_code: "13317BD174",
    qr_payload: "LPA:1$smdp.fake-esim.example.com$13317BD174",
  },
};

const listBody = (results) => ({ count: results.length, next: null, previous: null, results });

/** GET the list; POST /reveal/ answers with `reveal`. */
function mockApi(reveal) {
  globalThis.fetch = vi.fn((url, init) => {
    if (String(url).includes("/reveal/") && init?.method === "POST") {
      return Promise.resolve(reveal());
    }
    return Promise.resolve(jsonResponse(listBody([ESIM_A, ESIM_B])));
  });
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("credentials are not shown by default", () => {
  it("marks every row hidden before any reveal", async () => {
    mockApi(() => jsonResponse(CREDENTIALS));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");
    expect(screen.getAllByText("Hidden").length).toBe(2);
    expect(document.body.textContent).not.toContain("13317BD174");
  });

  it("makes no reveal request just by opening the screen", async () => {
    mockApi(() => jsonResponse(CREDENTIALS));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");
    const revealCalls = globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes("/reveal/"));
    expect(revealCalls).toHaveLength(0);
  });

  it("warns that revealing is audited and rate limited", async () => {
    mockApi(() => jsonResponse(CREDENTIALS));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");
    expect(screen.getByText(/audited and limited to 10 per hour/i)).toBeTruthy();
  });
});

describe("explicit reveal", () => {
  it("reveals only the row the operator asked about", async () => {
    mockApi(() => jsonResponse(CREDENTIALS));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");

    await userEvent.click(screen.getAllByRole("button", { name: /reveal/i })[0]);

    await waitFor(() => expect(screen.getByText("13317BD174")).toBeTruthy());
    // the second row is untouched
    expect(screen.getAllByText("Hidden").length).toBe(1);
  });

  it("sends exactly one reveal request, for that eSIM", async () => {
    mockApi(() => jsonResponse(CREDENTIALS));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");

    await userEvent.click(screen.getAllByRole("button", { name: /reveal/i })[0]);
    await waitFor(() => expect(screen.getByText("13317BD174")).toBeTruthy());

    const revealCalls = globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes("/reveal/"));
    expect(revealCalls).toHaveLength(1);
    expect(String(revealCalls[0][0])).toContain("/esims/e1/reveal/");
    expect(revealCalls[0][1].method).toBe("POST");
  });
});

describe("refusals explain themselves", () => {
  it("says the role can't reveal, on 403", async () => {
    mockApi(() => jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");

    await userEvent.click(screen.getAllByRole("button", { name: /reveal/i })[0]);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/your role can't reveal credentials/i)).toBeTruthy();
  });

  // Scoped to the alert: the standing warning paragraph also mentions the limit,
  // so an unscoped query matches twice and rejects.
  it("names the hourly limit, on 429", async () => {
    mockApi(() => jsonResponse({ error: { code: "rate_limited", message: "Slow down." } }, 429));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");

    await userEvent.click(screen.getAllByRole("button", { name: /reveal/i })[0]);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/reveal limit reached \(10 per hour\)/i);
  });

  it("still shows nothing when the reveal is refused", async () => {
    mockApi(() => jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");

    await userEvent.click(screen.getAllByRole("button", { name: /reveal/i })[0]);
    await screen.findByRole("alert");
    expect(screen.getAllByText("Hidden").length).toBe(2);
  });
});

describe("the list itself", () => {
  it("shows usage in bytes and only the last four of the ICCID", async () => {
    mockApi(() => jsonResponse(CREDENTIALS));
    render(<AdminEsims />);
    await screen.findByText("Saudi Arabia 10 GB");
    expect(screen.getAllByText(/10 GB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ESF-AAA · ICCID ••••1502/)).toBeTruthy();
  });
});
