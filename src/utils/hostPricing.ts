/** Call rate (coins/min) from host level — hosts do not set this manually. */
export function callPriceForLevel(level: number): number {
  void level;
  // Admin-managed launch rate. Finance admins may set any integer from 30–40.
  return 40;
}
