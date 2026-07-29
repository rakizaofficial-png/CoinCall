import { Platform } from 'react-native';
import { env } from '../config/env';

export type LiveRoomLockRtmEvent = {
  type: 'live_room_lock';
  roomId: string;
  channel: string;
  hostId: string;
  entryLocked: boolean;
  entryFee: number;
  updatedAt: number;
};

export type LiveRoomGiftRtmEvent = {
  type: 'live_gift';
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
  lottie: {
    source: string;
    durationMs: number;
    soundUrl?: string;
  };
  totals?: {
    totalCoins?: number;
    viewerCount?: number;
    hostEarnings?: number;
  };
  createdAt: number;
};

export type LiveRoomStatsRtmEvent = {
  type: 'live_stats';
  roomId: string;
  channel: string;
  totalCoins?: number;
  viewerCount?: number;
  viewerDelta?: number;
  hostEarnings?: number;
  updatedAt: number;
};

export type LiveRoomStreamStateRtmEvent = {
  type: 'live_stream_state';
  roomId: string;
  channel: string;
  hostId: string;
  muted?: boolean;
  cameraOff?: boolean;
  ended?: boolean;
  reason?: 'host_ended' | 'moderation' | 'network' | string;
  updatedAt: number;
};

export type LiveRoomRtmEvent =
  | LiveRoomLockRtmEvent
  | LiveRoomGiftRtmEvent
  | LiveRoomStatsRtmEvent
  | LiveRoomStreamStateRtmEvent;

type RtmSession = {
  client: any;
  channel: string;
  release: () => Promise<void>;
};

const sessions = new Map<string, Promise<RtmSession>>();

function api() {
  return env.apiBaseUrl.replace(/\/$/, '');
}

function rtmChannel(roomId: string, channel?: string) {
  return channel || roomId;
}

