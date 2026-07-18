import {
  onValue,
  push,
  ref,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';

export type ChatMessage = {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
  kind?: 'text' | 'image' | 'support';
};

function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

export function listenChatMessages(
  myId: string,
  peerId: string,
  onMessages: (messages: ChatMessage[]) => void,
): Unsubscribe {
  if (!isFirebaseReady()) {
    onMessages([]);
    return () => undefined;
  }
  const id = chatIdFor(myId, peerId);
  return onValue(ref(getFirebaseDb(), `chats/${id}/messages`), (snap) => {
    if (!snap.exists()) {
      onMessages([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<ChatMessage, 'id'>>;
    const list = Object.entries(val)
      .map(([msgId, row]) => ({ id: msgId, ...row }))
      .sort((a, b) => a.createdAt - b.createdAt);
    onMessages(list);
  });
}

export async function sendChatMessage(input: {
  fromId: string;
  toId: string;
  text: string;
  fromName?: string;
  imageUrl?: string;
  kind?: 'text' | 'image' | 'support';
}) {
  const text = input.text.trim();
  if (!text && !input.imageUrl) return;

  if (!isFirebaseReady()) {
    throw new Error('Chat requires Firebase. Configure Firebase keys to message hosts.');
  }

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

  // Inbox notification for peer
  const noteRef = push(ref(db, `hosts/${input.toId}/notifications`));
  await set(noteRef, {
    type: input.kind === 'support' ? 'support' : 'chat',
    title: input.kind === 'support' ? 'Admin support' : 'New message',
    body: `${input.fromName || 'A host'}: ${(text || 'Photo').slice(0, 80)}`,
    fromId: input.fromId,
    createdAt,
    read: false,
  });
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
  });
}
