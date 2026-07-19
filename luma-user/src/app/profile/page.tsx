"use client";

import Link from "next/link";
import { Crown, Settings, Wallet } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { useApp } from "@/lib/store";
import { vipLabel } from "@/lib/ledger";

export default function ProfilePage() {
  const { coins, xp, vipTier, isPremium, userId, ready } = useApp();

  return (
    <main className="pb-28">
      <TopBar title="Profile" subtitle="Your Luma lounge account" />

      <section className="px-4">
        <div className="overflow-hidden rounded-[28px] border border-line bg-gradient-to-br from-coral/25 via-ink-2 to-cyan/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
            Member
          </p>
          <h2 className="mt-2 font-display text-2xl font-extrabold text-sand">
            {ready ? `Guest ${userId.slice(-4)}` : "Syncing…"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isPremium || vipTier !== "none"
              ? vipLabel(vipTier)
              : "Free · upgrade for VIP perks"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Coins</p>
              <p className="font-display text-xl font-bold text-gold">{coins}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">XP</p>
              <p className="font-display text-xl font-bold text-cyan">{xp}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          <Link
            href="/wallet"
            className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3.5"
          >
            <Wallet className="h-5 w-5 text-gold" />
            <div className="flex-1">
              <p className="font-display font-bold">Wallet & coins</p>
              <p className="text-xs text-muted">Recharge · history</p>
            </div>
          </Link>
          <Link
            href="/premium"
            className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3.5"
          >
            <Crown className="h-5 w-5 text-cyan" />
            <div className="flex-1">
              <p className="font-display font-bold">VIP Premium</p>
              <p className="text-xs text-muted">Perks · blind match discount</p>
            </div>
          </Link>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2/70 px-4 py-3.5 opacity-80">
            <Settings className="h-5 w-5 text-muted" />
            <div className="flex-1">
              <p className="font-display font-bold">Settings</p>
              <p className="text-xs text-muted">Coming soon</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
