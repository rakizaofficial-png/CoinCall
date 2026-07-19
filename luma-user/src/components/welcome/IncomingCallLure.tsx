"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Phone, PhoneOff } from "lucide-react";
import type { WelcomePushHost } from "@/lib/welcomePush/config";

/**
 * Full-screen incoming WebRTC-style lure.
 * Green Accept occupies ~70% of the lower action zone.
 */
export function IncomingCallLure({
  host,
  onAccept,
  onReject,
}: {
  host: WelcomePushHost;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] mx-auto flex w-full max-w-[430px] flex-col overflow-hidden bg-[#06040b]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Image
        src={host.avatar}
        alt={host.name}
        fill
        priority
        className="object-cover brightness-[0.45]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-[#06040b]/40 to-[#06040b]" />

      {/* Top status — looks like system call UI */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan">
          Luma · Encrypted
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/15 px-2.5 py-1 text-[10px] font-bold text-teal">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
          Incoming video
        </span>
      </div>

      <div className="relative z-10 mt-10 flex flex-1 flex-col items-center px-6">
        <div className="relative">
          <motion.span
            className="absolute -inset-4 rounded-full border-2 border-cyan/50"
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 0.2, 0.7] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <motion.span
            className="absolute -inset-8 rounded-full border border-coral/40"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: 0.2 }}
          />
          <Image
            src={host.avatar}
            alt=""
            width={140}
            height={140}
            className="relative h-[140px] w-[140px] rounded-full object-cover ring-4 ring-cyan/60 shadow-[0_0_40px_rgba(0,240,255,0.45)]"
          />
        </div>

        <h1 className="mt-6 font-display text-4xl font-extrabold text-white drop-shadow-[0_0_20px_rgba(0,240,255,0.35)]">
          {host.name}
        </h1>
        <p className="mt-2 text-sm font-semibold text-cyan/90">
          {host.age} · {host.country} · wants a private video call
        </p>
        <motion.p
          className="mt-4 text-xs font-bold uppercase tracking-widest text-gold"
          animate={{ opacity: [1, 0.45, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        >
          Ringing…
        </motion.p>
      </div>

      {/* Lower action zone — Accept = 70% width */}
      <div className="relative z-10 w-full px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <div className="mb-3 flex items-center justify-center gap-2">
          <span className="h-1 w-1 animate-ping rounded-full bg-teal" />
          <p className="text-[11px] font-semibold text-white/70">
            Swipe or tap Accept to answer
          </p>
        </div>

        <div className="flex w-full items-stretch gap-3">
          {/* Reject ~30% */}
          <button
            type="button"
            onClick={onReject}
            className="flex w-[30%] flex-col items-center justify-center gap-2 rounded-[1.5rem] border border-white/15 bg-white/10 py-5 backdrop-blur-md active:scale-[0.98]"
            aria-label="Decline"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 shadow-[0_0_24px_rgba(239,68,68,0.55)]">
              <PhoneOff className="h-7 w-7 text-white" />
            </span>
            <span className="text-xs font-bold text-white/80">Decline</span>
          </button>

          {/* Accept ~70% — maximized tap area */}
          <button
            type="button"
            onClick={onAccept}
            className="flex w-[70%] flex-col items-center justify-center gap-2 rounded-[1.5rem] border border-emerald-400/50 bg-gradient-to-b from-emerald-400/30 to-emerald-600/40 py-5 shadow-[0_0_40px_rgba(16,185,129,0.45)] backdrop-blur-md active:scale-[0.98]"
            aria-label="Accept call"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_32px_rgba(16,185,129,0.7)]">
              <Phone className="h-8 w-8 text-white" fill="currentColor" />
            </span>
            <span className="font-display text-lg font-extrabold text-white">
              Accept
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100/90">
              Answer video call
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