async function fetchRtmToken(userId: string) {
  const res = await fetch(`${api()}/agora/rtm-token?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `RTM token failed (${res.status})`);
  }
  return (await res.json()) as {
    appId: string;
    userId: string;
    token: string;
    expireAt: number;
  };
}

async function createNativeSession(userId: string, channel: string): Promise<RtmSession> {
  if (Platform.OS === 'web') {
    throw new Error('Native RTM client is not used on web.');
  }
  const token = await fetchRtmToken(userId);
  const mod = (await import('agora-react-native-rtm')) as any;
  const client = mod.createAgoraRtmClient(
    new mod.RtmConfig({
      appId: token.appId || env.agora.appId,
      userId,
    }),
  );
  await client.login?.({ token: token.token });
  await client.subscribe?.(channel, {
    withMessage: true,
    withMetadata: true,
    withPresence: true,
  });
  return {
    client,
    channel,
    release: async () => {
      try {
        await client.unsubscribe?.(channel);
        await client.logout?.();
        client.release?.();
      } catch {
        /* ignore */
      }
    },
  };
}

async function getSession(userId: string, channel: string) {
  const key = `${userId}:${channel}`;
  let pending = sessions.get(key);
  if (!pending) {
    pending = createNativeSession(userId, channel);
    sessions.set(key, pending);
  }
  return pending;
}

export async function publishLiveRoomLockRtm(input: {
  roomId: string;
  channel?: string;
  hostId: string;
  entryLocked: boolean;
  entryFee: number;
}) {
  if (Platform.OS === 'web') return false;
  const channel = rtmChannel(input.roomId, input.channel);
  const event: LiveRoomLockRtmEvent = {
    type: 'live_room_lock',
    roomId: input.roomId,
    channel,
    hostId: input.hostId,
    entryLocked: input.entryLocked,
    entryFee: input.entryLocked ? Math.max(10, Math.floor(input.entryFee) || 50) : 0,
    updatedAt: Date.now(),
  };
  try {
    const session = await getSession(input.hostId, channel);
    const metadata = [
      { key: 'entryLocked', value: String(event.entryLocked) },
      { key: 'entryFee', value: String(event.entryFee) },
      { key: 'updatedAt', value: String(event.updatedAt) },
    ];
    await session.client.storage?.updateChannelMetadata?.(channel, 'MESSAGE', metadata, {
      majorRevision: -1,
      recordTs: true,
      recordUserId: true,
    });
    await publishViaSession(session, channel, event);
    return true;
  } catch (e) {
    console.warn('[live-room-rtm] publish lock failed', e);
    return false;
  }
}

async function publishViaSession(session: RtmSession, channel: string, event: LiveRoomRtmEvent) {
  await session.client.publish?.(channel, JSON.stringify(event), {
    channelType: 'MESSAGE',
  });
}

export async function publishLiveRoomRtmEvent(input: {
  userId: string;
  roomId: string;
  channel?: string;
  event: LiveRoomRtmEvent;
}) {
  if (Platform.OS === 'web') return false;
  const channel = rtmChannel(input.roomId, input.channel);
  try {
    const session = await getSession(input.userId, channel);
    await publishViaSession(session, channel, { ...input.event, channel } as LiveRoomRtmEvent);
    return true;
  } catch (e) {
    console.warn('[live-room-rtm] publish event failed', e);
    return false;
  }
}

export async function publishLiveGiftRtm(input: {
  roomId: string;
  channel?: string;
  senderId: string;
  senderName: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  combo?: number;
  lottie: { source: string; durationMs: number; soundUrl?: string };
  totalCoins?: number;
  viewerCount?: number;
  hostEarnings?: number;
  createdAt?: number;
}) {
  const channel = rtmChannel(input.roomId, input.channel);
  return publishLiveRoomRtmEvent({
    userId: input.senderId,
    roomId: input.roomId,
    channel,
    event: {
      type: 'live_gift',
      id: `gift_${input.roomId}_${input.senderId}_${input.giftId}_${input.createdAt || Date.now()}`,
      roomId: input.roomId,
      channel,
      fromId: input.senderId,
      fromName: input.senderName,
      giftId: input.giftId,
      giftName: input.giftName,
      giftEmoji: input.giftEmoji,
      coins: input.coins,
      combo: input.combo || 1,
      lottie: input.lottie,
      totals: {
        totalCoins: input.totalCoins,
        viewerCount: input.viewerCount,
        hostEarnings: input.hostEarnings,
      },
      createdAt: input.createdAt || Date.now(),
    },
  });
}

export async function publishLiveStatsRtm(input: {
  roomId: string;
  channel?: string;
  userId: string;
  totalCoins?: number;
  viewerCount?: number;
  viewerDelta?: number;
  hostEarnings?: number;
}) {
  const channel = rtmChannel(input.roomId, input.channel);
  return publishLiveRoomRtmEvent({
    userId: input.userId,
    roomId: input.roomId,
    channel,
    event: {
      type: 'live_stats',
      roomId: input.roomId,
      channel,
      totalCoins: input.totalCoins,
      viewerCount: input.viewerCount,
      viewerDelta: input.viewerDelta,
      hostEarnings: input.hostEarnings,
      updatedAt: Date.now(),
    },
  });
}

export async function publishLiveStreamStateRtm(input: {
  roomId: string;
  channel?: string;
  hostId: string;
  muted?: boolean;
  cameraOff?: boolean;
  ended?: boolean;
  reason?: LiveRoomStreamStateRtmEvent['reason'];
}) {
  const channel = rtmChannel(input.roomId, input.channel);
  return publishLiveRoomRtmEvent({
    userId: input.hostId,
    roomId: input.roomId,
    channel,
    event: {
      type: 'live_stream_state',
      roomId: input.roomId,
      channel,
      hostId: input.hostId,
      muted: input.muted,
      cameraOff: input.cameraOff,
      ended: input.ended,
      reason: input.reason,
      updatedAt: Date.now(),
    },
  });
}

export async function subscribeLiveRoomRtm(input: {
  roomId: string;
  channel?: string;
  userId: string;
  onEvent: (event: LiveRoomRtmEvent) => void;
}) {
  if (Platform.OS === 'web') return () => undefined;
  const channel = rtmChannel(input.roomId, input.channel);
  try {
    const session = await getSession(input.userId, channel);
    const handler = (message: { message?: string; channelName?: string }) => {
      try {
        if (message.channelName && message.channelName !== channel) return;
        const parsed = JSON.parse(String(message.message || '')) as LiveRoomRtmEvent;
        if (!parsed?.type) return;
        if (parsed.roomId !== input.roomId && parsed.channel !== channel) return;
        input.onEvent(parsed);
      } catch {
        /* ignore unrelated RTM messages */
      }
    };
    session.client.addEventListener?.('message', handler);
    return () => {
      try {
        session.client.removeEventListener?.('message', handler);
      } catch {
        /* ignore */
      }
    };
  } catch (e) {
    console.warn('[live-room-rtm] subscribe event failed', e);
    return () => undefined;
  }
}

export async function subscribeLiveRoomLockRtm(input: {
  roomId: string;
  channel?: string;
  userId: string;
  onLock: (event: LiveRoomLockRtmEvent) => void;
}) {
  return subscribeLiveRoomRtm({
    roomId: input.roomId,
    channel: input.channel,
    userId: input.userId,
    onEvent: (event) => {
      if (event.type === 'live_room_lock') input.onLock(event);
    },
  });
}

export async function fetchLiveRoomAccess(input: { roomId: string; userId: string }) {
  const res = await fetch(
    `${api()}/live/rooms/${encodeURIComponent(input.roomId)}/access?userId=${encodeURIComponent(input.userId)}`,
    { headers: { 'X-User-Id': input.userId } },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Live access failed (${res.status})`);
  }
  return (await res.json()) as {
    roomId: string;
    hostId: string;
    entryLocked: boolean;
    entryFee: number;
    allowed: boolean;
    alreadyPaid: boolean;
    reason?: string;
  };
}

export async function payLockedLiveEntry(input: {
  roomId: string;
  userId: string;
  userName: string;
}) {
  const res = await fetch(`${api()}/live/rooms/${encodeURIComponent(input.roomId)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': input.userId },
    body: JSON.stringify({ userId: input.userId, userName: input.userName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Live unlock failed (${res.status})`);
  }
  return data as {
    ok: boolean;
    entryFee: number;
    wallet?: { coinBalance: number };
    alreadyPaid?: boolean;
    free?: boolean;
  };
}
