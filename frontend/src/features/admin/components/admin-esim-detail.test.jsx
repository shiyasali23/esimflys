// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminEsimDetail } from "@/features/admin/components/admin-esim-detail.client";

/**
 * One eSIM profile.
 *
 * The detail payload is the SAME shape as a list row and carries no credentials.
 * `POST …/reveal/` is the only path to them: a separate capability, 10 per hour,
 * every use audited. Fetching it on load would burn a customer's quota and write
 * an audit entry for a page view — so it must stay an explicit act.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ESIM = {
  id: "e1",
  status: "active",
  order_number: "ESF-FC3B3AAD47AD",
  product_name: "Albania 10 GB — 30 Days",
  country_iso2: "AL",
  iccid_last4: "5587",
  total_data_bytes: 10000000000,
  remaining_data_bytes: 2500000000,
  installed_at: "2026-06-01T08:00:00Z",
  activated_at: "2026-06-01T09:00:00Z",
  expires_at: "2026-07-01T09:00:00Z",
  last_synced_at: "2026-06-10T09:00:00Z",
  created_at: "2026-05-30T09:00:00Z",
};

const CREDENTIALS = {
  iccid: "8944000000000005587",
  smdp_address: "consumer.rsp.example.com",
  activation_code: "K2-9QX-441",
  qr_payload: "LPA:1$consumer.rsp.example.com$K2-9QX-441",
  qr_code_url: "https://cdn.example.com/qr/e1.png",
  short_url: "https://esimflys.test/i/abc123",
};

function mockApi({ esim = ESIM, post } = {}) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init?.method === "POST") {
      return Promise.resolve(
        post ? post() : jsonResponse({ id: "e1", status: "active", credentials: CREDENTIALS }),
      );
    }
    return Promise.resolve(esim instanceof Response ? esim.clone() : jsonResponse(esim));
  });
}

const posts = () => globalThis.fetch.mock.calls.filter((c) => c[1]?.method === "POST");

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
});

afterEach(() => vi.restoreAllMocks());

describe("the profile", () => {
  it("identifies the eSIM by product, order and masked ICCID", async () => {
    mockApi();
    render(<AdminEsimDetail esimId="e1" />);

    expect(await screen.findByRole("heading", { name: /albania 10 gb/i })).toBeTruthy();
    expect(screen.getByText(/ESF-FC3B3AAD47AD/)).toBeTruthy();
    expect(screen.getByText(/••••5587/)).toBeTruthy();
  });

  // Bytes, not MB — an eSIM reports usage in bytes while a plan's allowance is MB.
  it("reports remaining data against the total", async () => {
    mockApi();
    render(<AdminEsimDetail esimId="e1" />);

    await screen.findByRole("heading", { name: /albania 10 gb/i });
    expect(screen.getByText("2.5 GB")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
  });

  it("says usage is unreported rather than drawing an empty bar", async () => {
    mockApi({ esim: { ...ESIM, total_data_bytes: null, remaining_data_bytes: null } });
    render(<AdminEsimDetail esimId="e1" />);

    expect(await screen.findByText(/no usage has been reported/i)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("dashes the lifecycle dates that haven't happened yet", async () => {
    mockApi({ esim: { ...ESIM, installed_at: null, activated_at: null, expires_at: null } });
    render(<AdminEsimDetail esimId="e1" />);

    await screen.findByRole("heading", { name: /albania 10 gb/i });
    expect(screen.getByText(/^installed$/i).closest("div").textContent).toContain("—");
    expect(document.body.textContent).not.toContain("Invalid Date");
  });
});

describe("credentials", () => {
  it("are not fetched when the page opens", async () => {
    mockApi();
    render(<AdminEsimDetail esimId="e1" />);

    await screen.findByRole("heading", { name: /albania 10 gb/i });
    expect(posts()).toHaveLength(0);
    expect(screen.queryByText(CREDENTIALS.iccid)).toBeNull();
  });

  it("warns that revealing is audited and rate limited", async () => {
    mockApi();
    render(<AdminEsimDetail esimId="e1" />);

    expect(await screen.findByText(/audited and limited to 10 per hour/i)).toBeTruthy();
  });

  it("shows the full set once the operator asks", async () => {
    mockApi();
    render(<AdminEsimDetail esimId="e1" />);
    await screen.findByRole("heading", { name: /albania 10 gb/i });

    await userEvent.click(screen.getByRole("button", { name: /reveal credentials/i }));

    expect(await screen.findByText(CREDENTIALS.iccid)).toBeTruthy();
    expect(screen.getByText(CREDENTIALS.smdp_address)).toBeTruthy();
    expect(screen.getByText(CREDENTIALS.activation_code)).toBeTruthy();
    expect(screen.getByText(CREDENTIALS.qr_payload)).toBeTruthy();
    expect(String(posts()[0][0])).toContain("/esims/e1/reveal/");
  });

  it("can be hidden again without another audited call", async () => {
    mockApi();
    render(<AdminEsimDetail esimId="e1" />);
    await screen.findByRole("heading", { name: /albania 10 gb/i });

    await userEvent.click(screen.getByRole("button", { name: /reveal credentials/i }));
    await screen.findByText(CREDENTIALS.iccid);
    await userEvent.click(screen.getByRole("button", { name: /hide credentials/i }));

    expect(screen.queryByText(CREDENTIALS.iccid)).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  /** Finance has no reveal capability; a bare 403 reads as a bug rather than a rule. */
  it("names the role limit on a 403", async () => {
    mockApi({ post: () => jsonResponse({ detail: "Permission denied." }, 403) });
    render(<AdminEsimDetail esimId="e1" />);
    await screen.findByRole("heading", { name: /albania 10 gb/i });

    await userEvent.click(screen.getByRole("button", { name: /reveal credentials/i }));
    expect(await screen.findByText(/your role can't reveal credentials/i)).toBeTruthy();
  });

  it("names the hourly cap on a 429", async () => {
    mockApi({ post: () => jsonResponse({ detail: "Throttled." }, 429) });
    render(<AdminEsimDetail esimId="e1" />);
    await screen.findByRole("heading", { name: /albania 10 gb/i });

    await userEvent.click(screen.getByRole("button", { name: /reveal credentials/i }));
    // Scoped to the alert: the standing warning also says "10 per hour".
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/reveal limit reached \(10 per hour\)/i);
  });
});

