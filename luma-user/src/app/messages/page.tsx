"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { getCreator, threads } from "@/lib/data";

export default function MessagesPage() {
  return (
    <main>
      <TopBar
        title="Messages"
        subtitle="Keep the spark going offline."
      />

      <section className="space-y-1 px-3 pb-6">
        {threads.map((t, i) => {
          const creator = getCreator(t.creatorId);
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={`/messages/${t.id}`}
                className="flex items-center gap-3 rounded-2xl px-2 py-3 transition active:bg-ink-2"
              >
                <div className="relative">
                  <Image
                    src={creator.image}
                    alt={creator.name}
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  {creator.online && (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-ink bg-teal" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-bold">{creator.name}</p>
                    <span className="text-[10px] text-muted">{t.time}</span>
                  </div>
                  <p
                    className={`truncate text-sm ${
                      t.unread ? "font-semibold text-sand" : "text-muted"
                    }`}
                  >
                    {t.lastMessage}
                  </p>
                </div>
                {t.unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1.5 text-[10px] font-bold">
                    {t.unread}
                  </span>
                )}
              </Link>
            </motion.div>
          );
        })}
      </section>

      <div className="mx-4 mb-6 rounded-2xl border border-dashed border-line bg-ink-2/50 px-4 py-5 text-center">
        <p className="font-display text-sm font-bold">Icebreakers that work</p>
        <p className="mt-1 text-xs text-muted">
          “That live was fire — what’s your next set?” · “Coffee or midnight
          talk?” · “Teach me one word in your language”
        </p>
      </div>
    </main>
  );
}
