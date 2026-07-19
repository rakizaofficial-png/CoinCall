"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  Coins,
  Crown,
  Heart,
  Shield,
  Sparkles,
  Video,
  Zap,
} from "lucide-react";
import { useApp } from "@/lib/store";

const plans = [
  {
    id: "week",
    name: "VIP Week",
    price: "$4.99",
    period: "/ week",
    coins: 200,
    tag: null as string | null,
  },
  {
    id: "month",
    name: "VIP Month",
    price: "$12.99",
    period: "/ month",
    coins: 800,
    tag: "Most popular",
  },
  {
    id: "year",
    name: "VIP Year",
    price: "$79.99",
    period: "/ year",
    coins: 12000,
    tag: "Best value",
  },
];

const perks = [
  {
    icon: Video,
    title: "Half-price instant match",
    desc: "Random 1v1 matches cost 30 coins instead of 60",
  },
  {
    icon: Coins,
    title: "15% off every call minute",
    desc: "Private video bills cheaper — talk longer",
  },
  {
    icon: Sparkles,
    title: "VIP Flex XP · Silver → Gold → Diamond",
    desc: "Spend coins to climb tiers, unlock borders & entrance FX",
  },
  {
    icon: BadgeCheck,
    title: "VIP badge & frame",
    desc: "Stand out in live rooms and chat lists",
  },
  {
    icon: Heart,
    title: "Priority matching",
    desc: "Skip the queue when creators are busy",
  },
  {
    icon: Shield,
    title: "Blind Match discount",
    desc: "Blur-reveal calls at 50% off the per-minute rate",
  },
];

export default function PremiumPage() {
  const { isPremium, setPremium, addCoins, pushToast, xp, vipTier } = useApp();

  const subscribe = (planId: string) => {
    const plan = plans.find((p) => p.id === planId)!;
    pushToast("Opening Google Play subscription…");
    setTimeout(() => {
      setPremium(true);
      addCoins(plan.coins, `VIP activated · +${plan.coins} welcome coins`);
      pushToast("Welcome to Luma VIP 👑");
    }, 1100);
  };

  return (
    <main>
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-ink/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <Link href="/" className="rounded-full bg-ink-3 p-2">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
            Luma VIP
          </p>
          <h1 className="font-display text-xl font-bold">Premium</h1>
        </div>
        {isPremium && (
          <span className="flex items-center gap-1 rounded-full bg-gold/20 px-2.5 py-1 text-[10px] font-bold text-gold">
            <Crown className="h-3.5 w-3.5" /> Active
          </span>
        )}
      </header>

      <section className="px-4 pb-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/25 via-ink-2 to-coral/15 p-6"
        >
          <div className="absolute -right-4 -top-4 opacity-20">
            <Crown className="h-28 w-28 text-gold" />
          </div>
          <p className="relative flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold">
            <Zap className="h-3.5 w-3.5" /> Unlock more moments
          </p>
          <h2 className="relative mt-2 font-display text-3xl font-extrabold leading-tight">
            Talk longer.
            <br />
            Gift bigger.
          </h2>
          <p className="relative mt-2 max-w-[17rem] text-sm text-muted">
            VIP is built for fans — cheaper matches, call discounts, and XP tiers
            (Silver · Gold · Diamond). Your XP: {xp} · {vipTier}
          </p>
        </motion.div>
      </section>

      {isPremium ? (
        <section className="px-4 pb-6">
          <div className="rounded-2xl border border-teal/30 bg-teal/10 px-4 py-5 text-center">
            <Crown className="mx-auto h-8 w-8 text-gold" />
            <p className="mt-2 font-display text-lg font-bold">
              You’re on Luma VIP
            </p>
            <p className="mt-1 text-sm text-muted">
              Enjoy discounted calls, priority match, and double check-ins.
            </p>
            <Link
              href="/call"
              className="mt-4 inline-flex rounded-full bg-coral px-5 py-2.5 text-sm font-bold text-white"
            >
              Start a VIP match
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-2.5 px-4 pb-5">
          {plans.map((plan, i) => (
            <motion.button
              key={plan.id}
              type="button"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => subscribe(plan.id)}
              className={`relative flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left ${
                plan.tag === "Most popular"
                  ? "border-coral bg-coral/10"
                  : "border-line bg-ink-2"
              }`}
            >
              {plan.tag && (
                <span
                  className={`absolute -top-2 right-4 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    plan.tag === "Best value"
                      ? "bg-gold text-ink"
                      : "bg-coral text-white"
                  }`}
                >
                  {plan.tag}
                </span>
              )}
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold">
                <Crown className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold">{plan.name}</p>
                <p className="text-xs text-muted">
                  +{plan.coins.toLocaleString()} welcome coins · Play Store
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-extrabold">
                  {plan.price}
                </p>
                <p className="text-[10px] text-muted">{plan.period}</p>
              </div>
            </motion.button>
          ))}
          <p className="pt-1 text-center text-[11px] text-muted">
            Auto-renews via Google Play · cancel anytime in Play subscriptions
          </p>
        </section>
      )}

      <section className="px-4 pb-10">
        <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-muted">
          What’s included
        </h3>
        <ul className="space-y-2.5">
          {perks.map((perk, i) => {
            const Icon = perk.icon;
            return (
              <motion.li
                key={perk.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.04 }}
                className="flex gap-3 rounded-2xl border border-line bg-ink-2/80 px-3.5 py-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-coral">
                  <Icon className="h-4.5 w-4.5 h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold">{perk.title}</p>
                  <p className="text-xs text-muted">{perk.desc}</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
