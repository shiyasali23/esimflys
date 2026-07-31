// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EsimDetail } from "./esim-detail.client";
import { useSession } from "@/features/auth/use-session.client";

/**
 * One eSIM on the owner's own account.
 *
 * This is the ONLY endpoint that returns activation credentials, and only to the
 * account that bought them. A foreign or unknown id answers 404 rather than 403,
 * so both render the same plain not-found — distinguishing them would confirm that
 * someone else's eSIM exists.
 *
 * Nothing may be fetched while the session is still unknown: firing the request
 * early gets a 403 and renders "not found" to a user who is in fact signed in.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CREDENTIALS = {
  iccid: "8944000000000005587",
  smdp_address: "consumer.rsp.example.com",
  activation_code: "K2-9QX-441",
  qr_payload: "LPA:1$consumer.rsp.example.com$K2-9QX-441",
};

const ESIM = {
  id: "esim-1",
  product_name: "Saudi Arabia 10 GB — 30 Days",
  country_name: "Saudi Arabia",
  validity_days: 30,
  status: "active",
  total_data_bytes: 10000000000,
  remaining_data_bytes: 4200000000,
  last_synced_at: "2026-07-30T12:00:00Z",
  credentials: CREDENTIALS,
};

const USER = { id: "u1", email: "traveller@example.com" };

function mockApi({ esim = ESIM, refresh } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    const path = String(url);
    if (init?.method === "POST") return Promise.resolve(refresh ? refresh() : jsonResponse({}));
    if (path.includes("/account/me/")) return Promise.resolve(jsonResponse(USER));
    return Promise.resolve(esim instanceof Response ? esim.clone() : jsonResponse(esim));
  });
}

const signedIn = () => useSession.setState({ user: USER, error: null, loading: false });

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useSession.setState({ user: undefined, error: null, loading: false });
});

afterEach(() => vi.restoreAllMocks());

describe("who may see it", () => {
  it("asks a signed-out visitor to sign in rather than showing a not-found", async () => {
    useSession.setState({ user: null, error: null, loading: false });
    mockApi();
    render(<EsimDetail esimId="esim-1" />);

    expect(await screen.findByText(/sign in to view this eSIM/i)).toBeTruthy();
    expect(screen.getByText(/only shown to the account that bought them/i)).toBeTruthy();
  });

  /**
   * With `user === undefined` the session is not yet determined. Fetching then
   * would earn a 403 and paint "not found" over a perfectly valid eSIM.
   */
  it("does not fetch the eSIM before the session is known", () => {
    mockApi();
    render(<EsimDetail esimId="esim-1" />);

    const esimCalls = globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes("/esims/"));
    expect(esimCalls).toHaveLength(0);
  });

  it("does not reveal whether a foreign eSIM exists", async () => {
    signedIn();
    mockApi({ esim: jsonResponse({ detail: "Not found." }, 404) });
    render(<EsimDetail esimId="someone-elses" />);

    const heading = await screen.findByText(/esim not found/i);
    expect(heading).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/belongs to|not yours|forbidden|permission/i);
  });
});

describe("the activation details", () => {
  it("shows the credentials to the owner", async () => {
    signedIn();
    mockApi();
    render(<EsimDetail esimId="esim-1" />);

    expect(await screen.findByText(CREDENTIALS.smdp_address)).toBeTruthy();
    expect(screen.getByText(CREDENTIALS.activation_code)).toBeTruthy();
    expect(screen.getByText(CREDENTIALS.iccid)).toBeTruthy();
  });

  /** Mid-provisioning is a normal state, not an error or an empty eSIM. */
  it("says a pending eSIM is still being prepared", async () => {
    signedIn();
    mockApi({ esim: { ...ESIM, status: "provisioning", credentials: null } });
    render(<EsimDetail esimId="esim-1" />);

    expect(await screen.findByText(/still being prepared/i)).toBeTruthy();
    expect(screen.queryByText(CREDENTIALS.activation_code)).toBeNull();
  });

  it("distinguishes a settled eSIM with no details from one still provisioning", async () => {
    signedIn();
    mockApi({ esim: { ...ESIM, status: "expired", credentials: null } });
    render(<EsimDetail esimId="esim-1" />);

    expect(await screen.findByText(/no activation details are available/i)).toBeTruthy();
  });
});

describe("data remaining", () => {
  it("reports bytes as human units against the total", async () => {
    signedIn();
    mockApi();
    render(<EsimDetail esimId="esim-1" />);

    expect(await screen.findByText("4.2 GB")).toBeTruthy();
    expect(screen.getByText(/of 10 GB/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
  });

  it("omits the usage panel when nothing has been reported", async () => {
    signedIn();
    mockApi({ esim: { ...ESIM, total_data_bytes: null, remaining_data_bytes: null } });
    render(<EsimDetail esimId="esim-1" />);

    await screen.findByText(CREDENTIALS.activation_code);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("re-reads after a refresh so the figure on screen is the new one", async () => {
    signedIn();
    let reads = 0;
    globalThis.fetch = vi.fn((url, init) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse({}));
      if (String(url).includes("/account/me/")) return Promise.resolve(jsonResponse(USER));
      reads += 1;
      return Promise.resolve(
        jsonResponse(reads === 1 ? ESIM : { ...ESIM, remaining_data_bytes: 1000000000 }),
      );
    });
    render(<EsimDetail esimId="esim-1" />);
    await screen.findByText("4.2 GB");

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(await screen.findByText("1 GB")).toBeTruthy();
  });

  /** Refresh is rate limited to 20/min; a bare failure reads as a broken page. */
  it("explains a throttled refresh", async () => {
    signedIn();
    mockApi({ refresh: () => jsonResponse({ detail: "Throttled." }, 429) });
    render(<EsimDetail esimId="esim-1" />);
    await screen.findByText("4.2 GB");

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(await screen.findByText(/refreshed very recently/i)).toBeTruthy();
  });

  it("keeps the last known figure when a refresh fails", async () => {
    signedIn();
    mockApi({ refresh: () => jsonResponse({ detail: "Throttled." }, 429) });
    render(<EsimDetail esimId="esim-1" />);
    await screen.findByText("4.2 GB");

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await screen.findByRole("alert");

    // Better a slightly stale number than a blank where the balance should be.
    expect(screen.getByText("4.2 GB")).toBeTruthy();
  });

  it("re-enables refresh afterwards", async () => {
    signedIn();
    mockApi({ refresh: () => jsonResponse({ detail: "Throttled." }, 429) });
    render(<EsimDetail esimId="esim-1" />);
    await screen.findByText("4.2 GB");

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /refresh/i }).disabled).toBe(false),
    );
  });
});
