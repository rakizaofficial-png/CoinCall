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
    await session.client.publish?.(channel, JSON.stringify(event), {
      channelType: 'MESSAGE',
    });
    return true;
  } catch (e) {
    console.warn('[live-room-rtm] publish lock failed', e);
    return false;
  }
}

export async function subscribeLiveRoomLockRtm(input: {
  roomId: string;
  channel?: string;
  userId: string;
  onLock: (event: LiveRoomLockRtmEvent) => void;
}) {
  if (Platform.OS === 'web') return () => undefined;
  const channel = rtmChannel(input.roomId, input.channel);
  try {
    const session = await getSession(input.userId, channel);
    const handler = (message: { message?: string; channelName?: string }) => {
      try {
        if (message.channelName && message.channelName !== channel) return;
        const parsed = JSON.parse(String(message.message || '')) as LiveRoomLockRtmEvent;
        if (parsed.type !== 'live_room_lock') return;
        if (parsed.roomId !== input.roomId && parsed.channel !== channel) return;
        input.onLock(parsed);
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
    console.warn('[live-room-rtm] subscribe lock failed', e);
    return () => undefined;
  }
}

export async function fetchLiveRoomAccess(input: { roomId: string; userId: string }) {
  const res = await fetch(
    `${api()}/live/rooms/${encodeURIComponent(input.roomId)}/access?userId=${encodeURIComponent(input.userId)}`,
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
    headers: { 'Content-Type': 'application/json' },
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

