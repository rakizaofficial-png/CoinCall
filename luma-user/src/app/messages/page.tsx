"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
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
  const { inbox, unreadInbox } = useApp();
  // Don't mark all read on mount — only mark individual threads when opened

  return (
    <main>
      <TopBar
        title="Messages"
        subtitle={
          unreadInbox
            ? `${unreadInbox} unread`
            : "Host messages & DMs"
        }
      />

      <section className="space-y-px px-3 pb-6">
        {!inbox.length ? (
          <div className="mx-1 mt-4 rounded-2xl border border-dashed border-line bg-ink-2/50 px-4 py-12 text-center">
            <MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted/50" />
            <p className="font-display text-sm font-bold text-sand">
              No messages yet
            </p>
            <p className="mt-1.5 text-xs text-muted">
              When a host sends you a message, it appears here instantly.
            </p>
          </div>
        ) : null}

        {inbox.map((t, i) => {
          const avatar = `https://i.pravatar.cc/120?u=${encodeURIComponent(t.hostId)}`;
          const href = `/messages/host_${encodeURIComponent(t.hostId)}`;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                href={href}
                className="flex items-center gap-3 rounded-2xl px-2 py-3 transition active:bg-ink-2"
              >
                <div className="relative shrink-0">
                  <Image
                    src={avatar}
                    alt={t.hostName}
                    width={52}
                    height={52}
                    unoptimized
                    className="h-[52px] w-[52px] rounded-full object-cover ring-2 ring-line"
                  />
                  {t.unread ? (
                    <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink bg-coral" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-bold text-sand">{t.hostName}</p>
                    <span className="shrink-0 text-[10px] text-muted">{timeAgo(t.at)}</span>
                  </div>
                  <p
                    className={`mt-0.5 truncate text-sm ${
                      t.unread
                        ? "font-semibold text-sand"
                        : "text-muted"
                    }`}
                  >
                    {t.text}
                  </p>
                </div>
                {t.unread ? (
                  <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-coral px-1.5 text-[10px] font-bold text-white">
                    •
                  </span>
                ) : null}
              </Link>
            </motion.div>
          );
        })}
      </section>
    </main>
  );
}
