"use client";

import type { ReactNode } from "react";
import { vipLabel, type VipTier } from "@/lib/ledger";

const TIER_STYLES: Record<
  VipTier,
  { bubble: string; badge: string; label: string }
> = {
  none: {
    bubble: "rounded-br-md bg-ink-3 text-sand border border-line",
    badge: "bg-ink-3 text-muted border border-line",
    label: "Fan",
  },
  silver: {
    bubble:
      "rounded-br-md bg-gradient-to-br from-slate-400/25 to-ink-3 text-sand border border-slate-300/40 shadow-[0_0_16px_rgba(200,210,220,0.25)]",
    badge: "bg-slate-300/20 text-slate-200 border border-slate-300/50",
    label: "Silver VIP",
  },
  gold: {
    bubble:
      "rounded-br-md bg-gradient-to-br from-gold/30 to-ink-3 text-sand border border-gold/50 shadow-[0_0_18px_rgba(255,184,0,0.35)]",
    badge: "bg-gold/20 text-gold border border-gold/50",
    label: "Gold VIP",
  },
  diamond: {
    bubble:
      "rounded-br-md bg-gradient-to-br from-cyan/30 via-ink-3 to-[#ff2a7a]/20 text-sand border border-cyan/60 shadow-[0_0_22px_rgba(0,240,255,0.45)] vip-diamond-glow",
    badge:
      "bg-cyan/20 text-cyan border border-cyan/60 shadow-[0_0_12px_rgba(0,240,255,0.4)]",
    label: "Diamond VIP",
  },
};

export function VipBadge({ tier }: { tier: VipTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${s.badge}`}
    >
      {s.label}
    </span>
  );
}

export function VipChatBubble({
  tier,
  children,
  fromMe,
}: {
  tier: VipTier;
  children: ReactNode;
  fromMe?: boolean;
}) {
  if (!fromMe) {
    return (
      <p className="max-w-[78%] rounded-2xl rounded-bl-md border border-cyan/20 bg-ink-3 px-3.5 py-2.5 text-sm text-sand">
        {children}
      </p>
    );
  }
  const s = TIER_STYLES[tier];
  return (
    <div className="flex max-w-[82%] flex-col items-end gap-1">
      <VipBadge tier={tier === "none" ? "silver" : tier} />
      <p className={`rounded-2xl px-3.5 py-2.5 text-sm ${s.bubble}`}>
        {children}
      </p>
      {tier !== "none" && (
        <span className="text-[9px] font-semibold text-cyan/70">
          {vipLabel(tier)}
        </span>
      )}
    </div>
  );
}
