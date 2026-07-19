"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Eye,
  Gift,
  Heart,
  MessageCircle,
  Video,
} from "lucide-react";
import { getCreator } from "@/lib/data";
import { useApp } from "@/lib/store";
import { GiftSheet } from "@/components/GiftSheet";

const chatFeed = [
  { user: "Alex", text: "This vibe is unreal 🔥" },
  { user: "Kai", text: "Play that song again!" },
  { user: "Nora", text: "Sent a Rose 🌹" },
  { user: "You", text: "Hey! Just joined ✨" },
];

export default function LiveRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const creator = getCreator(id);
  const { coins, following, toggleFollow, spend } = useApp();
  const [giftOpen, setGiftOpen] = useState(false);
  const [likes, setLikes] = useState(0);
  const [viewers, setViewers] = useState(creator.viewers || 1200);
  const [floating, setFloating] = useState<string[]>([]);

  useEffect(() => {
    const t = setInterval(() => {
      setViewers((v) => v + Math.floor(Math.random() * 5) - 1);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const like = () => {
    setLikes((l) => l + 1);
    setFloating((f) => [...f, "❤️"]);
    setTimeout(() => setFloating((f) => f.slice(1)), 1200);
  };

  const tipSmall = () => {
    if (spend(10, "Rose sent to the room 🌹")) {
      setFloating((f) => [...f, "🌹"]);
      setTimeout(() => setFloating((f) => f.slice(1)), 1200);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink">
      <Image
        src={creator.image}
        alt={creator.name}
        fill
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90" />

      <div className="relative z-10 flex min-h-dvh flex-col px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/live"
              className="rounded-full bg-black/40 p-2 backdrop-blur"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2 rounded-full bg-black/45 py-1 pl-1 pr-3 backdrop-blur">
              <Image
                src={creator.image}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
              />
              <div>
                <p className="text-xs font-bold">{creator.name}</p>
                <p className="flex items-center gap-1 text-[10px] text-white/70">
                  <Eye className="h-3 w-3" /> {Math.max(viewers, 1).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleFollow(creator.id)}
                className="ml-1 rounded-full bg-coral px-2.5 py-1 text-[10px] font-bold"
              >
                {following.includes(creator.id) ? "Following" : "Follow"}
              </button>
            </div>
          </div>
          <span className="live-pulse rounded-full bg-coral px-2.5 py-1 text-[10px] font-bold uppercase">
            Live
          </span>
        </div>

        <div className="mt-auto space-y-3">
          <div className="max-w-[75%] space-y-1.5">
            {chatFeed.map((c) => (
              <motion.p
                key={c.user + c.text}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-2xl bg-black/35 px-3 py-1.5 text-xs backdrop-blur-sm"
              >
                <span className="font-bold text-gold">{c.user}</span>{" "}
                <span className="text-white/90">{c.text}</span>
              </motion.p>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-2.5 backdrop-blur">
              <MessageCircle className="h-4 w-4 text-white/60" />
              <input
                placeholder="Say something exciting…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
              />
            </div>
            <button
              type="button"
              onClick={like}
              className="rounded-full bg-black/40 p-3 backdrop-blur"
            >
              <Heart className="h-5 w-5 text-coral" fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={() => setGiftOpen(true)}
              className="rounded-full bg-coral p-3 shadow-[0_0_24px_var(--glow)]"
            >
              <Gift className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={tipSmall}
              className="rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs font-semibold backdrop-blur"
            >
              Quick Rose · 10
            </button>
            <Link
              href={`/call/${creator.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-sand px-4 py-2 text-xs font-bold text-ink"
            >
              <Video className="h-3.5 w-3.5" /> Private 1v1 · {creator.callRate}/min
            </Link>
            <span className="text-xs text-white/60">{coins} coins</span>
          </div>
          {likes > 0 && (
            <p className="text-center text-[10px] text-white/50">
              You liked {likes} times — keep the energy up
            </p>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-40 right-8 z-20 space-y-2">
        {floating.map((e, i) => (
          <span key={`${e}-${i}`} className="gift-float block text-3xl">
            {e}
          </span>
        ))}
      </div>

      <GiftSheet open={giftOpen} onClose={() => setGiftOpen(false)} />
    </main>
  );
}
