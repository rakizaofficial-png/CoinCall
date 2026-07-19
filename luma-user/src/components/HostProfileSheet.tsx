"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageCircle,
  Phone,
  Radio,
  X,
  BadgeCheck,
} from "lucide-react";
import { gifts } from "@/lib/data";
import { GiftSheet } from "@/components/GiftSheet";
import { useApp } from "@/lib/store";

export type HostProfileData = {
  id: string;
  name: string;
  avatarUrl: string;
  country?: string;
  ratePerMinute: number;
  isLive?: boolean;
  isOnline?: boolean;
  bio?: string;
};

export function HostProfileSheet({
  host,
  open,
  onClose,
}: {
  host: HostProfileData | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { coins, openTopUp, pushToast, following, toggleFollow } = useApp();
  const [giftOpen, setGiftOpen] = useState(false);

  useEffect(() => {
    if (!open) setGiftOpen(false);
  }, [open]);

  if (!host) return null;

  const rate = host.ratePerMinute || 80;

  const startCall = () => {
    if (coins < rate) {
      openTopUp(15);
      return;
    }
    onClose();
    router.push(`/call/${encodeURIComponent(host.id)}?live=1`);
  };

  const openChat = () => {
    onClose();
    router.push(`/messages/host_${encodeURIComponent(host.id)}`);
  };

  const watchLive = () => {
    onClose();
    router.push(`/live/${encodeURIComponent(host.id)}`);
  };

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              initial={{ y: 48, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="relative z-10 max-h-[92dvh] w-full max-w-md overflow-hidden rounded-t-[28px] border border-white/10 bg-gradient-to-b from-[#1a1428] via-[#0e0b16] to-[#06040b] shadow-[0_-20px_60px_rgba(0,0,0,0.55)] sm:rounded-[28px]"
            >
              <div className="relative h-52 w-full overflow-hidden">
                <Image
                  src={host.avatarUrl}
                  alt={host.name}
                  fill
                  unoptimized
                  className="object-cover"
                  sizes="430px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0b16] via-black/20 to-transparent" />
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-3 top-3 rounded-full bg-black/45 p-2 backdrop-blur"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
                {host.isLive ? (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-coral px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    <Radio className="h-3 w-3" /> Live
                  </span>
                ) : host.isOnline ? (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-cyan/95 px-2.5 py-1 text-[10px] font-bold uppercase text-ink">
                    <span className="h-1.5 w-1.5 rounded-full bg-ink" /> Online
                  </span>
                ) : null}
              </div>

              <div className="space-y-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
                <div className="-mt-10 flex items-end gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-2 ring-cyan/60 shadow-[0_0_24px_rgba(0,240,255,0.35)]">
                    <Image
                      src={host.avatarUrl}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate font-display text-2xl font-extrabold text-sand">
                        {host.name}
                      </h2>
                      <BadgeCheck className="h-5 w-5 shrink-0 fill-cyan text-ink" />
                    </div>
                    <p className="text-sm text-cyan/75">
                      {host.country || "CoinCall"} · {rate} coins/min
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFollow(host.id)}
                    className="mb-1 shrink-0 rounded-full bg-coral px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    {following.includes(host.id) ? "Following" : "Follow"}
                  </button>
                </div>

                <p className="text-sm leading-relaxed text-white/65">
                  {host.bio ||
                    "Say hi, send a gift, or start a private video call."}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={openChat}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/5 py-3.5 text-sm font-bold text-sand backdrop-blur transition active:scale-[0.98]"
                  >
                    <MessageCircle className="h-4 w-4 text-cyan" />
                    Text
                  </button>
                  <button
                    type="button"
                    onClick={startCall}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-coral to-[#ff6b9d] py-3.5 text-sm font-bold text-white shadow-[0_10px_28px_rgba(255,42,122,0.4)] transition active:scale-[0.98]"
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </button>
                </div>

                {host.isLive ? (
                  <button
                    type="button"
                    onClick={watchLive}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-coral/40 bg-coral/15 py-3 text-sm font-bold text-coral"
                  >
                    <Radio className="h-4 w-4" />
                    Watch live video
                  </button>
                ) : null}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold/90">
                      Send a gift
                    </p>
                    <span className="text-[11px] text-muted">{coins} coins</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {gifts.slice(0, 6).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          if (coins < g.coins) {
                            openTopUp(15);
                            pushToast("Not enough coins");
                            return;
                          }
                          setGiftOpen(true);
                        }}
                        className="flex flex-col items-center gap-1 rounded-2xl border border-white/8 bg-white/[0.04] px-2 py-3 transition active:bg-white/10"
                      >
                        <span className="text-2xl">{g.emoji}</span>
                        <span className="text-[11px] font-semibold text-sand">
                          {g.name}
                        </span>
                        <span className="text-[10px] font-bold text-gold">
                          {g.coins}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setGiftOpen(true)}
                    className="mt-2 w-full text-center text-xs font-semibold text-cyan"
                  >
                    Open full gift menu
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <GiftSheet
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        hostId={host.id}
        onSent={(emoji) => pushToast(`Sent ${emoji}`)}
      />
    </>
  );
}
