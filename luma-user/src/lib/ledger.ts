/** Blueprint coin ledger: Tmax = floor(Cu / Rm), slice every 10s = Rm / 6 */

export function maxCallMinutes(coins: number, ratePerMinute: number) {
  if (ratePerMinute <= 0) return 0;
  return Math.floor(coins / ratePerMinute);
}

export function sliceCost(ratePerMinute: number) {
  return Math.max(1, Math.round(ratePerMinute / 6));
}

export function effectiveRate(ratePerMinute: number, isPremium: boolean) {
  return isPremium ? Math.round(ratePerMinute * 0.85) : ratePerMinute;
}

export type VipTier = "none" | "silver" | "gold" | "diamond";

export function vipTierFromXp(xp: number): VipTier {
  if (xp >= 5000) return "diamond";
  if (xp >= 1500) return "gold";
  if (xp >= 300) return "silver";
  return "none";
}

export function vipLabel(tier: VipTier) {
  switch (tier) {
    case "diamond":
      return "Diamond Member";
    case "gold":
      return "Gold Member";
    case "silver":
      return "Silver Member";
    default:
      return "Member";
  }
}

export const VIP_THRESHOLDS = {
  silver: 300,
  gold: 1500,
  diamond: 5000,
} as const;
