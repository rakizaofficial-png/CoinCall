"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import { useApp } from "@/lib/store";
import { vipLabel } from "@/lib/ledger";

export function VipRibbon() {
  const { vipTier, xp, isPremium } = useApp();
  const label = isPremium || vipTier !== "none" ? vipLabel(vipTier === "none" ? "silver" : vipTier) : "Unlock VIP";

  return (
    <Link
      href="/premium"
      className="vip-ribbon inline-flex items-center gap-1.5 rounded-full border border-cyan/30 bg-black/50 px-3 py-1.5 text-[11px] font-bold text-cyan backdrop-blur"
    >
      <Crown className="h-3.5 w-3.5 text-gold" />
      <span>{isPremium ? label : label}</span>
      <span className="text-muted">· {xp} XP</span>
    </Link>
  );
}
