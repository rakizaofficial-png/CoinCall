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
}) {
  const text = input.text.trim();
  if (!text) return;

  if (!isFirebaseReady()) {
    throw new Error('Chat requires Firebase. Configure Firebase keys to message hosts.');
  }

  const id = chatIdFor(input.fromId, input.toId);
  const db = getFirebaseDb();
  const msgRef = push(ref(db, `chats/${id}/messages`));
  const createdAt = Date.now();
  await set(msgRef, {
    fromId: input.fromId,
    toId: input.toId,
    text,
    createdAt,
  });
  await update(ref(db, `chats/${id}/meta`), {
    participants: {
      [input.fromId]: true,
      [input.toId]: true,
    },
    lastMessage: text,
    lastAt: createdAt,
    updatedAt: createdAt,
  });

  // Inbox notification for peer
  const noteRef = push(ref(db, `hosts/${input.toId}/notifications`));
  await set(noteRef, {
    type: 'chat',
    title: 'New message',
    body: `${input.fromName || 'A host'}: ${text.slice(0, 80)}`,
    fromId: input.fromId,
    createdAt,
    read: false,
  });
}
