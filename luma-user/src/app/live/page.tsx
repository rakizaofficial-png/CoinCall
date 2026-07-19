"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, Flame } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { getCreator, liveRooms } from "@/lib/data";

export default function LivePage() {
  return (
    <main>
      <TopBar
        title="Live now"
        subtitle="Jump in. Chat. Gift. Feel the room."
      />

      <div className="mb-3 overflow-hidden border-y border-line bg-ink-2/80 py-2">
        <div className="marquee flex w-max gap-8 whitespace-nowrap text-xs text-muted">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex gap-8 px-4">
              <span>🔥 Sofia hit 3K viewers</span>
              <span>💎 Elena just received a Crown</span>
              <span>✨ New party room opening soon</span>
              <span>🎁 Send a Rose for 10 coins</span>
            </div>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 px-4 pb-6">
        {liveRooms.map((room, i) => {
          const creator = getCreator(room.creatorId);
          return (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Link
                href={`/live/${creator.id}`}
                className="group relative block overflow-hidden rounded-[1.25rem]"
              >
                <Image
                  src={creator.image}
                  alt={room.title}
                  width={400}
                  height={500}
                  className="aspect-[3/4] w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10" />
                <div className="absolute left-2 top-2 flex items-center gap-1.5">
                  <span className="live-pulse rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Live
                  </span>
                  {room.hot && (
                    <span className="flex items-center gap-0.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-gold">
                      <Flame className="h-3 w-3" /> Hot
                    </span>
                  )}
                </div>
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-sand">
                  <Eye className="h-3 w-3" />
                  {room.viewers.toLocaleString()}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-coral-2">
                    {room.category}
                  </p>
                  <h3 className="font-display text-sm font-bold leading-snug text-white">
                    {room.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-white/70">
                    {creator.name} {creator.flag}
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </section>
    </main>
  );
}
