"use client";

import { use, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Gift, Send, Video } from "lucide-react";
import { getCreator, threads } from "@/lib/data";
import { useApp } from "@/lib/store";
import { GiftSheet } from "@/components/GiftSheet";
import { VipChatBubble } from "@/components/VipChatBubble";
import { WalletDiamond } from "@/components/WalletDiamond";

const starter = [
  { from: "them" as const, text: "Hey you ✨ glad you wrote" },
  { from: "me" as const, text: "Your energy on live was unreal" },
  { from: "them" as const, text: "Aww thank you! Want a private call later?" },
];

export default function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const thread = threads.find((t) => t.id === id) ?? threads[0];
  const creator = getCreator(thread.creatorId);
  const { spend, vipTier, triggerEntranceBlast } = useApp();
  const [messages, setMessages] = useState(starter);
  const [text, setText] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);

  const send = () => {
    if (!text.trim()) return;
    if (vipTier === "diamond") {
      triggerEntranceBlast();
    }
    setMessages((m) => [...m, { from: "me" as const, text: text.trim() }]);
    setText("");
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          from: "them" as const,
          text: "Haha love that — talk soon? 💫",
        },
      ]);
    }, 900);
  };

  const unlockPhoto = () => {
    spend(40, "Unlocked a photo 📸");
  };

  return (
    <main className="flex min-h-dvh flex-col bg-[#06040b]">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cyan/15 bg-[#06040b]/90 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <Link href="/messages" className="rounded-full bg-ink-3 p-2 text-cyan">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Image
          src={creator.image}
          alt={creator.name}
          width={40}
          height={40}
          className="h-10 w-10 rounded-full object-cover ring-2 ring-cyan/40"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold leading-tight">{creator.name}</p>
          <p className="text-[11px] font-semibold text-cyan">
            {creator.online ? "Online now" : "Last seen recently"}
          </p>
        </div>
        <WalletDiamond compact />
        <Link
          href={`/call/${creator.id}`}
          className="rounded-full bg-coral p-2.5 shadow-[0_0_16px_rgba(255,42,122,0.4)]"
        >
          <Video className="h-4 w-4" />
        </Link>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
          >
            <VipChatBubble tier={vipTier} fromMe={m.from === "me"}>
              {m.text}
            </VipChatBubble>
          </motion.div>
        ))}

        <button
          type="button"
          onClick={unlockPhoto}
          className="mx-auto flex w-full max-w-xs flex-col items-center gap-2 rounded-2xl border border-dashed border-cyan/30 bg-ink-2 px-4 py-6 shadow-[0_0_16px_rgba(0,240,255,0.12)]"
        >
          <span className="text-2xl">🔒</span>
          <span className="text-xs font-semibold text-cyan">
            Unlock exclusive snap · 40 coins
          </span>
        </button>
      </div>

      <div className="border-t border-cyan/15 bg-ink-2/80 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGiftOpen(true)}
            className="rounded-full bg-ink-3 p-2.5 text-gold"
          >
            <Gift className="h-5 w-5" />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Write something that lands…"
            className="flex-1 rounded-full border border-cyan/25 bg-[#06040b] px-4 py-2.5 text-sm text-sand outline-none placeholder:text-cyan/40"
          />
          <button
            type="button"
            onClick={send}
            className="rounded-full bg-cyan p-2.5 text-ink shadow-[0_0_16px_rgba(0,240,255,0.45)]"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <GiftSheet open={giftOpen} onClose={() => setGiftOpen(false)} />
    </main>
  );
}
