import { apiConfig, requireApiBase } from "@/config/apiConfig";

export type LiveRoomLockRtmEvent = {
  type: "live_room_lock";
  roomId: string;
  channel: string;
  hostId: string;
  entryLocked: boolean;
  entryFee: number;
  updatedAt: number;
};

export type LiveRoomGiftRtmEvent = {
  type: "live_gift";
  id: string;
  roomId: string;
  channel: string;
  fromId: string;
  fromName: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  combo: number;
  lottie?: {
    source: string;
    durationMs: number;
  };
  totals?: {
    totalCoins?: number;
    viewerCount?: number;
    hostEarnings?: number;
  };
  createdAt: number;
};

export type LiveRoomStatsRtmEvent = {
  type: "live_stats";
  roomId: string;
  channel: string;
  totalCoins?: number;
  viewerCount?: number;
  viewerDelta?: number;
  hostEarnings?: number;
  updatedAt: number;
};

export type LiveRoomStreamStateRtmEvent = {
  type: "live_stream_state";
  roomId: string;
  channel: string;
  hostId: string;
  muted?: boolean;
  cameraOff?: boolean;
  ended?: boolean;
  reason?: string;
  updatedAt: number;
};

export type LiveRoomRtmEvent =
  | LiveRoomLockRtmEvent
  | LiveRoomGiftRtmEvent
  | LiveRoomStatsRtmEvent
  | LiveRoomStreamStateRtmEvent;

type LiveRtmSession = {
  close: () => Promise<void>;
  getLockState: () => Promise<LiveRoomLockRtmEvent | null>;
};

async function fetchRtmToken(userId: string) {
  const res = await fetch(
    `${requireApiBase()}/agora/rtm-token?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as {
    appId?: string;
    token?: string;
    userId?: string;
    error?: string;
  };
  if (!res.ok || !data.appId || !data.token) {
    throw new Error(data.error || "RTM token unavailable");
  }
  return data;
}

function readMetadataValue(data: unknown, key: string) {
  const raw = data as {
    metadata?: Array<{ key?: string; value?: string }>;
    items?: Array<{ key?: string; value?: string }>;
  };
  const items = raw.metadata || raw.items || [];
  return items.find((item) => item.key === key)?.value;
}

function metadataToLock(roomId: string, channel: string, hostId: string, data: unknown) {
  const locked = readMetadataValue(data, "entryLocked") === "true";
  const fee = Math.max(0, Math.floor(Number(readMetadataValue(data, "entryFee")) || 0));
  if (!locked || fee <= 0) return null;
  return {
    type: "live_room_lock" as const,
    roomId,
    channel,
    hostId,
    entryLocked: true,
    entryFee: fee,
    updatedAt: Number(readMetadataValue(data, "updatedAt")) || Date.now(),
  };
}

export async function connectLiveRoomRtm(input: {
  roomId: string;
  channel: string;
  hostId: string;
  userId: string;
  onLock: (event: LiveRoomLockRtmEvent) => void;
  onEvent?: (event: LiveRoomRtmEvent) => void;
}) : Promise<LiveRtmSession> {
  if (!apiConfig.agora.appId && typeof window === "undefined") {
    throw new Error("RTM is browser-only in Luma.");
  }
  const token = await fetchRtmToken(input.userId);
  const AgoraRTM = (await import("agora-rtm")).default as any;
  const rtm = new AgoraRTM.RTM(token.appId, input.userId);

  const onMessage = (event: { message?: string | Uint8Array; publisher?: string }) => {
    try {
      const raw =
        typeof event.message === "string"
          ? event.message
          : new TextDecoder().decode(event.message);
      const parsed = JSON.parse(raw) as LiveRoomRtmEvent;
      if (!parsed?.type) return;
      if (parsed.roomId !== input.roomId && parsed.channel !== input.channel) return;
      input.onEvent?.(parsed);
      if (parsed.type === "live_room_lock") input.onLock(parsed);
    } catch {
      /* ignore unrelated RTM messages */
    }
  };

  await rtm.login({ token: token.token });
  rtm.addEventListener("message", onMessage);
  await rtm.subscribe(input.channel, {
    withMessage: true,
    withMetadata: true,
    withPresence: true,
  });

  return {
    getLockState: async () => {
      try {
        const data = await rtm.storage.getChannelMetadata(input.channel, "MESSAGE");
        return metadataToLock(input.roomId, input.channel, input.hostId, data);
      } catch {
        return null;
      }
    },
    close: async () => {
      try {
        rtm.removeEventListener("message", onMessage);
        await rtm.unsubscribe(input.channel);
        await rtm.logout();
      } catch {
        /* ignore cleanup */
      }
    },
  };
}
