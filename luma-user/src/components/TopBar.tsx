"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import { WalletDiamond } from "@/components/WalletDiamond";
import { useApp } from "@/lib/store";
import { vipLabel } from "@/lib/ledger";

export function TopBar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { isPremium, vipTier } = useApp();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[#06040b]/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
      <div className="min-w-0">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan">
          Luma Lounge
        </p>
        <h1 className="font-display truncate text-xl font-bold leading-tight text-sand">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-cyan/70">{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {(isPremium || vipTier !== "none") && (
          <Link
            href="/premium"
            className="flex h-9 items-center gap-1 rounded-full border border-cyan/35 bg-cyan/10 px-2.5 text-cyan shadow-[0_0_14px_rgba(0,240,255,0.25)]"
          >
            <Crown className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold">
              {vipTier === "none" ? "VIP" : vipLabel(vipTier).split(" ")[0]}
            </span>
          </Link>
        )}
        <WalletDiamond />
      </div>
    </header>
  );
}
