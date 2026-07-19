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
  kind: 'comment' | 'join' | 'leave' | 'follow' | 'system' | 'recharge' | 'image';
  imageUrl?: string;
  /** Coins recharged when kind === 'recharge' */
  rechargeCoins?: number;
};

export type LockedLivePhoto = {
  id: string;
  url: string;
  caption: string;
  /** Minimum gift coins required to unlock */
  unlockCoins: number;
  unlockedBy: Record<string, boolean>;
  createdAt: number;
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

/** Strip huge data:/blob: avatars so Luma / API never choke on multi-MB JSON */
function publicAvatar(hostId: string, url?: string) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.length > 2000) {
    return `https://i.pravatar.cc/400?u=${encodeURIComponent(hostId)}`;
  }
  return url;
}

export async function publishLiveRoom(room: LiveRoom) {
  const safe: LiveRoom = {
    ...room,
    hostAvatar: publicAvatar(room.hostId, room.hostAvatar),
    thumbnailUrl: publicAvatar(room.hostId, room.thumbnailUrl),
  };
  if (isFirebaseReady()) {
    await set(ref(getFirebaseDb(), `liveRooms/${safe.id}`), safe);
  }
  await fetch(`${api()}/live/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safe),
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
  let dead = false;
  let fromFb: LiveRoom[] = [];
  let fromApi: LiveRoom[] = [];

  const emit = () => {
    if (dead) return;
    const map = new Map<string, LiveRoom>();
    for (const r of [...fromApi, ...fromFb]) {
      if (!r?.id || !r.isLive) continue;
      map.set(r.id, r);
    }
    onRooms([...map.values()].sort((a, b) => (b.viewers || 0) - (a.viewers || 0)));
  };

  const pollApi = async () => {
    try {
      const res = await fetch(`${api()}/live/rooms`);
      const data = (await res.json()) as { rooms?: LiveRoom[] };
      fromApi = (data.rooms || []).filter((r) => r.isLive);
      emit();
    } catch {
      // keep last
    }
  };

  void pollApi();
  const pollTimer = setInterval(() => void pollApi(), 4000);

  let unsubFb: Unsubscribe | undefined;
  if (isFirebaseReady()) {
    unsubFb = onValue(ref(getFirebaseDb(), 'liveRooms'), (snap) => {
      if (!snap.exists()) {
        fromFb = [];
        emit();
        return;
      }
      const val = snap.val() as Record<string, LiveRoom>;
      fromFb = Object.values(val).filter((r) => r.isLive);
      emit();
    });
  }

  return () => {
    dead = true;
    clearInterval(pollTimer);
    unsubFb?.();
  };
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

export async function updateRoomTitle(roomId: string, title: string) {
  const next = title.trim().slice(0, 48);
  if (!next) return;
  if (isFirebaseReady()) {
    await update(ref(getFirebaseDb(), `liveRooms/${roomId}`), { title: next });
  }
  await fetch(`${api()}/live/rooms/${encodeURIComponent(roomId)}/title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: next }),
  }).catch(() => undefined);
}

export async function announceRoomRecharge(
  roomId: string,
  input: { userId: string; userName: string; coins: number },
) {
  const { sendRealtime } = await import('./realtimeWs');
  sendRealtime({
    type: 'live:recharge',
    payload: { roomId, ...input },
  });
}

export function listenLockedPhotos(
  roomId: string,
  onPhotos: (items: LockedLivePhoto[]) => void,
): Unsubscribe {
  if (!isFirebaseReady()) {
    onPhotos([]);
    return () => undefined;
  }
  return onValue(ref(getFirebaseDb(), `liveRooms/${roomId}/lockedPhotos`), (snap) => {
    if (!snap.exists()) {
      onPhotos([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<LockedLivePhoto, 'id'>>;
    onPhotos(
      Object.entries(val)
        .map(([id, row]) => ({ id, unlockedBy: row.unlockedBy || {}, ...row }))
        .sort((a, b) => b.createdAt - a.createdAt),
    );
  });
}

export async function addLockedPhoto(
  roomId: string,
  photo: Omit<LockedLivePhoto, 'id' | 'unlockedBy'>,
) {
  if (!isFirebaseReady()) return null;
  const r = push(ref(getFirebaseDb(), `liveRooms/${roomId}/lockedPhotos`));
  const row: Omit<LockedLivePhoto, 'id'> = {
    ...photo,
    unlockedBy: {},
  };
  await set(r, row);
  return r.key;
}

export async function unlockLivePhoto(
  roomId: string,
  photoId: string,
  userId: string,
) {
  if (!isFirebaseReady()) return;
  await update(
    ref(getFirebaseDb(), `liveRooms/${roomId}/lockedPhotos/${photoId}/unlockedBy`),
    { [userId]: true },
  );
}

export async function removeLiveRoom(roomId: string) {
  if (!isFirebaseReady()) return;
  await remove(ref(getFirebaseDb(), `liveRooms/${roomId}`));
}
