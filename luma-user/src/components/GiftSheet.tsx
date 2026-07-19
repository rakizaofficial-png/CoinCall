"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { gifts } from "@/lib/data";
import { useApp } from "@/lib/store";
import { getDeviceUserId } from "@/lib/walletApi";
import { requireApiBase } from "@/config/apiConfig";
import { getRealtimeClient } from "@/lib/realtime/websocket";

export function GiftSheet({
  open,
  onClose,
  onSent,
  hostId,
  roomId,
  callId,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: (emoji: string) => void;
  hostId?: string;
  roomId?: string;
  callId?: string;
}) {
  const { spend, syncWallet, pushToast } = useApp();
  const [sending, setSending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (id: string, coins: number, emoji: string, name: string) => {
    if (busy) return;
    setBusy(true);
    try {
      if (hostId) {
        const res = await fetch(`${requireApiBase()}/gifts/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: getDeviceUserId(),
            userName: "Luma Fan",
            hostId,
            giftId: id,
            roomId,
            callId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gift failed");
        await syncWallet?.();
        try {
          getRealtimeClient(getDeviceUserId()).sendGift({
            roomId,
            toHostId: hostId,
            giftId: id,
            coins,
            label: name,
          });
        } catch {
          // optional WS mirror
        }
      } else if (!spend(coins, `Sent ${name} ${emoji}`)) {
        setBusy(false);
        return;
      }

      setSending(emoji);
      onSent?.(emoji);
      setTimeout(() => {
        setSending(null);
        onClose();
        setBusy(false);
      }, 700);
    } catch (e) {
      pushToast?.(
        e instanceof Error ? e.message : "Could not send gift",
      );
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 rounded-t-3xl border border-line bg-ink-2 px-4 pb-8 pt-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">Send a gift</h3>
                <p className="text-xs text-muted">
                  {hostId ? "Goes to the host · coins deducted" : "Make the moment unforgettable"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-ink-3 p-2 text-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {gifts.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(g.id, g.coins, g.emoji, g.name)}
                  className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-ink-3 px-2 py-3 transition active:scale-95 disabled:opacity-50"
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="text-xs font-semibold">{g.name}</span>
                  <span className="text-[10px] text-gold">{g.coins} coins</span>
                </button>
              ))}
            </div>
            {sending && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="gift-float text-5xl">{sending}</span>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
