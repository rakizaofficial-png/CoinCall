"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Radio } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { fetchLiveHosts, type LiveHost } from "@/lib/api";
import { requireApiBase } from "@/config/apiConfig";

type LiveRoomRow = {
  id: string;
  hostId?: string;
  hostName?: string;
  hostAvatar?: string;
  title?: string;
  viewers?: number;
  isLive?: boolean;
};

function avatarFor(id: string, url?: string | null) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.length > 2000) {
    return `https://i.pravatar.cc/400?u=${encodeURIComponent(id)}`;
  }
  return url;
}

type Card = {
  id: string;
  roomId: string;
  name: string;
  avatar: string;
  title: string;
  viewers: number;
  rate: number;
};

export default function LivePage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [hostList, roomRes] = await Promise.all([
          fetchLiveHosts({ readyOnly: false }).catch(() => [] as LiveHost[]),
          fetch(`${requireApiBase()}/live/rooms`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ rooms: [] })),
        ]);
        if (cancelled) return;

        const hosts = hostList.filter((h) => h.isOnline || h.isLive);
        const rooms = Array.isArray(roomRes.rooms)
          ? (roomRes.rooms as LiveRoomRow[]).filter((r) => r.isLive !== false)
          : [];

        let next: Card[] = [];
        if (rooms.length > 0) {
          next = rooms.map((r) => {
            const host = hosts.find((h) => h.id === r.hostId);
            const id = String(r.hostId || r.id);
            return {
              id,
              roomId: r.id,
              name: r.hostName || host?.name || "Host",
              avatar: avatarFor(id, host?.avatarUrl || r.hostAvatar),
              title: r.title || "Live now",
              viewers: Number(r.viewers) || 0,
              rate: host?.ratePerMinute || 80,
            };
          });
        } else {
          next = hosts
            .filter((h) => h.isLive)
            .map((h) => ({
              id: h.id,
              roomId: h.id,
              name: h.name,
              avatar: avatarFor(h.id, h.avatarUrl),
              title: "Live now",
              viewers: 0,
              rate: h.ratePerMinute || 80,
            }));
        }
        setCards(next);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load live");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const t = setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <main>
      <TopBar title="Live" subtitle="Watch · gift · private call" />

      {loading ? (
        <p className="px-4 py-8 text-center text-sm text-muted">Finding live hosts…</p>
      ) : error ? (
        <p className="px-4 py-8 text-center text-sm text-coral">{error}</p>
      ) : cards.length === 0 ? (
        <div className="mx-4 mt-6 rounded-2xl border border-line bg-ink-2 px-4 py-10 text-center">
          <Radio className="mx-auto mb-3 h-8 w-8 text-coral" />
          <p className="font-display text-lg font-bold">No one is live yet</p>
          <p className="mt-1 text-sm text-muted">
            Ask a host to tap Go Live in CoinCall, then refresh.
          </p>
          <Link
            href="/call"
            className="mt-4 inline-flex rounded-full bg-coral px-4 py-2 text-xs font-bold"
          >
            Browse 1v1 hosts
          </Link>
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 px-4 pb-6 pt-2">
          {cards.map((card) => (
            <Link
              key={card.roomId + card.id}
              href={`/live/${encodeURIComponent(card.id)}`}
              className="group relative block overflow-hidden rounded-[1.25rem]"
            >
              <img
                src={card.avatar}
                alt={card.name}
                className="aspect-[3/4] w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/10" />
              <div className="absolute left-2 top-2">
                <span className="live-pulse rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Live
                </span>
              </div>
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-sand">
                <Eye className="h-3 w-3" />
                {card.viewers > 0 ? card.viewers.toLocaleString() : "Live"}
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <h3 className="font-display text-sm font-bold leading-snug text-white">
                  {card.title}
                </h3>
                <p className="mt-0.5 text-xs text-white/70">
                  {card.name} · {card.rate}/min
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
