/**
 * Billing begins only after both authenticated clients report that they joined
 * the server-issued Agora channel.  The first interval is charged immediately
 * at that authoritative connection time; an accepted call which never joins
 * costs nothing.
 */
export const FIRST_CALL_CHARGE_DELAY_MS = 0;
const configuredInterval = Math.floor(Number(process.env.CALL_BILLING_INTERVAL_MS || 60_000));
export const RECURRING_CALL_CHARGE_MS = Number.isFinite(configuredInterval)
  ? Math.min(300_000, Math.max(60_000, configuredInterval))
  : 60_000;

/**
 * `billedUnits` is the number of successful call charges already recorded.
 * Unit 1 is due at confirmed connection; every later unit is due 60s apart.
 */
export function nextCallChargeAt(acceptedAt: number, billedUnits: number): number {
  const accepted = Math.max(0, Math.floor(Number(acceptedAt) || 0));
  const billed = Math.max(0, Math.floor(Number(billedUnits) || 0));
  return accepted + FIRST_CALL_CHARGE_DELAY_MS + billed * RECURRING_CALL_CHARGE_MS;
}
