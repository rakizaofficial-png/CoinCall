"use client";

/**
 * Live room v2 — safe for real CoinCall host Firebase UIDs.
 * Must NEVER call getCreator(id) for live hosts (that caused creator.viewers crash).
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Gift, Heart, Video } from "lucide-react";
import { creators } from "@/lib/data";
import { useApp } from "@/lib/store";
import { GiftSheet } from "@/components/GiftSheet";
import { fetchLiveHosts, type LiveHost } from "@/lib/api";
import { requireApiBase } from "@/config/apiConfig";

function avatarFor(id: string, url?: string | null) {
  if (
    !url ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.length > 2000
  ) {
    return `https://i.pravatar.cc/800?u=${encodeURIComponent(id)}`;
  }
  return url;
}

type RoomRow = {
  id: string;
  hostId?: string;
  hostName?: string;
  hostAvatar?: string;
  title?: string;
  ratePerMinute?: number;
  viewers?: number;
};

export default function LiveRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const mock = creators.find((c) => c.id === id) ?? null;
  const { coins, following, toggleFollow } = useApp();

  const [host, setHost] = useState<LiveHost | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [likes, setLikes] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [floating, setFloating] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hosts, roomRes] = await Promise.all([
          fetchLiveHosts({ readyOnly: false }).catch(() => [] as LiveHost[]),
          fetch(`${requireApiBase()}/live/rooms`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ rooms: [] })),
        ]);
        if (cancelled) return;

        const foundHost =
          hosts.find((h) => h.id === id) ||
          hosts.find((h) => h.name.toLowerCase() === id.toLowerCase()) ||
          null;
        setHost(foundHost);

        const rooms = Array.isArray(roomRes.rooms)
          ? (roomRes.rooms as RoomRow[])
          : [];
        const foundRoom =
          rooms.find((r) => r.hostId === id || r.id === id) ||
          rooms.find((r) => r.hostId === foundHost?.id) ||
          null;
        setRoom(foundRoom);
        setViewers(Number(foundRoom?.viewers) || mock?.viewers || 0);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open live");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, mock?.viewers]);

  const display = useMemo(() => {
    const hostId = host?.id || room?.hostId || id;
    return {
      id: hostId,
      name: host?.name || room?.hostName || mock?.name || "Live host",
      image: avatarFor(
        hostId,
        host?.avatarUrl || room?.hostAvatar || mock?.image,
      ),
      callRate:
        host?.ratePerMinute || room?.ratePerMinute || mock?.callRate || 80,
      roomId: room?.id || hostId,
    };
  }, [host, room, mock, id]);

  const like = () => {
    setLikes((l) => l + 1);
    setViewers((v) => v + 1);
    setFloating((f) => [...f, "❤️"]);
    setTimeout(() => setFloating((f) => f.slice(1)), 1200);
  };

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink text-sm text-muted">
        Opening live room… (v2)
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink">
      <img
        src={display.image}
        alt={display.name}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/90" />

      <div className="relative z-10 flex min-h-dvh flex-col px-4 pb-24 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/live"
              className="rounded-full bg-black/40 p-2 backdrop-blur"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-black/45 py-1 pl-1 pr-3 backdrop-blur">
              <img
                src={display.image}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{display.name}</p>
                <p className="flex items-center gap-1 text-[10px] text-white/70">
                  <Eye className="h-3 w-3" />{" "}
                  {viewers > 0 ? viewers.toLocaleString() : "Live"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleFollow(display.id)}
                className="ml-1 shrink-0 rounded-full bg-coral px-2.5 py-1 text-[10px] font-bold"
              >
                {following.includes(display.id) ? "Following" : "Follow"}
              </button>
            </div>
          </div>
          <span className="live-pulse shrink-0 rounded-full bg-coral px-2.5 py-1 text-[10px] font-bold uppercase">
            Live
          </span>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-black/50 px-3 py-2 text-xs text-white/80">
            {error}
          </p>
        ) : null}

        <div className="mt-auto space-y-3">
          <div className="flex items-center gap-2">
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
              className="rounded-full bg-coral p-3"
            >
              <Gift className="h-5 w-5" />
            </button>
            <span className="ml-auto text-xs text-white/60">{coins} coins</span>
          </div>

          <Link
            href={`/call/${encodeURIComponent(display.id)}?live=1`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-sand px-4 py-3 text-sm font-bold text-ink"
          >
            <Video className="h-4 w-4" /> Private call · {display.callRate}/min
          </Link>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-40 right-8 z-20 space-y-2">
        {floating.map((e, i) => (
          <span key={`${e}-${i}`} className="gift-float block text-3xl">
            {e}
          </span>
        ))}
      </div>

      <GiftSheet
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        hostId={display.id}
        roomId={display.roomId}
        onSent={(emoji) => {
          setFloating((f) => [...f, emoji]);
          setTimeout(() => setFloating((f) => f.slice(1)), 1200);
        }}
      />
    </main>
  );
}
