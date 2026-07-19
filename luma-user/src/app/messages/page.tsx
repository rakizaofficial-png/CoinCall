"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { TopBar } from "@/components/TopBar";
import { useApp } from "@/lib/store";

function timeAgo(at: number) {
  const diff = Date.now() - at;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export default function MessagesPage() {
  const { inbox, unreadInbox, markInboxRead } = useApp();

  useEffect(() => {
    markInboxRead();
  }, [markInboxRead]);

  return (
    <main>
      <TopBar
        title="Chat"
        subtitle={
          unreadInbox
            ? `${unreadInbox} new from hosts`
            : "Mass texts & host messages"
        }
      />

      <section className="space-y-1 px-3 pb-6">
        {!inbox.length ? (
          <div className="mx-1 rounded-2xl border border-dashed border-line bg-ink-2/50 px-4 py-10 text-center">
            <p className="font-display text-sm font-bold text-sand">
              No host messages yet
            </p>
            <p className="mt-2 text-xs text-muted">
              When a host sends Mass Texting, it appears here instantly.
            </p>
          </div>
        ) : null}

        {inbox.map((t, i) => {
          const avatar = `https://i.pravatar.cc/120?u=${encodeURIComponent(t.hostId)}`;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                href={`/messages/host_${encodeURIComponent(t.hostId)}`}
                className="flex items-center gap-3 rounded-2xl px-2 py-3 transition active:bg-ink-2"
              >
                <div className="relative">
                  <Image
                    src={avatar}
                    alt={t.hostName}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  {t.unread ? (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-ink bg-coral" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-bold">{t.hostName}</p>
                    <span className="text-[10px] text-muted">
                      {timeAgo(t.at)}
                    </span>
                  </div>
                  <p
                    className={`truncate text-sm ${
                      t.unread ? "font-semibold text-sand" : "text-muted"
                    }`}
                  >
                    {t.text}
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
