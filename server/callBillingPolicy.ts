/** First accepted-call charge must happen comfortably inside the first 10 seconds. */
export const FIRST_CALL_CHARGE_DELAY_MS = 5_000;
export const RECURRING_CALL_CHARGE_MS = 60_000;

/**
 * `billedUnits` is the number of successful call charges already recorded.
 * Unit 1 is due 5s after acceptance; every later unit is due 60s apart.
 */
export function nextCallChargeAt(acceptedAt: number, billedUnits: number): number {
  const accepted = Math.max(0, Math.floor(Number(acceptedAt) || 0));
  const billed = Math.max(0, Math.floor(Number(billedUnits) || 0));
  return accepted + FIRST_CALL_CHARGE_DELAY_MS + billed * RECURRING_CALL_CHARGE_MS;
}
