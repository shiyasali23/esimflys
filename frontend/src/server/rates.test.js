import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `src/server/rates.js` imports `server-only`, which throws outside a server
 * component. Stubbing it lets the fetch policy be tested directly, which matters
 * because the failure modes here are the ones that quietly charge people wrongly.
 */
vi.mock("server-only", () => ({}));

const { getRates, USD_ONLY } = await import("./rates");

/**
 * The current response shape. `max_age_hours` was removed along with the daily FX
 * feed — rates are a hand-set settings value now, so there is no staleness concept
 * and nothing here may reintroduce one.
 */
const OK = {
  base: "USD",
  buffer: "1.03",
  rates: { USD: "1", INR: "88", EUR: "0.92" },
};

function respond(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => respond(OK)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getRates", () => {
  it("parses the decimal strings into numbers and keeps the buffer separate", async () => {
    const fx = await getRates();
    expect(fx.rates).toEqual({ USD: 1, INR: 88, EUR: 0.92 });
    expect(fx.buffer).toBe(1.03);
  });

  /**
   * Cached indefinitely, not revalidated. This fetch is in the ROOT layout, so any
   * revalidation window makes every page in the app incrementally static and forces a
   * cache backend on Cloudflare Workers. Rates come from hand-configured backend
   * settings rather than a live feed, so a deploy is the right refresh boundary.
   */
  it("caches indefinitely so the whole site stays static", async () => {
    await getRates();
    const [, options] = fetch.mock.calls[0];
    expect(options.cache).toBe("force-cache");
    expect(options.next).toBeUndefined();
  });

  /**
   * The backend withdraws a currency whose quote has gone stale rather than charge
   * on an old number. Absent must mean unavailable — inventing a rate here would
   * quote a price nobody has agreed to honour.
   */
  it("offers only the currencies the backend actually returned", async () => {
    fetch.mockReturnValueOnce(respond({ ...OK, rates: { USD: "1", INR: "83.2" } }));
    const fx = await getRates();
    expect(Object.keys(fx.rates).sort()).toEqual(["INR", "USD"]);
    expect(fx.rates.EUR).toBeUndefined();
  });

  it("drops currencies this frontend has no configuration for", async () => {
    fetch.mockReturnValueOnce(respond({ ...OK, rates: { USD: "1", ZWL: "9999" } }));
    const fx = await getRates();
    expect(fx.rates.ZWL).toBeUndefined();
  });

  it("drops broken quotes rather than dividing by them", async () => {
    fetch.mockReturnValueOnce(
      respond({ ...OK, rates: { USD: "1", INR: "0", EUR: "-3", GBP: "abc" } }),
    );
    const fx = await getRates();
    expect(Object.keys(fx.rates)).toEqual(["USD"]);
  });

  it("pins USD to exactly 1 whatever the feed claims", async () => {
    fetch.mockReturnValueOnce(respond({ ...OK, rates: { USD: "1.07" } }));
    const fx = await getRates();
    expect(fx.rates.USD).toBe(1);
  });

  /** A hardcoded rate would be a price we cannot honour. USD-only is the safe answer. */
  it.each([
    ["a non-OK response", () => respond({}, false)],
    ["a network failure", () => Promise.reject(new Error("ECONNREFUSED"))],
    ["a payload with no rates", () => respond({ base: "USD" })],
  ])("falls back to USD only on %s", async (_label, impl) => {
    fetch.mockImplementationOnce(impl);
    const fx = await getRates();
    expect(fx).toEqual(USD_ONLY);
    expect(fx.rates).toEqual({ USD: 1 });
    expect(fx.buffer).toBe(1);
  });

  it("never invents a buffer", async () => {
    fetch.mockReturnValueOnce(respond({ ...OK, buffer: "nonsense" }));
    expect((await getRates()).buffer).toBe(1);
  });

  /**
   * The real state of this deployment right now: the FX feed has no API key, so the
   * backend has no rates to publish and quotes USD alone. The storefront must sell
   * normally in that state, not break.
   */
  it("copes with a table that quotes USD alone", async () => {
    fetch.mockReturnValueOnce(respond({ ...OK, rates: { USD: "1" } }));
    const fx = await getRates();
    expect(fx.rates).toEqual({ USD: 1 });
    expect(fx.buffer).toBe(1.03);
  });
});
