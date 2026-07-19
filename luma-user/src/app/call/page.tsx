"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BadgeCheck, Shuffle, Video } from "lucide-react";
import { WalletDiamond } from "@/components/WalletDiamond";
import {
  HostProfileSheet,
  type HostProfileData,
} from "@/components/HostProfileSheet";
import { creators } from "@/lib/data";
import { fetchLiveHosts, type LiveHost } from "@/lib/api";
import { useApp } from "@/lib/store";

function flagFor(country?: string) {
  const c = (country || "").toLowerCase();
  if (c.includes("pakistan") || c === "pk") return "🇵🇰";
  if (c.includes("japan") || c === "jp") return "🇯🇵";
  if (c.includes("india") || c === "in") return "🇮🇳";
  if (c.includes("korea") || c === "kr") return "🇰🇷";
  if (c.includes("china") || c === "cn") return "🇨🇳";
  if (c.includes("usa") || c.includes("united states") || c === "us") return "🇺🇸";
  if (c.includes("uk") || c.includes("united kingdom")) return "🇬🇧";
  return "🌍";
}

function ratingFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 2)) % 40;
  return (4.5 + (h % 5) * 0.1).toFixed(1);
}

type CardHost = {
  id: string;
  name: string;
  avatarUrl: string;
  country?: string;
  ratePerMinute: number;
  online: boolean;
  live?: boolean;
};

export default function CallingLoungePage() {
  const router = useRouter();
  const { spend, pushToast, isPremium } = useApp();
  const [liveHosts, setLiveHosts] = useState<LiveHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileHost, setProfileHost] = useState<HostProfileData | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const hosts = await fetchLiveHosts();
      setLiveHosts(hosts.filter((h) => h.isOnline));
    } catch {
      setLiveHosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const cards: CardHost[] = useMemo(() => {
    if (liveHosts.length) {
      return liveHosts.map((h) => ({
        id: h.id,
        name: h.name,
        avatarUrl:
          h.avatarUrl ||
          `https://i.pravatar.cc/600?u=${encodeURIComponent(h.id)}`,
        country: h.country,
        ratePerMinute: h.ratePerMinute || 80,
        online: true,
        live: h.isLive,
      }));
    }
    return creators
      .filter((c) => c.online)
      .slice(0, 6)
      .map((c) => ({
        id: c.id,
        name: c.name,
        avatarUrl: c.image,
        country: c.country,
        ratePerMinute: c.callRate,
        online: true,
      }));
  }, [liveHosts]);

  const match = () => {
    if (!cards.length) {
      pushToast("No hosts online yet");
      return;
    }
    const pick = cards[Math.floor(Math.random() * cards.length)];
    const cost = isPremium ? 30 : 60;
    if (!spend(cost, "Matching a host…")) return;
    router.push(`/call/${pick.id}?live=1`);
  };

  const openProfile = (h: CardHost) => {
    setProfileHost({
      id: h.id,
      name: h.name,
      avatarUrl: h.avatarUrl,
      country: h.country,
      ratePerMinute: h.ratePerMinute,
      isLive: h.live,
      isOnline: h.online,
    });
  };

  return (
    <main className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 flex items-start justify-between gap-3 bg-[#06040b]/88 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="min-w-0">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan">
            Luma Lounge
          </p>
          <h1 className="font-display text-[28px] font-extrabold leading-none text-sand">
            1V1 Calling
          </h1>
          <p className="mt-1 text-sm text-cyan/75">Private video calls</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <button
            type="button"
            onClick={match}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-coral to-coral-2 px-3.5 py-2 text-xs font-bold text-white shadow-[0_8px_24px_rgba(255,42,122,0.45)]"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Match
          </button>
          <WalletDiamond />
        </div>
      </header>

      <section className="space-y-4 px-4 pt-1">
        {loading && !cards.length ? (
          <div className="rounded-3xl border border-line bg-ink-2/70 px-4 py-16 text-center text-sm text-muted">
            Syncing hosts…
          </div>
        ) : null}

        {!loading && liveHosts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line bg-ink-2/50 px-4 py-4 text-center text-xs text-muted">
            Showing lounge preview — open CoinCall host → Go Online for live
            calls
          </div>
        ) : null}

        {cards.map((h, i) => (
          <motion.article
            key={h.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative overflow-hidden rounded-[28px] border border-white/10 bg-ink-2 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
          >
            <button
              type="button"
              className="relative block aspect-[4/5] w-full text-left"
              onClick={() => openProfile(h)}
            >
              <Image
                src={h.avatarUrl}
                alt={h.name}
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 430px) 100vw, 430px"
                priority={i < 2}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

              <div className="absolute left-3 top-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan/95 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink shadow-[0_0_18px_rgba(0,240,255,0.45)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                  Online
                </span>
              </div>

              <div className="absolute inset-x-0 bottom-0 space-y-3 p-4">
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <h2 className="font-display text-2xl font-extrabold text-white">
                      {h.name}
                    </h2>
                    <BadgeCheck className="h-5 w-5 fill-cyan text-ink" />
                  </div>
                  <p className="text-sm text-sand/85">
                    {flagFor(h.country)} {h.country || "CoinCall"} · ★{" "}
                    {ratingFor(h.id)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gold">
                    {h.ratePerMinute} coins/min
                  </p>
                </div>
                <span className="flex w-full items-center justify-center gap-2 rounded-full bg-sand py-3.5 text-sm font-extrabold text-ink">
                  <Video className="h-4 w-4" />
                  View profile
                </span>
              </div>
            </button>
          </motion.article>
        ))}
      </section>

      <HostProfileSheet
        open={Boolean(profileHost)}
        onClose={() => setProfileHost(null)}
        host={profileHost}
      />
    </main>
  );
}
