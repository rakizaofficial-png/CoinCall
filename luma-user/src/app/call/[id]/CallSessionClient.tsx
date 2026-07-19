"use client";

import { use, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Gift,
  Mic,
  MicOff,
  PhoneOff,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-react";
import { FakeLiveVideoPlayer } from "@/components/call/FakeLiveVideoPlayer";
import { GiftSheet } from "@/components/GiftSheet";
import { LowBalanceModal } from "@/components/LowBalanceModal";
import { useCallSessionEngine } from "@/hooks/useCallSessionEngine";
import {
  setUserCameraOff,
  setUserMuted,
  stopUserAgoraCall,
} from "@/lib/agora";
import { effectiveRate, sliceCost } from "@/lib/ledger";
import { useApp } from "@/lib/store";

/**
 * Active call UI — Agora live OR AI prerecorded fallback.
 * Coin ledger (10s slices) runs for BOTH transports identically.
 */
export default function CallSessionClient({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const search = useSearchParams();
  const preferLiveBridge = search.get("live") === "1";
  const isBlur = search.get("blur") === "1";
  const { spend, pushToast, isPremium, coins, openTopUp } = useApp();

  const engine = useCallSessionEngine({
    hostId: id,
    enabled: true,
    preferLiveBridge,
    onConnected: ({ transport, name }) => {
      pushToast(
        transport === "ai_prerecorded"
          ? `You’re live with ${name}`
          : `You’re live with ${name}`,
      );
    },
    onFailed: (message) => pushToast(message),
  });

  const {
    state,
    transport,
    statusText,
    aiHost,
    remoteRef,
    localRef,
    disconnect,
    ratePerMinute,
    displayName,
    displayAvatar,
  } = engine;

  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [blurReveal, setBlurReveal] = useState(isBlur ? 0.08 : 1);
  const [lowBalance, setLowBalance] = useState(false);
  const [graceLeft, setGraceLeft] = useState(15);
  const graceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hangUpRef = useRef<() => Promise<void>>(async () => undefined);

  const rate = isBlur
    ? Math.round(effectiveRate(ratePerMinute, isPremium) * 0.5)
    : effectiveRate(ratePerMinute, isPremium);

  const isRinging = state === "RINGING" || state === "ROUTING";
  const isConnected = state === "CONNECTED";
  const isFailed = state === "FAILED";
  const isAi = transport === "ai_prerecorded";

  const hangUp = async () => {
    await disconnect();
    await stopUserAgoraCall();
    pushToast("Call ended");
  };
  hangUpRef.current = hangUp;

  // Dynamic 10-second coin deduction — identical for Agora + AI fallback
  useEffect(() => {
    if (!isConnected) return;

    const tick = setInterval(() => {
      setSecs((s) => {
        const next = s + 1;

        if (isBlur && next % 10 === 0) {
          setBlurReveal((b) => Math.min(1, b + 0.12));
        }

        if (next > 0 && next % 10 === 0) {
          const cost = sliceCost(rate);
          const ok = spend(cost, `−${cost} coins · 10s`);
          if (!ok) {
            setLowBalance(true);
            setGraceLeft(15);
            openTopUp(15);
            if (!graceRef.current) {
              graceRef.current = setInterval(() => {
                setGraceLeft((g) => {
                  if (g <= 1) {
                    if (graceRef.current) clearInterval(graceRef.current);
                    graceRef.current = null;
                    void hangUpRef.current();
                    pushToast("Call ended — top up to continue");
                    return 0;
                  }
                  return g - 1;
                });
              }, 1000);
            }
          } else if (ok && lowBalance) {
            setLowBalance(false);
            if (graceRef.current) {
              clearInterval(graceRef.current);
              graceRef.current = null;
            }
          }
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(tick);
      if (graceRef.current) {
        clearInterval(graceRef.current);
        graceRef.current = null;
      }
    };
  }, [isBlur, isConnected, rate, spend, pushToast, lowBalance, openTopUp]);

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  const clearBlur = () => {
    if (!isBlur || blurReveal >= 1) return;
    const bonus = Math.max(20, Math.round(rate * 0.4));
    if (!spend(bonus, `Instant Clear · −${bonus} coins`)) return;
    setBlurReveal(1);
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#06040b]">
      {/* AI fake-live full-screen player (no chrome) */}
      {isAi && aiHost && (
        <FakeLiveVideoPlayer
          aiHost={aiHost}
          active={isConnected}
          muted={false}
        />
      )}

      {/* Avatar backdrop while routing / ringing / failed */}
      {!isConnected && (
        <Image
          src={displayAvatar}
          alt={displayName}
          fill
          priority
          className={`object-cover transition ${
            camOff ? "blur-xl brightness-50" : "brightness-75"
          }`}
        />
      )}

      {isRinging && (
        <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center bg-gradient-to-b from-[#06040b] via-ink-2 to-coral/30">
          <div className="relative mb-6">
            <span className="absolute inset-0 animate-ping rounded-full bg-coral/40" />
            <Image
              src={displayAvatar}
              alt=""
              width={120}
              height={120}
              className="relative h-28 w-28 rounded-full object-cover ring-4 ring-coral/50"
            />
          </div>
          <p className="font-display text-2xl font-extrabold">{displayName}</p>
          <p className="mt-2 animate-pulse text-sm font-semibold text-cyan">
            Connecting to Host…
          </p>
          <p className="mt-1 text-xs text-gold/80">{statusText}</p>
        </div>
      )}

      {/* Agora remote surface — only for live transport */}
      <div
        ref={remoteRef}
        id="agora-remote"
        className={`absolute inset-0 bg-black ${
          isConnected && !isAi ? "z-[1] opacity-100" : "z-0 opacity-0"
        }`}
      />

      {isBlur && blurReveal < 1 && isConnected && (
        <div
          className="pointer-events-none absolute inset-0 z-[2] backdrop-blur-2xl transition-all duration-700"
          style={{
            opacity: 1 - blurReveal,
            WebkitBackdropFilter: `blur(${Math.round((1 - blurReveal) * 28)}px)`,
            backdropFilter: `blur(${Math.round((1 - blurReveal) * 28)}px)`,
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/55 via-transparent to-black/85" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute right-4 top-24 z-20 h-36 w-28 overflow-hidden rounded-2xl border border-white/20 bg-ink-3 shadow-xl"
      >
        <div
          ref={localRef}
          id="agora-local"
          className="h-full w-full bg-gradient-to-br from-ink-3 to-coral/30"
        />
        {!isConnected && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
            You
          </div>
        )}
        {isConnected && isAi && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 to-transparent pb-2 text-[10px] font-bold text-white/80">
            You
          </div>
        )}
      </motion.div>

      <div className="relative z-10 flex min-h-dvh flex-col px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <Link
            href="/call"
            className="rounded-full bg-black/40 p-2 backdrop-blur"
            onClick={() => void hangUp()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="rounded-full bg-black/45 px-3 py-1.5 text-center backdrop-blur">
            <p className="text-xs font-bold">
              {isRinging
                ? "Connecting…"
                : isConnected
                  ? isAi
                    ? "Private 1v1"
                    : "Private 1v1 · Live"
                  : isFailed
                    ? "Failed"
                    : "1v1"}
            </p>
            <p className="font-mono text-sm tabular-nums text-gold">
              {mm}:{ss}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGiftOpen(true)}
            className="rounded-full bg-coral p-2 shadow-[0_0_20px_var(--glow)]"
          >
            <Gift className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-8 text-center">
          <h1 className="font-display text-3xl font-extrabold">{displayName}</h1>
          <p className="mt-1 text-sm text-white/70">
            {rate} coins/min
            {isBlur ? " · Blind 50% off" : isPremium ? " · VIP −15%" : ""} ·{" "}
            {coins} coins left
          </p>
          <p className="mt-3 text-sm text-white/80">{statusText}</p>
          {isBlur && blurReveal < 1 && isConnected && (
            <button
              type="button"
              onClick={clearBlur}
              className="relative z-30 mt-4 rounded-full border border-cyan/40 bg-cyan/20 px-4 py-2 text-xs font-bold text-cyan backdrop-blur"
            >
              Instant Clear · reveal now
            </button>
          )}
        </div>

        <div className="mt-auto flex flex-col items-center gap-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setMuted((m) => {
                  const next = !m;
                  if (!isAi) void setUserMuted(next);
                  return next;
                });
              }}
              className="rounded-full bg-white/15 p-4 backdrop-blur"
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setCamOff((c) => {
                  const next = !c;
                  if (!isAi) void setUserCameraOff(next);
                  return next;
                });
              }}
              className="rounded-full bg-white/15 p-4 backdrop-blur"
            >
              {camOff ? (
                <VideoOff className="h-5 w-5" />
              ) : (
                <Video className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              className="rounded-full bg-white/15 p-4 backdrop-blur"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
            <Link
              href="/call"
              className="rounded-full bg-red-500 p-4 shadow-lg"
              onClick={() => void hangUp()}
            >
              <PhoneOff className="h-5 w-5" />
            </Link>
          </div>
          <p className="text-center text-xs text-white/50">
            {isConnected
              ? "Secure private session"
              : "Establishing encrypted media path…"}
          </p>
        </div>
      </div>

      <GiftSheet open={giftOpen} onClose={() => setGiftOpen(false)} />
      <LowBalanceModal
        open={lowBalance}
        graceLeft={graceLeft}
        onDismiss={() => setLowBalance(false)}
        minuteRate={rate}
      />
    </main>
  );
}
