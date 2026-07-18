import {
  get,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { env } from '../config/env';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';

export type LiveRoom = {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  title: string;
  category: string;
  language: string;
  thumbnailUrl: string;
  channel: string;
  viewers: number;
  likes: number;
  giftCoins: number;
  isLive: boolean;
  mode: 'solo' | 'party';
  announcement: string;
  level: number;
  badge: string;
  startedAt: number;
  seats?: PartySeatPublic[];
};

export type PartySeatPublic = {
  index: number;
  locked: boolean;
  kind: 'video' | 'audio';
  hostId: string | null;
  name: string;
  avatarUrl: string;
  micOn: boolean;
  camOn: boolean;
};

export type LiveComment = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
  kind: 'comment' | 'join' | 'leave' | 'follow' | 'system';
};

export type LiveGiftEvent = {
  id: string;
  fromId: string;
  fromName: string;
  fromAvatar: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  combo: number;
  createdAt: number;
};

function api() {
  return env.apiBaseUrl.replace(/\/$/, '');
}

export async function publishLiveRoom(room: LiveRoom) {
  if (isFirebaseReady()) {
    await set(ref(getFirebaseDb(), `liveRooms/${room.id}`), room);
  }
  await fetch(`${api()}/live/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(room),
  }).catch(() => undefined);
}

export async function endLiveRoom(roomId: string, hostId: string) {
  if (isFirebaseReady()) {
    await update(ref(getFirebaseDb(), `liveRooms/${roomId}`), {
      isLive: false,
      endedAt: Date.now(),
    });
  }
  await fetch(`${api()}/live/rooms/${encodeURIComponent(roomId)}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostId }),
  }).catch(() => undefined);
}

export function listenLiveRooms(onRooms: (rooms: LiveRoom[]) => void): Unsubscribe {
  if (!isFirebaseReady()) {
    // Poll API fallback
    let dead = false;
    const tick = async () => {
      try {
        const res = await fetch(`${api()}/live/rooms`);
        const data = (await res.json()) as { rooms?: LiveRoom[] };
        if (!dead) onRooms((data.rooms || []).filter((r) => r.isLive));
      } catch {
        if (!dead) onRooms([]);
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }
  return onValue(ref(getFirebaseDb(), 'liveRooms'), (snap) => {
    if (!snap.exists()) {
      onRooms([]);
      return;
    }
    const val = snap.val() as Record<string, LiveRoom>;
    onRooms(
      Object.values(val)
        .filter((r) => r.isLive)
        .sort((a, b) => b.viewers - a.viewers),
    );
  });
}

export function listenRoomComments(
  roomId: string,
  onComments: (items: LiveComment[]) => void,
): Unsubscribe {
  if (!isFirebaseReady()) {
    onComments([]);
    return () => undefined;
  }
  return onValue(ref(getFirebaseDb(), `liveRooms/${roomId}/comments`), (snap) => {
    if (!snap.exists()) {
      onComments([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<LiveComment, 'id'>>;
    onComments(
      Object.entries(val)
        .map(([id, row]) => ({ id, ...row }))
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-80),
    );
  });
}

export async function postRoomComment(roomId: string, comment: Omit<LiveComment, 'id'>) {
  if (!isFirebaseReady()) return;
  const r = push(ref(getFirebaseDb(), `liveRooms/${roomId}/comments`));
  await set(r, comment);
}

export function listenRoomGifts(
  roomId: string,
  onGifts: (items: LiveGiftEvent[]) => void,
): Unsubscribe {
  if (!isFirebaseReady()) {
    onGifts([]);
    return () => undefined;
  }
  return onValue(ref(getFirebaseDb(), `liveRooms/${roomId}/gifts`), (snap) => {
    if (!snap.exists()) {
      onGifts([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<LiveGiftEvent, 'id'>>;
    onGifts(
      Object.entries(val)
        .map(([id, row]) => ({ id, ...row }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50),
    );
  });
}

export async function sendRoomGift(roomId: string, gift: Omit<LiveGiftEvent, 'id'>) {
  if (isFirebaseReady()) {
    const db = getFirebaseDb();
    const r = push(ref(db, `liveRooms/${roomId}/gifts`));
    await set(r, gift);
    const roomRef = ref(db, `liveRooms/${roomId}`);
    const snap = await get(roomRef);
    const current = Number(snap.val()?.giftCoins || 0);
    await update(roomRef, {
      giftCoins: current + (gift.coins || 0) * (gift.combo || 1),
    });
  }
  // Also broadcast over WS for realtime overlays
  const { sendRealtime } = await import('./realtimeWs');
  sendRealtime({
    type: 'gift:send',
    payload: { roomId, ...gift },
  });
}

export async function bumpRoomViewers(roomId: string, delta: number) {
  if (!isFirebaseReady()) return;
  // Best-effort: read-modify via transaction would be better; use increment pattern
  await update(ref(getFirebaseDb(), `liveRooms/${roomId}`), {
    viewersDelta: delta,
    lastViewerAt: Date.now(),
  }).catch(() => undefined);
}

export async function updatePartySeats(roomId: string, seats: PartySeatPublic[]) {
  if (!isFirebaseReady()) return;
  await update(ref(getFirebaseDb(), `liveRooms/${roomId}`), { seats, mode: 'party' });
}

export async function pinAnnouncement(roomId: string, announcement: string) {
  if (!isFirebaseReady()) return;
  await update(ref(getFirebaseDb(), `liveRooms/${roomId}`), { announcement });
}

export async function removeLiveRoom(roomId: string) {
  if (!isFirebaseReady()) return;
  await remove(ref(getFirebaseDb(), `liveRooms/${roomId}`));
}
