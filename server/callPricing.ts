/**
 * Server-owned private-call pricing.
 *
 * A host stores a rate unit, never an already-calculated coin price.  The
 * amount a user is charged for one billable minute is always:
 *
 *   hostRate * RATE_UNIT_COINS
 *
 * Keeping the conversion here prevents the Host app, User app, and Admin UI
 * from drifting into separate interpretations of the rate.
 */

export const DEFAULT_RATE_UNIT_COINS = 10;
export const DEFAULT_HOST_RATE = 3;
export const MIN_HOST_RATE = 1;
export const MAX_HOST_RATE = 1_000;

let configuredRateUnitCoins: number | null = null;

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function rateUnitCoins(value = process.env.RATE_UNIT_COINS): number {
  return configuredRateUnitCoins ?? Math.min(10_000, positiveInteger(value, DEFAULT_RATE_UNIT_COINS));
}

/** Finance-admin controlled value persisted in the server configuration snapshot. */
export function configureRateUnitCoins(value: unknown): number {
  configuredRateUnitCoins = Math.min(10_000, positiveInteger(value, DEFAULT_RATE_UNIT_COINS));
  return configuredRateUnitCoins;
}

/** Normalizes an integer host rate, not a final coin amount. */
export function normalizeHostRate(value: unknown): number {
  const rate = positiveInteger(value, DEFAULT_HOST_RATE);
  return Math.min(MAX_HOST_RATE, Math.max(MIN_HOST_RATE, rate));
}

/** Converts legacy 30–40 coin/minute rows into the new 3–4 rate units. */
export function normalizePersistedHostRate(value: unknown): number {
  const raw = Math.floor(Number(value));
  if (Number.isInteger(raw) && raw >= 30 && raw <= 40 && raw % rateUnitCoins() === 0) {
    return normalizeHostRate(raw / rateUnitCoins());
  }
  return normalizeHostRate(raw);
}

export function chargePerMinute(hostRate: unknown, unit = rateUnitCoins()): number {
  const rate = normalizeHostRate(hostRate);
  const safeUnit = Math.min(10_000, positiveInteger(unit, DEFAULT_RATE_UNIT_COINS));
  return rate * safeUnit;
}

export function publicCallPricing(hostRate: unknown) {
  const rate = normalizeHostRate(hostRate);
  const unit = rateUnitCoins();
  return { hostRate: rate, rateUnitCoins: unit, chargePerMinute: rate * unit };
}
