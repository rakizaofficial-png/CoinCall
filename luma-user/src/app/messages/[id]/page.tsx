"use client";

import { use, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Gift, Send, Video } from "lucide-react";
import { creators, getCreator, threads } from "@/lib/data";
import { useApp } from "@/lib/store";
import { GiftSheet } from "@/components/GiftSheet";
import { VipChatBubble } from "@/components/VipChatBubble";
import { WalletDiamond } from "@/components/WalletDiamond";
import { requireApiBase } from "@/config/apiConfig";
import { getDeviceUserId } from "@/lib/walletApi";

type ChatLine = { from: "me" | "them"; text: string };

export default function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { vipTier, triggerEntranceBlast, inbox, pushToast } = useApp();

  const hostIdFromRoute = id.startsWith("host_")
    ? decodeURIComponent(id.slice(5))
    : null;

  const thread = threads.find((t) => t.id === id) ?? null;
  const mockCreator = thread
    ? getCreator(thread.creatorId) ?? creators[0]
    : null;

  const hostId = hostIdFromRoute || mockCreator?.id || "host";
  const hostName =
    inbox.find((m) => m.hostId === hostId)?.hostName ||
    mockCreator?.name ||
    "Host";
  const hostImage =
    mockCreator?.image ||
    `https://i.pravatar.cc/200?u=${encodeURIComponent(hostId)}`;

  const massNotes = useMemo(
    () =>
      inbox
        .filter((m) => m.hostId === hostId)
        .map((m) => ({ from: "them" as const, text: m.text })),
    [inbox, hostId],
  );

  const [messages, setMessages] = useState<ChatLine[]>(() => massNotes);
  const [text, setText] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (massNotes.length) setMessages(massNotes);
  }, [massNotes]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (vipTier === "diamond") triggerEntranceBlast();
    setSending(true);
    setMessages((m) => [...m, { from: "me", text: body }]);
    setText("");
    try {
      const userId = getDeviceUserId();
      const res = await fetch(`${requireApiBase()}/dm/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({
          fromId: userId,
          toId: hostId,
          text: body,
          fromName: "Luma Fan",
          fromRole: "user",
          peerName: hostName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Message failed");
    } catch (e) {
      pushToast?.(e instanceof Error ? e.message : "Could not send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-[#06040b]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cyan/15 bg-[#06040b]/90 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <Link href="/messages" className="rounded-full bg-ink-3 p-2 text-cyan">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Image
          src={hostImage}
          alt={hostName}
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 rounded-full object-cover ring-2 ring-cyan/40"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold leading-tight">{hostName}</p>
          <p className="text-[11px] font-semibold text-cyan">Host chat</p>
        </div>
        <WalletDiamond compact />
        <Link
          href={`/call/${encodeURIComponent(hostId)}?live=1`}
          className="rounded-full bg-coral p-2.5 shadow-[0_0_16px_rgba(255,42,122,0.4)]"
        >
          <Video className="h-4 w-4" />
        </Link>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted">Say hi to start the chat</p>
        ) : null}
        {messages.map((m, i) => (
          <motion.div
            key={`${m.from}-${i}-${m.text.slice(0, 12)}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
          >
            <VipChatBubble tier={vipTier} fromMe={m.from === "me"}>
              {m.text}
            </VipChatBubble>
          </motion.div>
        ))}
      </div>

      <div className="border-t border-line bg-ink-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setGiftOpen(true)}
            className="rounded-full bg-ink-3 p-2.5 text-coral"
          >
            <Gift className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Message…"
            className="flex-1 rounded-full border border-line bg-ink-3 px-4 py-2.5 text-sm outline-none focus:border-cyan"
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => void send()}
            className="rounded-full bg-cyan p-2.5 text-ink disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <GiftSheet
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        hostId={hostId}
      />
    </main>
  );
}
