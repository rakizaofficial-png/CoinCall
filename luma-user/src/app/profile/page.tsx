"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, Crown, LogOut, Phone, Settings, Star, Wallet } from "lucide-react";
import { useApp } from "@/lib/store";
import { vipLabel } from "@/lib/ledger";
import { logout, getAuthUser } from "@/lib/auth";
import { APP_VERSION } from "@/lib/version";

export default function ProfilePage() {
  const { coins, xp, vipTier, isPremium, userId, ready } = useApp();
  const router = useRouter();
  const authUser = typeof window !== "undefined" ? getAuthUser() : null;

  const displayName =
    authUser?.displayName ||
    (ready ? `Guest ${userId.slice(-4)}` : "Syncing…");
  const email = authUser?.email ?? null;

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <main className="pb-28">
      <div className="px-4 pb-2 pt-5">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="font-display text-xl font-extrabold text-sand">Profile</h1>
          <span className="version-badge">v{APP_VERSION}</span>
        </div>
      </div>

      {/* Hero card */}
      <section className="px-4">
        <div className="overflow-hidden rounded-[28px] border border-line bg-gradient-to-br from-coral/20 via-ink-2 to-cyan/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-coral/30 to-fuchsia-600/20 text-2xl font-bold text-sand shadow-[0_0_20px_rgba(255,42,122,0.25)]">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-extrabold leading-tight text-sand">
                {displayName}
              </h2>
              {email && (
                <p className="truncate text-xs text-muted">{email}</p>
              )}
              <p className="mt-0.5 text-xs font-semibold text-coral">
                {isPremium || vipTier !== "none"
                  ? vipLabel(vipTier)
                  : "Free · upgrade for VIP perks"}
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="stat-card text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted">Balance</p>
              <p className="font-display text-lg font-bold text-gold">{coins.toLocaleString()}</p>
              <p className="text-[10px] text-muted">coins</p>
            </div>
            <div className="stat-card text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted">XP</p>
              <p className="font-display text-lg font-bold text-cyan">{xp.toLocaleString()}</p>
              <p className="text-[10px] text-muted">points</p>
            </div>
            <div className="stat-card text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted">Tier</p>
              <p className="font-display text-lg font-bold text-coral">
                {vipTier === "none" ? "—" : vipTier.toUpperCase()}
              </p>
              <p className="text-[10px] text-muted">VIP</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="mt-4 px-4 space-y-2">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
          Account
        </p>

        <Link
          href="/wallet"
          className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3.5 active:bg-ink-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15">
            <Wallet className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-bold">Wallet & coins</p>
            <p className="text-xs text-muted">Recharge · history</p>
          </div>
          <span className="text-muted">›</span>
        </Link>

        <Link
          href="/premium"
          className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3.5 active:bg-ink-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan/10">
            <Crown className="h-4 w-4 text-cyan" />
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-bold">VIP Premium</p>
            <p className="text-xs text-muted">Perks · blind match discount</p>
          </div>
          <span className="text-muted">›</span>
        </Link>

        <p className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-muted">
          History
        </p>

        <Link
          href="/profile/coins"
          className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3.5 active:bg-ink-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10">
            <Coins className="h-4 w-4 text-gold" />
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-bold">Coin history</p>
            <p className="text-xs text-muted">Earn · spend · transactions</p>
          </div>
          <span className="text-muted">›</span>
        </Link>

        <Link
          href="/profile/calls"
          className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3.5 active:bg-ink-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral/10">
            <Phone className="h-4 w-4 text-coral" />
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-bold">Call history</p>
            <p className="text-xs text-muted">Completed · missed</p>
          </div>
          <span className="text-muted">›</span>
        </Link>

        <Link
          href="/profile/gifts"
          className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3.5 active:bg-ink-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/10">
            <Star className="h-4 w-4 text-fuchsia-400" />
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-bold">Gifts sent</p>
            <p className="text-xs text-muted">Your gifting history</p>
          </div>
          <span className="text-muted">›</span>
        </Link>

        <p className="mb-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-muted">
          App
        </p>

        <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2/70 px-4 py-3.5 opacity-80">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/10">
            <Settings className="h-4 w-4 text-muted" />
          </div>
          <div className="flex-1">
            <p className="font-display text-sm font-bold">Settings</p>
            <p className="text-xs text-muted">Coming soon</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 active:bg-red-500/20"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15">
            <LogOut className="h-4 w-4 text-red-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-display text-sm font-bold text-red-400">Sign out</p>
            <p className="text-xs text-muted">Log out of your account</p>
          </div>
        </button>
      </section>
    </main>
  );
}
