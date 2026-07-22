import {
  onValue,
  push,
  ref,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { env } from '../config/env';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';

export type ChatMessage = {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
  kind?: 'text' | 'image' | 'support';
  fromName?: string;
  deliveredAt?: number;
  readAt?: number;
};

export type DmThreadRow = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  lastMessage: string;
  updatedAt: number;
};

function api() {
  return env.apiBaseUrl.replace(/\/$/, '');
}

function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

export async function fetchDmThreadsForHost(hostId: string): Promise<DmThreadRow[]> {
  try {
    const res = await fetch(
      `${api()}/dm/threads?hostId=${encodeURIComponent(hostId)}`,
    );
    const data = (await res.json()) as { threads?: DmThreadRow[] };
    return data.threads || [];
  } catch {
    return [];
  }
}

export async function fetchDmMessages(
  a: string,
  b: string,
  viewerId?: string,
): Promise<ChatMessage[]> {
  try {
    const viewer = viewerId ? `&viewerId=${encodeURIComponent(viewerId)}` : '';
    const res = await fetch(
      `${api()}/dm/messages?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}${viewer}`,
    );
    const data = (await res.json()) as {
      messages?: Array<{
        id: string;
        fromId: string;
        toId: string;
        text: string;
        createdAt: number;
        fromName?: string;
        imageUrl?: string;
        deliveredAt?: number;
        readAt?: number;
      }>;
    };
    return (data.messages || []).map((m) => ({
      id: m.id,
      fromId: m.fromId,
      toId: m.toId,
      text: m.text,
      createdAt: m.createdAt,
      fromName: m.fromName,
      imageUrl: m.imageUrl,
      deliveredAt: m.deliveredAt,
      readAt: m.readAt,
      kind: m.imageUrl ? ('image' as const) : ('text' as const),
    }));
  } catch {
    return [];
  }
}

export function listenChatMessages(
  myId: string,
  peerId: string,
  onMessages: (messages: ChatMessage[]) => void,
): Unsubscribe {
  let dead = false;
  const merge = new Map<string, ChatMessage>();

  const emit = () => {
    if (dead) return;
    onMessages(
      [...merge.values()].sort((a, b) => a.createdAt - b.createdAt),
    );
  };

  const ingest = (rows: ChatMessage[]) => {
    for (const m of rows) {
      if (m?.id) merge.set(m.id, m);
    }
    emit();
  };

  const pollApi = async () => {
    const rows = await fetchDmMessages(myId, peerId, myId);
    ingest(rows);
  };

  void pollApi();
  const pollTimer = setInterval(() => void pollApi(), 2500);

  let unsubFb: Unsubscribe | undefined;
  if (isFirebaseReady()) {
    const id = chatIdFor(myId, peerId);
    unsubFb = onValue(ref(getFirebaseDb(), `chats/${id}/messages`), (snap) => {
      if (!snap.exists()) return;
      const val = snap.val() as Record<string, Omit<ChatMessage, 'id'>>;
      ingest(
        Object.entries(val).map(([msgId, row]) => ({ id: msgId, ...row })),
      );
    });
  }

  let unsubWs: (() => void) | undefined;
  void import('./realtimeWs').then(({ subscribeRealtime }) => {
    if (dead) return;
    unsubWs = subscribeRealtime((event) => {
      if (event.type !== 'dm:message') return;
      const p = event.payload as {
        message?: ChatMessage;
        thread?: { userId?: string; hostId?: string };
      };
      if (!p?.message) return;
      const ids = [p.message.fromId, p.message.toId];
      if (!ids.includes(myId) || !ids.includes(peerId)) return;
      ingest([p.message]);
    });
  });

  return () => {
    dead = true;
    clearInterval(pollTimer);
    unsubFb?.();
    unsubWs?.();
  };
}

export async function sendChatMessage(input: {
  fromId: string;
  toId: string;
  text: string;
  fromName?: string;
  fromAvatar?: string;
  peerName?: string;
  peerAvatar?: string;
  fromRole?: 'user' | 'host';
  imageUrl?: string;
  kind?: 'text' | 'image' | 'support';
}) {
  const text = input.text.trim();
  if (!text && !input.imageUrl) return;

  // Always sync via CoinCall API so Luma ↔ Host DMs work without Firebase
  const apiRes = await fetch(`${api()}/dm/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromId: input.fromId,
      toId: input.toId,
      text: text || (input.imageUrl ? '📷 Photo' : ''),
      fromName: input.fromName || 'Host',
      fromAvatar: input.fromAvatar,
      peerName: input.peerName,
      peerAvatar: input.peerAvatar,
      fromRole: input.fromRole || 'host',
    }),
  });
  if (!apiRes.ok) {
    const err = await apiRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || `DM send failed (${apiRes.status})`,
    );
  }

  if (!isFirebaseReady()) return;

  try {
    const id = chatIdFor(input.fromId, input.toId);
    const db = getFirebaseDb();
    const msgRef = push(ref(db, `chats/${id}/messages`));
    const createdAt = Date.now();
    const kind = input.imageUrl ? 'image' : input.kind || 'text';
    await set(msgRef, {
      fromId: input.fromId,
      toId: input.toId,
      text: text || (input.imageUrl ? '📷 Photo' : ''),
      imageUrl: input.imageUrl || null,
      kind,
      createdAt,
    });
    await update(ref(db, `chats/${id}/meta`), {
      participants: {
        [input.fromId]: true,
        [input.toId]: true,
      },
      lastMessage: input.imageUrl ? '📷 Photo' : text,
      lastAt: createdAt,
      updatedAt: createdAt,
    });

    const noteRef = push(ref(db, `hosts/${input.toId}/notifications`));
    await set(noteRef, {
      type: input.kind === 'support' ? 'support' : 'chat',
      title: input.kind === 'support' ? 'Admin support' : 'New message',
      body: `${input.fromName || 'A host'}: ${(text || 'Photo').slice(0, 80)}`,
      fromId: input.fromId,
      createdAt,
      read: false,
    });
  } catch {
    // API already delivered the DM; Firebase is optional mirror
  }
}

/** Host mass-texts recent viewers / gifters (1:1 fan-out). */
export async function massTextUsers(input: {
  fromId: string;
  fromName: string;
  userIds: string[];
  text: string;
}) {
  const text = input.text.trim();
  if (!text) return 0;
  const unique = [...new Set(input.userIds.filter((id) => id && id !== input.fromId))];
  let sent = 0;
  for (const toId of unique.slice(0, 40)) {
    try {
      await sendChatMessage({
        fromId: input.fromId,
        toId,
        text,
        fromName: input.fromName,
        fromRole: 'host',
      });
      sent += 1;
    } catch {
      // skip failed peers
    }
  }
  return sent;
}

export const ADMIN_SUPPORT_ID = 'admin_support';

export async function sendAdminSupportMessage(input: {
  fromId: string;
  fromName: string;
  text: string;
  imageUrl?: string;
}) {
  return sendChatMessage({
    fromId: input.fromId,
    toId: ADMIN_SUPPORT_ID,
    text: input.text,
    fromName: input.fromName,
    imageUrl: input.imageUrl,
    kind: 'support',
    fromRole: 'host',
  });
}
