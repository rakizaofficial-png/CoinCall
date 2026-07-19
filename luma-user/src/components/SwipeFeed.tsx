"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Eye,
  Gift,
  Phone,
  Radio,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";
import { GiftSheet } from "@/components/GiftSheet";
import { HostProfileSheet } from "@/components/HostProfileSheet";
import { LoungeShell } from "@/components/LoungeShell";
import { VipRibbon } from "@/components/VipRibbon";
import { WalletDiamond } from "@/components/WalletDiamond";
import { giftTickerLines } from "@/lib/data";
import { fetchLiveHosts, type LiveHost } from "@/lib/api";
import {
  resolveHostActivity,
  type HostActivityMode,
} from "@/lib/hostActivity";
import { useApp } from "@/lib/store";

type FeedItem = { host: LiveHost };

function ActivityBadge({
  mode,
  label,
  extra,
}: {
  mode: HostActivityMode;
  label: string;
  extra?: string;
}) {
  if (mode === "party_room") {
    return (
      <motion.span
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="inline-flex items-center gap-1.5 rounded-full border border-cyan/50 bg-cyan/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan shadow-[0_0_18px_rgba(0,240,255,0.45)]"
      >
        <Users className="h-3 w-3" />
        {label}
        {extra ? <span className="text-cyan/70">· {extra}</span> : null}
      </motion.span>
    );
  }
  if (mode === "pk_battle") {
    return (
      <motion.span
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="inline-flex items-center gap-1.5 rounded-full border border-coral/55 bg-coral/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#ff8fb8] shadow-[0_0_18px_rgba(255,42,122,0.45)]"
      >
        <Swords className="h-3 w-3" />
        {label}
        {extra ? <span className="opacity-80">· {extra}</span> : null}
      </motion.span>
    );
  }
  return (
    <span className="live-pulse inline-flex items-center gap-1 rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold uppercase text-white">
      <Radio className="h-3 w-3" /> {label}
    </span>
  );
}

