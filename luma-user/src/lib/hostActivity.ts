/** Host downtime activity shown on TikTok discovery cards */
export type HostActivityMode = "solo" | "party_room" | "pk_battle";

export type FeedActivity = {
  mode: HostActivityMode;
  label: string;
  seats?: number;
  viewers?: number;
  pkScore?: string;
};

/** Deterministic mock activity from host id so UI stays stable across swipes */
export function resolveHostActivity(
  hostId: string,
  flags?: { isLive?: boolean; isOnCall?: boolean; readyToCall?: boolean },
): FeedActivity {
  if (flags?.isOnCall) {
    return { mode: "solo", label: "On private call", viewers: 0 };
  }
  // Real bridge flags win over mock party/PK labels so ready hosts show as callable
  if (flags?.isLive) {
    return {
      mode: "solo",
      label: "Solo live · on stage",
      viewers: 40 + (hostId.length % 20),
    };
  }
  if (flags?.readyToCall !== false) {
    return {
      mode: "solo",
      label: "Online · ready to call",
      viewers: undefined,
    };
  }
  let hash = 0;
  for (let i = 0; i < hostId.length; i++) {
    hash = (hash + hostId.charCodeAt(i) * (i + 3)) % 97;
  }
  return {
    mode: "solo",
    label: "Online · waiting 1v1",
    viewers: undefined,
  };
}

export const PREMIUM_TOPUP_TIERS = [
  {
    id: "boost",
    name: "Instant Boost",
    coins: 500,
    price: "$4.99",
    tag: "Fast fill",
    accent: "cyan" as const,
  },
  {
    id: "lounge",
    name: "Lounge Pack",
    coins: 1200,
    bonus: 200,
    price: "$9.99",
    tag: "Most loved",
    accent: "coral" as const,
  },
  {
    id: "elite",
    name: "Elite Vault",
    coins: 2500,
    bonus: 500,
    price: "$19.99",
    tag: "Best value",
    accent: "gold" as const,
  },
] as const;
