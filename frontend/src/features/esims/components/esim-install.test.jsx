// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EsimInstall } from "./esim-install.client";

vi.mock("@/components/media/qr-code.client", () => ({
  QrCode: ({ payload }) => <div data-testid="qr">{payload}</div>,
}));

const CREDS = {
  qr_payload: "LPA:1$rsp.redtea.io$CDB21D069D3B452F98B3426578A5FD11",
  activation_code: "LPA:1$rsp.redtea.io$CDB21D069D3B452F98B3426578A5FD11",
  smdp_address: "rsp.redtea.io",
  iccid: "8944000000000001234",
};

const UA = {
  ios174: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
  ios173: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Version/17.3 Mobile/15E148 Safari/604.1",
  ios18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15",
};

function setDevice(ua, touchPoints = 0) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: touchPoints, configurable: true });
}

const installLink = () => screen.queryByRole("link", { name: /install this esim/i });

afterEach(() => vi.restoreAllMocks());

describe("one-tap install button", () => {
  it("appears on iOS 17.4, where Apple's universal link works", async () => {
    setDevice(UA.ios174);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(installLink()).toBeTruthy());
  });

  it("appears on a newer iOS", async () => {
    setDevice(UA.ios18);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(installLink()).toBeTruthy());
  });

  it("appears on an iPad, which reports itself as a Mac", async () => {
    setDevice(UA.ipad, 5);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(installLink()).toBeTruthy());
  });

  /**
   * `esimsetup.apple.com` has no A record — iOS resolves it inside the OS. Anywhere
   * else the link reaches DNS and dies as "Server Not Found", so a false positive
   * strands someone holding the eSIM they just paid for.
   */
  it("is hidden on iOS 17.3, before Apple shipped the feature", async () => {
    setDevice(UA.ios173);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(screen.getByTestId("qr")).toBeTruthy());
    expect(installLink()).toBeNull();
  });

  it("is hidden on Android", async () => {
    setDevice(UA.android);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(screen.getByTestId("qr")).toBeTruthy());
    expect(installLink()).toBeNull();
  });

  it("is hidden on a desktop Mac, which has no eSIM to install", async () => {
    setDevice(UA.mac, 0);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(screen.getByTestId("qr")).toBeTruthy());
    expect(installLink()).toBeNull();
  });

  it("carries the LPA payload verbatim, on a lowercase base URL", async () => {
    setDevice(UA.ios174);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(installLink()).toBeTruthy());
    const href = installLink().getAttribute("href");
    expect(href).toBe(
      "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=" + CREDS.qr_payload,
    );
    expect(href.startsWith("https://esimsetup.apple.com/esim_qrcode_provisioning")).toBe(true);
    // Percent-encoding the `$` is what every published example avoids.
    expect(href).not.toContain("%24");
  });

  it("is hidden when the payload is not an LPA string", async () => {
    setDevice(UA.ios174);
    render(<EsimInstall credentials={{ ...CREDS, qr_payload: "not-an-lpa-string" }} />);
    await waitFor(() => expect(screen.getByTestId("qr")).toBeTruthy());
    expect(installLink()).toBeNull();
  });
});

describe("copy buttons", () => {
  beforeEach(() => setDevice(UA.android));

  it("copies the activation code, which is the thing nobody should retype", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<EsimInstall credentials={CREDS} />);
    await userEvent.click(screen.getByRole("button", { name: /copy activation code/i }));
    expect(writeText).toHaveBeenCalledWith(CREDS.activation_code);
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it("exists on every device, not only where one-tap is missing", async () => {
    setDevice(UA.ios174);
    render(<EsimInstall credentials={CREDS} />);
    await waitFor(() => expect(installLink()).toBeTruthy());
    expect(screen.getByRole("button", { name: /copy activation code/i })).toBeTruthy();
  });

  it("survives a blocked clipboard without crashing", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<EsimInstall credentials={CREDS} />);
    await userEvent.click(screen.getByRole("button", { name: /copy activation code/i }));
    // The value stays on screen to select by hand, which is what it was before.
    // `getAllBy`, not `getBy`: the activation code and the QR payload are the SAME LPA
    // string, so it legitimately appears twice on the page.
    expect(screen.getAllByText(CREDS.activation_code).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /copy activation code/i })).toBeTruthy();
  });

  it("shows the ICCID only where it is asked for", async () => {
    const { unmount } = render(<EsimInstall credentials={CREDS} />);
    expect(screen.queryByText(CREDS.iccid)).toBeNull();
    unmount();
    render(<EsimInstall credentials={CREDS} showIccid />);
    expect(screen.getByText(CREDS.iccid)).toBeTruthy();
  });
});

describe("nothing to install", () => {
  it("renders nothing without credentials", () => {
    const { container } = render(<EsimInstall credentials={null} />);
    expect(container.textContent).toBe("");
  });
});
