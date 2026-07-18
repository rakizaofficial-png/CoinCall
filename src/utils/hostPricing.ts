/** Call rate (coins/min) from host level — hosts do not set this manually. */
export function callPriceForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  // L1=40 · L2=60 · L3=80 · L4=100 · L5=120 · then +20/level, max 300
  return Math.min(300, 20 + lv * 20);
}
