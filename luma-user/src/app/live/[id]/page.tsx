"use client";

/**
 * Live room — joins Agora (RTC subscribe) so fans see host camera, not only avatar.
 */

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Gift, Heart, Video } from "lucide-react";
import { creators } from "@/lib/data";
import { useApp } from "@/lib/store";
import { GiftSheet } from "@/components/GiftSheet";
import { fetchLiveHosts, checkLiveAccess, joinLiveRoom, type LiveHost } from "@/lib/api";
import { requireApiBase } from "@/config/apiConfig";
import {
  startUserAgoraLiveAudience,
  stopUserAgoraCall,
} from "@/lib/agora";

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
  channel?: string;
  ratePerMinute?: number;
  viewers?: number;
  entryLocked?: boolean;
  entryFee?: number;
};

export default function LiveRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const mock = creators.find((c) => c.id === id) ?? null;
  const { coins, following, toggleFollow, pushToast, userId, syncWallet } = useApp();

  const [host, setHost] = useState<LiveHost | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [likes, setLikes] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [floating, setFloating] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState("Connecting live…");
  const [hasVideo, setHasVideo] = useState(false);
  const [entryPaid, setEntryPaid] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [entryFee, setEntryFee] = useState(0);
  const [paying, setPaying] = useState(false);
  const remoteRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
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
          rooms.find(
            (r) =>
              (r.hostName || "").toLowerCase() === id.toLowerCase() ||
              (r.hostName || "").toLowerCase() ===
                (foundHost?.name || "").toLowerCase(),
          ) ||
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
    };
    void load();
    const poll = setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [id, mock?.viewers]);

  const display = useMemo(() => {
    const hostId = host?.id || room?.hostId || id;
    const channel =
      room?.channel ||
      (room?.id?.startsWith("live_") || room?.id?.startsWith("party_")
        ? room.id
        : null) ||
      `live_${hostId}`;
    return {
      id: hostId,
      name: host?.name || room?.hostName || mock?.name || "Live host",
      image: avatarFor(
        hostId,
        host?.avatarUrl || room?.hostAvatar || mock?.image,
      ),
      callRate:
        host?.ratePerMinute || room?.ratePerMinute || mock?.callRate || 80,
      roomId: room?.id || `live_${hostId}`,
      channel,
    };
  }, [host, room, mock, id]);

  useEffect(() => {
    if (!ready || !display.roomId || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const access = await checkLiveAccess(display.roomId, userId);
        if (cancelled) return;
        if (access.entryFee > 0 && !access.allowed) {
          setEntryFee(access.entryFee);
          setPaywallOpen(true);
          setEntryPaid(false);
        } else {
          setEntryPaid(true);
          setPaywallOpen(false);
        }
      } catch {
        if (!cancelled) setEntryPaid(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, display.roomId, userId]);

  useEffect(() => {
    if (!ready || !display.channel || !entryPaid) return;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const join = async (attempt: number) => {
      try {
        setVideoStatus(
          attempt > 1 ? `Reconnecting… (${attempt})` : "Joining live stream…",
        );
        setHasVideo(false);
        setError(null);

        for (let i = 0; i < 50; i++) {
          if (remoteRef.current) break;
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
        if (!active || !remoteRef.current) {
          setVideoStatus("Video surface missing");
          return;
        }

        const channels = Array.from(
          new Set(
            [
              display.channel,
              `live_${display.id}`,
              room?.id,
              room?.channel,
            ].filter(Boolean) as string[],
          ),
        );

        let lastErr: Error | null = null;
        for (const channel of channels) {
          if (!active) return;
          try {
            const res = await fetch(
              `${requireApiBase()}/live/token?hostId=${encodeURIComponent(display.id)}&channel=${encodeURIComponent(channel)}&userId=${encodeURIComponent(userId)}`,
              { cache: "no-store" },
            );
            const data = (await res.json()) as {
              token?: string;
              appId?: string;
              channel?: string;
              uid?: number;
              error?: string;
            };
            if (!res.ok || !data.token || !data.appId) {
              throw new Error(data.error || "Live token unavailable");
            }

            await startUserAgoraLiveAudience({
              appId: data.appId,
              channel: data.channel || channel,
              token: data.token,
              uid: data.uid || Math.floor(100000 + Math.random() * 800000),
              remoteVideoEl: remoteRef.current,
              onRemoteVideo: () => {
                if (!active) return;
                setHasVideo(true);
                setVideoStatus("Live");
                setError(null);
              },
            });

            if (!active) return;
            setVideoStatus("Connected · waiting for host camera…");
            // Host may publish a moment later
            retryTimer = setTimeout(() => {
              if (active && !remoteRef.current?.querySelector("video")) {
                setVideoStatus("Waiting for host video…");
              }
            }, 4000);
            return;
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error("Join failed");
            await stopUserAgoraCall();
          }
        }
        throw lastErr || new Error("Could not join live channel");
      } catch (e) {
        if (!active) return;
        const msg = e instanceof Error ? e.message : "Could not join live";
        setVideoStatus(msg);
        setError(msg);
        if (attempt < 4) {
          retryTimer = setTimeout(() => void join(attempt + 1), 2500);
        } else {
          pushToast?.(msg);
        }
      }
    };

    void join(1);

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      void stopUserAgoraCall();
    };
  }, [
    ready,
    display.channel,
    display.id,
    room?.id,
    room?.channel,
    pushToast,
    userId,
    entryPaid,
  ]);

  const payEntry = async () => {
    if (!display.roomId || !userId) return;
    setPaying(true);
    try {
      const result = await joinLiveRoom(display.roomId, userId, "Fan");
      await syncWallet();
      setEntryPaid(true);
      setPaywallOpen(false);
      pushToast(
        result.alreadyPaid
          ? "Already unlocked"
          : `Paid ${result.entryFee} coins · entering live`,
      );
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Could not unlock live");
    } finally {
      setPaying(false);
    }
  };

  const like = () => {
    setLikes((l) => l + 1);
    setViewers((v) => v + 1);
    setFloating((f) => [...f, "❤️"]);
    setTimeout(() => setFloating((f) => f.slice(1)), 1200);
  };

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink text-sm text-muted">
        Opening live room…
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink">
      {/* Poster until first Agora video frame */}
      <img
        src={display.image}
        alt={display.name}
        className={`absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-500 ${
          hasVideo ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        ref={remoteRef}
        id="agora-live-remote"
        className="absolute inset-0 z-[1]"
      />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-b from-black/50 via-transparent to-black/90" />

      {paywallOpen ? (
        <div className="absolute inset-0 z-[30] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#121826]/95 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/20 text-2xl">
              🔒
            </div>
            <h2 className="text-lg font-black text-white">Locked Live</h2>
            <p className="mt-2 text-sm text-white/65">
              {display.name} requires a coin entry fee to watch this stream.
            </p>
            <p className="mt-4 text-3xl font-black text-amber-300">
              {entryFee} <span className="text-sm font-bold">coins</span>
            </p>
            <p className="mt-1 text-xs text-white/45">
              Your balance: {coins.toLocaleString()} coins
            </p>
            <button
              type="button"
              disabled={paying || coins < entryFee}
              onClick={() => void payEntry()}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-coral to-fuchsia-500 py-3.5 text-sm font-black text-white disabled:opacity-50"
            >
              {paying ? "Processing…" : `Pay ${entryFee} coins to enter`}
            </button>
            <Link
              href="/live"
              className="mt-3 inline-block text-xs font-semibold text-white/50"
            >
              Back to live list
            </Link>
          </div>
        </div>
      ) : null}

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
                  {likes > 0 ? ` · ${likes}♥` : ""}
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
            {hasVideo ? "Live" : "…"}
          </span>
        </div>

        <p className="mt-3 text-center text-[11px] font-semibold text-white/70">
          {videoStatus}
        </p>

        {error && !hasVideo ? (
          <p className="mt-2 rounded-xl bg-black/50 px-3 py-2 text-center text-xs text-white/80">
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