export function SwipeFeed() {
  const router = useRouter();
  const { openTopUp, coins } = useApp();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [index, setIndex] = useState(0);
  const [giftOpen, setGiftOpen] = useState(false);
  const [ticker, setTicker] = useState(0);
  const [blurOn, setBlurOn] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const touchY = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      // Prefer ready-to-call hosts; fall back to every online host on the bridge
      const hosts = await fetchLiveHosts({ readyOnly: true });
      const list = hosts.length ? hosts : await fetchLiveHosts();
      setItems(
        list
          .filter((h) => h.isOnline)
          .map((h) => ({ host: h })),
      );
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(
      () => setTicker((i) => (i + 1) % giftTickerLines.length),
      3200,
    );
    return () => clearInterval(t);
  }, []);

  const current = items[index];
  const next = () => {
    if (!items.length) return;
    setIndex((i) => (i + 1) % items.length);
    setBlurOn(false);
  };
  const prev = () => {
    if (!items.length) return;
    setIndex((i) => (i - 1 + items.length) % items.length);
    setBlurOn(false);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchY.current;
    if (dy < -48) next();
    if (dy > 48) prev();
    touchY.current = null;
  };

  const hostId = current?.host.id ?? "";
  const activity = current
    ? resolveHostActivity(hostId, {
        isLive: current.host.isLive,
        isOnCall: current.host.isOnCall,
        readyToCall: current.host.readyToCall,
      })
    : null;

  const rate = current?.host.ratePerMinute ?? 80;

  const openProfile = () => {
    if (!current) return;
    setProfileOpen(true);
  };

  const callNow = () => {
    if (!current) return;
    if (coins < rate) {
      openTopUp(15);
      return;
    }
    router.push(
      blurOn
        ? `/call/${current.host.id}?live=1&blur=1`
        : `/call/${current.host.id}?live=1`,
    );
  };

  if (!items.length) {
    return (
      <LoungeShell minuteRate={80} enableAutoTopUp={false}>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-display text-lg font-bold text-sand">
            No hosts ready yet
          </p>
          <p className="text-sm text-cyan/70">
            Open CoinCall host → Calling → Go Online. Hosts sync here from
            `/api/hosts` every few seconds.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-cyan/40 px-4 py-2 text-xs font-bold text-cyan"
          >
            Refresh API
          </button>
        </div>
      </LoungeShell>
    );
  }

  if (!current || !activity) {
    return (
      <LoungeShell minuteRate={80}>
        <div className="flex min-h-[70dvh] items-center justify-center px-6 text-center text-sm text-cyan/70">
          Syncing live hosts…
        </div>
      </LoungeShell>
    );
  }

  const name = current.host.name;
  const image =
    current.host.avatarUrl ||
    `https://i.pravatar.cc/800?u=${encodeURIComponent(current.host.id)}`;
  const meta = `${current.host.country || "Live"} · ${activity.label}`;
  const viewers = activity.viewers;

  return (
    <LoungeShell minuteRate={rate}>
      <div
        className="relative h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] overflow-hidden bg-[#06040b]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onWheel={(e) => {
          if (e.deltaY > 30) next();
          if (e.deltaY < -30) prev();
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={hostId}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0 cursor-pointer"
            onClick={openProfile}
          >
            <Image
              src={image}
              alt={name}
              fill
              priority
              className={`object-cover transition duration-700 ${
                blurOn ? "scale-110 blur-2xl brightness-75" : "brightness-90"
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-[#06040b]/95" />
          </motion.div>
        </AnimatePresence>

        <div className="pointer-events-none relative z-10 flex h-full flex-col px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-start justify-between gap-3">
            <VipRibbon />
            <div className="flex items-center gap-2">
              <WalletDiamond compact />
              <span className="rounded-full border border-cyan/30 bg-black/50 px-2.5 py-1 text-[10px] font-bold text-cyan backdrop-blur">
                Swipe ↑
              </span>
            </div>
          </div>

          {/* Floating Party / PK indicator */}
          <div className="pointer-events-none mt-4 flex justify-center">
            <ActivityBadge
              mode={activity.mode}
              label={activity.label}
              extra={
                activity.mode === "party_room"
                  ? `${activity.seats} seats`
                  : activity.mode === "pk_battle"
                    ? activity.pkScore
                    : undefined
              }
            />
          </div>

          <div className="mt-auto flex items-end gap-3">
            <div className="pointer-events-auto min-w-0 flex-1 pb-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {viewers != null && viewers > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan/80">
                    <Eye className="h-3 w-3" /> {viewers.toLocaleString()}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={openProfile}
                className="text-left"
              >
                <h1 className="font-display text-3xl font-extrabold text-white drop-shadow-[0_0_20px_rgba(0,240,255,0.25)]">
                  {name}
                </h1>
                <p className="mt-1 text-sm text-cyan/75">{meta}</p>
                <p className="mt-2 text-[11px] font-semibold text-sand/80">
                  Tap profile · gifts · text · call
                </p>
              </button>
              <AnimatePresence mode="wait">
                <motion.p
                  key={ticker}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="mt-3 truncate text-xs font-semibold text-gold"
                >
                  {giftTickerLines[ticker]}
                </motion.p>
              </AnimatePresence>
              {blurOn && (
                <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-cyan">
                  <Sparkles className="h-3.5 w-3.5" />
                  Blind match · frosted reveal · Instant Clear available
                </p>
              )}
            </div>

            <div className="pointer-events-auto flex flex-col items-center gap-3 pb-1">
              <div className="relative">
                <Image
                  src={image}
                  alt=""
                  width={52}
                  height={52}
                  className="h-[52px] w-[52px] rounded-full object-cover ring-2 ring-cyan shadow-[0_0_16px_rgba(0,240,255,0.45)]"
                />
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 animate-pulse rounded-full border-2 border-ink bg-cyan" />
              </div>

              <button
                type="button"
                onClick={callNow}
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-coral shadow-[0_0_28px_rgba(255,42,122,0.55)]">
                  <Phone className="h-6 w-6 text-white" />
                </span>
                <span className="text-[10px] font-bold text-cyan">
                  {rate} /min
                </span>
              </button>

              {activity.mode === "party_room" && (
                <button
                  type="button"
                  onClick={() => router.push(`/party/${hostId}`)}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan/50 bg-cyan/20 shadow-[0_0_16px_rgba(0,240,255,0.4)]">
                    <Users className="h-5 w-5 text-cyan" />
                  </span>
                  <span className="text-[10px] font-semibold text-cyan">
                    Party
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setGiftOpen(true)}
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur">
                  <Gift className="h-5 w-5 text-gold" />
                </span>
                <span className="text-[10px] font-semibold text-sand/80">
                  Gift
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBlurOn((b) => !b)}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur ${
                    blurOn
                      ? "bg-cyan/30 ring-2 ring-cyan"
                      : "bg-white/10"
                  }`}
                >
                  <Sparkles className="h-5 w-5 text-cyan" />
                </span>
                <span className="text-[10px] font-semibold text-cyan">Blur</span>
              </button>

              <Link
                href="/premium"
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20 text-gold backdrop-blur">
                  ★
                </span>
                <span className="text-[10px] font-semibold text-gold">VIP</span>
              </Link>
            </div>
          </div>
        </div>

        <GiftSheet
          open={giftOpen}
          onClose={() => setGiftOpen(false)}
          hostId={current?.host.id}
        />

        <HostProfileSheet
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          host={
            current
              ? {
                  id: current.host.id,
                  name: current.host.name,
                  avatarUrl: image,
                  country: current.host.country,
                  ratePerMinute: rate,
                  isLive: current.host.isLive,
                  isOnline: current.host.isOnline,
                }
              : null
          }
        />
      </div>
    </LoungeShell>
  );
}
