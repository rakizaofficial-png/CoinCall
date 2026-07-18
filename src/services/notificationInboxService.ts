import {
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';

export type InboxNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  fromId?: string;
};

export function listenHostNotifications(
  hostId: string,
  onItems: (items: InboxNotification[]) => void,
): Unsubscribe {
  if (!isFirebaseReady()) {
    onItems([]);
    return () => undefined;
  }
  return onValue(ref(getFirebaseDb(), `hosts/${hostId}/notifications`), (snap) => {
    if (!snap.exists()) {
      onItems([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<InboxNotification, 'id'>>;
    const list = Object.entries(val)
      .map(([id, row]) => ({
        id,
        type: row.type || 'system',
        title: row.title || 'Notification',
        body: row.body || '',
        createdAt: Number(row.createdAt || 0),
        read: Boolean(row.read),
        fromId: row.fromId,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    onItems(list);
  });
}

export async function markNotificationRead(hostId: string, notificationId: string) {
  if (!isFirebaseReady()) return;
  await update(ref(getFirebaseDb(), `hosts/${hostId}/notifications/${notificationId}`), {
    read: true,
  });
}

export async function markAllNotificationsRead(hostId: string, ids: string[]) {
  if (!isFirebaseReady() || !ids.length) return;
  const db = getFirebaseDb();
  await Promise.all(
    ids.map((id) =>
      update(ref(db, `hosts/${hostId}/notifications/${id}`), { read: true }),
    ),
  );
}

export async function clearNotification(hostId: string, notificationId: string) {
  if (!isFirebaseReady()) return;
  await remove(ref(getFirebaseDb(), `hosts/${hostId}/notifications/${notificationId}`));
}

export async function pushHostNotification(
  hostId: string,
  input: { type: string; title: string; body: string; fromId?: string },
) {
  if (!isFirebaseReady()) return;
  const noteRef = push(ref(getFirebaseDb(), `hosts/${hostId}/notifications`));
  await set(noteRef, {
    ...input,
    createdAt: Date.now(),
    read: false,
  });
}
