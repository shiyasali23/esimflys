/**
 * FX rates vs 1 USD. Phase-1 MOCK (blueprint §28.8): baked into pages at build time.
 * Real source: backend `GET /api/rates` (daily, cached), consumed with ISR.
 * Values are indicative and must be refreshed from the backend before real charging.
 */
export const MOCK_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.2,
  AED: 3.67,
  SAR: 3.75,
  JPY: 157,
  AUD: 1.52,
  CAD: 1.36,
};

/** Returns the current FX rate table. Swap for a fetch to :8000 with ISR later. */
export function getRates() {
  return MOCK_RATES;
}