describe("sync", () => {
  it("posts then re-reads, so the figures on screen are the new ones", async () => {
    let reads = 0;
    globalThis.fetch = vi.fn((url, init) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse({}));
      reads += 1;
      return Promise.resolve(
        jsonResponse(reads === 1 ? ESIM : { ...ESIM, remaining_data_bytes: 1000000000 }),
      );
    });
    render(<AdminEsimDetail esimId="e1" />);
    await screen.findByText("2.5 GB");

    await userEvent.click(screen.getByRole("button", { name: /sync usage/i }));

    expect(await screen.findByText("1 GB")).toBeTruthy();
    await waitFor(() => expect(String(posts()[0][0])).toContain("/esims/e1/refresh-usage/"));
  });

  it("reports a failed sync instead of leaving stale figures unexplained", async () => {
    mockApi({
      post: () =>
        jsonResponse({ error: { code: "supplier_error", message: "Supplier unreachable." } }, 502),
    });
    render(<AdminEsimDetail esimId="e1" />);
    await screen.findByText("2.5 GB");

    await userEvent.click(screen.getByRole("button", { name: /sync usage/i }));
    expect(await screen.findByText("Supplier unreachable.")).toBeTruthy();
  });
});

describe("failures", () => {
  it("offers a way back when the eSIM is gone", async () => {
    mockApi({ esim: jsonResponse({ detail: "Not found." }, 404) });
    render(<AdminEsimDetail esimId="e1" />);

    expect(await screen.findByText(/esim not found/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to esims/i })).toBeTruthy();
  });
});
