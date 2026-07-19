"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Radio, RefreshCw, Shuffle, Video, Wifi } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { creators } from "@/lib/data";
import { fetchLiveHosts, type LiveHost } from "@/lib/api";
import { useApp } from "@/lib/store";

export default function CallLobbyPage() {
  const router = useRouter();
  const { isPremium, spend, pushToast } = useApp();
  const [liveHosts, setLiveHosts] = useState<LiveHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState(false);
  const onlineDemo = creators.filter((c) => c.online);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const hosts = await fetchLiveHosts();
      setLiveHosts(hosts);
      setApiOk(true);
    } catch {
      setLiveHosts([]);
      setApiOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const randomMatch = () => {
    if (liveHosts.length) {
      const pick = liveHosts[Math.floor(Math.random() * liveHosts.length)];
      const cost = isPremium ? 30 : 60;
      if (!spend(cost, "Matching a live CoinCall host…")) return;
      router.push(`/call/${pick.id}?live=1`);
      return;
    }
    const cost = isPremium ? 30 : 60;
    if (!spend(cost, isPremium ? "VIP demo match ⚡" : "Demo match ⚡")) return;
    const pick = onlineDemo[Math.floor(Math.random() * onlineDemo.length)];
    pushToast(`Demo only — open CoinCall host & Go Online`);
    router.push(`/call/${pick.id}`);
  };

  const blindMatch = () => {
    if (liveHosts.length) {
      const pick = liveHosts[Math.floor(Math.random() * liveHosts.length)];
      const cost = isPremium ? 15 : 30;
      if (!spend(cost, "Blind match · blur reveal…")) return;
      router.push(`/call/${pick.id}?live=1&blur=1`);
      return;
    }
    const cost = isPremium ? 15 : 30;
    if (!spend(cost, "Blind demo match…")) return;
    const pick = onlineDemo[Math.floor(Math.random() * onlineDemo.length)];
    pushToast("Blind match demo — Instant Clear unlocks video");
    router.push(`/call/${pick.id}?blur=1`);
  };

  return (
    <main>
      <TopBar
        title="1v1 Video"
        subtitle="Call real CoinCall hosts — coins per minute"
      />

      <section className="px-4 pb-3">
        <div
          className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-xs ${
            apiOk
              ? "border-teal/30 bg-teal/10 text-teal"
              : "border-coral/30 bg-coral/10 text-coral"
          }`}
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <Wifi className="h-3.5 w-3.5" />
            {apiOk
              ? `Live hosts · ${liveHosts.length}`
              : "Waiting for CoinCall API…"}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full p-1.5 hover:bg-black/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </section>

      <section className="px-4 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl border border-line bg-ink-2"
        >
          <div className="relative h-36 bg-gradient-to-br from-coral/40 via-ink-2 to-gold/20" />
          <div className="p-5 text-center">
            <h2 className="font-display text-2xl font-extrabold">
              Call a live host
            </h2>
            <p className="mt-1 text-sm text-muted">
              Rings CoinCall host app → they accept → Agora connects
            </p>
            <button
              type="button"
              onClick={randomMatch}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-coral py-3.5 text-sm font-bold text-white shadow-[0_10px_40px_var(--glow)]"
            >
              <Shuffle className="h-4 w-4" />
              {liveHosts.length
                ? `Match live host · ${isPremium ? 30 : 60} coins`
                : `Demo match · ${isPremium ? 30 : 60} coins`}
            </button>
            <button
              type="button"
              onClick={blindMatch}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 py-3 text-sm font-bold text-cyan"
            >
              Blind Match · 50% off + blur reveal
            </button>
          </div>
        </motion.div>
      </section>

      <h3 className="px-4 pb-2 font-display text-sm font-bold uppercase tracking-wider text-muted">
        Live on CoinCall
      </h3>
      <section className="space-y-2.5 px-4 pb-4">
        {!loading && liveHosts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-ink-2/60 px-4 py-6 text-center text-sm text-muted">
            No hosts online. Open <span className="text-sand">CoinCall</span>{" "}
            host app → tap <span className="text-teal">Online</span>.
          </div>
        )}
        {liveHosts.map((h, i) => (
          <motion.div
            key={h.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 rounded-2xl border border-teal/25 bg-ink-2 p-3"
          >
            <div className="relative">
              <Image
                src={
                  h.avatarUrl ||
                  `https://i.pravatar.cc/120?u=${encodeURIComponent(h.id)}`
                }
                alt={h.name}
                width={56}
                height={56}
                className="h-14 w-14 rounded-2xl object-cover"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink-2 bg-teal" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold">{h.name}</p>
              <p className="truncate text-xs text-muted">
                {h.country || "CoinCall host"}
                {h.isLive ? " · LIVE" : ""}
                {h.isOnCall
                  ? " · Busy"
                  : h.readyToCall !== false
                    ? " · Ready"
                    : " · Waiting"}
              </p>
              <p className="mt-0.5 text-[11px] text-gold">
                {h.ratePerMinute} coins/min
              </p>
            </div>
            <Link
              href={`/call/${h.id}?live=1`}
              className={`flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold ${
                h.isOnCall
                  ? "border border-line text-muted"
                  : "bg-sand text-ink"
              }`}
            >
              {h.isLive ? (
                <Radio className="h-3.5 w-3.5" />
              ) : (
                <Video className="h-3.5 w-3.5" />
              )}
              {h.isOnCall ? "Busy" : "Call"}
            </Link>
          </motion.div>
        ))}
      </section>

      <h3 className="px-4 pb-2 font-display text-sm font-bold uppercase tracking-wider text-muted">
        Demo creators
      </h3>
      <section className="space-y-2.5 px-4 pb-8">
        {onlineDemo.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2/70 p-3 opacity-80"
          >
            <Image
              src={c.image}
              alt={c.name}
              width={48}
              height={48}
              className="h-12 w-12 rounded-2xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold">
                {c.name} {c.flag}
              </p>
              <p className="text-[11px] text-muted">Preview only · not bridged</p>
            </div>
            <Link
              href={`/call/${c.id}`}
              className="rounded-full border border-line px-3 py-1.5 text-[10px] font-bold text-muted"
            >
              Demo
            </Link>
          </motion.div>
        ))}
      </section>
    </main>
  );
}
