import { describe, it, expect, vi } from "vitest";

/**
 * `src/server/rates.js` imports `server-only`, which throws outside a server
 * component. Stubbing it lets the table policy be tested directly, because the
 * failure modes here are the ones that quietly quote people the wrong number.
 *
 * The table is a COMMITTED file now, not a fetch, so these mock the module rather
 * than the network. The rule that matters has not changed: only what the backend
 * actually quoted may be offered, and anything malformed answers USD.
 */
vi.mock("server-only", () => ({}));

/** Load `getRates` with a given `rates.json` standing in for the committed file. */
async function withTable(table) {
  vi.resetModules();
  vi.doMock("@/data/rates.json", () => ({ default: table }));
  return import("./rates");
}

const OK = {
  meta: { source: "GET /api/v1/catalog/rates/", generatedAt: "2026-01-01T00:00:00.000Z" },
  rates: { USD: 1, INR: 88, EUR: 0.92 },
  buffer: 1.03,
};

describe("getRates", () => {
  it("reads the committed table and keeps the buffer separate", async () => {
    const { getRates } = await withTable(OK);
    const fx = await getRates();

    expect(fx.rates).toEqual({ USD: 1, INR: 88, EUR: 0.92 });
    expect(fx.buffer).toBe(1.03);
  });

  /**
   * The whole point of moving this into the repo: a build must not depend on the
   * backend being up, and must not silently become single-currency when it is not.
   */
  it("makes no network call at all", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { getRates } = await withTable(OK);

    await getRates();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("offers only the currencies the table actually names", async () => {
    const { getRates } = await withTable({ ...OK, rates: { USD: 1, INR: 83.2 } });
    expect(Object.keys((await getRates()).rates).sort()).toEqual(["INR", "USD"]);
  });

  it("drops currencies this frontend has no configuration for", async () => {
    const { getRates } = await withTable({ ...OK, rates: { USD: 1, ZWL: 9999 } });
    expect((await getRates()).rates).toEqual({ USD: 1 });
  });

  it("drops broken quotes rather than dividing by them", async () => {
    const { getRates } = await withTable({ ...OK, rates: { USD: 1, INR: 0, EUR: -1 } });
    expect((await getRates()).rates).toEqual({ USD: 1 });
  });

  it("pins USD to exactly 1 whatever the table claims", async () => {
    const { getRates } = await withTable({ ...OK, rates: { USD: 1.07, INR: 88 } });
    expect((await getRates()).rates.USD).toBe(1);
  });

  /** A file edited by hand can be malformed. Quote USD rather than guess. */
  it("answers USD only when the table has no usable rates", async () => {
    const { getRates, USD_ONLY } = await withTable({ meta: {}, buffer: 1.03 });
    expect(await getRates()).toEqual(USD_ONLY);
  });

  it("ignores a buffer that is missing or nonsensical", async () => {
    const { getRates } = await withTable({ ...OK, buffer: 0 });
    expect((await getRates()).buffer).toBe(1);
  });
});
