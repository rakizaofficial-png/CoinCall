import { env } from '../config/env';
import { sendRealtime, subscribeRealtime } from './realtimeWs';
import { massTextUsers, sendAdminSupportMessage } from './chatService';

function apiBase() {
  const raw = (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (
      (host.includes('onrender.com') || host.includes('coincall-host')) &&
      raw.includes('localhost')
    ) {
      return 'https://coincall-api.onrender.com/api';
    }
  }
  return raw || 'https://coincall-api.onrender.com/api';
}

export type RechargeUserRow = {
  userId: string;
  userName: string;
  totalCoins: number;
  lastCoins: number;
  rechargeCount: number;
  lastAt: number;
};

export type RechargeEvent = {
  id: string;
  userId: string;
  userName: string;
  coins: number;
  totalCoins: number;
  roomId?: string;
  at: number;
};

export type ActiveUserRow = {
  userId: string;
  userName: string;
  role: 'user' | 'host';
  lastSeen: number;
};

export async function fetchActiveUsers(): Promise<ActiveUserRow[]> {
  const res = await fetch(`${apiBase()}/users/active`);
  if (!res.ok) return [];
  const data = (await res.json()) as { users?: ActiveUserRow[] };
  return data.users || [];
}

export async function fetchRechargeBoard(): Promise<{
  users: RechargeUserRow[];
  events: RechargeEvent[];
}> {
  const res = await fetch(`${apiBase()}/recharges`);
  if (!res.ok) return { users: [], events: [] };
  return (await res.json()) as { users: RechargeUserRow[]; events: RechargeEvent[] };
}

/** Host mass-texts every active user */
export async function massTextAllActiveUsers(input: {
  hostId: string;
  hostName: string;
  text: string;
}): Promise<number> {
  const text = input.text.trim();
  if (!text) return 0;

  const res = await fetch(`${apiBase()}/host/mass-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostId: input.hostId,
      hostName: input.hostName,
      text,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    sent?: number;
    userIds?: string[];
    recipients?: { userId: string; userName: string }[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Mass text failed');
  }

  const ids =
    data.userIds ||
    data.recipients?.map((r) => r.userId) ||
    (await fetchActiveUsers()).map((u) => u.userId);

  if (ids.length) {
    await massTextUsers({
      fromId: input.hostId,
      fromName: input.hostName,
      userIds: ids,
      text,
    }).catch(() => 0);
  }

  sendRealtime({
    type: 'mass:text',
    payload: {
      hostId: input.hostId,
      hostName: input.hostName,
      text,
      sent: data.sent ?? ids.length,
      at: Date.now(),
    },
  });

  return Number(data.sent) || ids.length;
}

/** Create admin support ticket (+ optional chat message) */
export async function createAdminSupportTicket(input: {
  hostId: string;
  hostName: string;
  text: string;
}): Promise<{ id: string }> {
  const text = input.text.trim();
  if (!text) throw new Error('Message required');

  const res = await fetch(`${apiBase()}/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostId: input.hostId,
      hostName: input.hostName,
      text,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ticket?: { id: string };
    error?: string;
  };
  if (!res.ok || !data.ticket) {
    throw new Error(data.error || 'Could not create support ticket');
  }

  await sendAdminSupportMessage({
    fromId: input.hostId,
    fromName: input.hostName,
    text: `[${data.ticket.id}] ${text}`,
  }).catch(() => undefined);

  return { id: data.ticket.id };
}

export function listenRechargeBoard(
  onUpdate: (users: RechargeUserRow[], event?: RechargeEvent) => void,
): () => void {
  let dead = false;
  void fetchRechargeBoard().then((board) => {
    if (!dead) onUpdate(board.users);
  });
  const unsub = subscribeRealtime((event) => {
    if (event.type !== 'recharge:updated') return;
    const payload = event.payload as {
      users?: RechargeUserRow[];
      event?: RechargeEvent;
      user?: RechargeUserRow;
    };
    if (payload?.users) {
      onUpdate(payload.users, payload.event);
      return;
    }
    if (payload?.user) {
      void fetchRechargeBoard().then((board) => {
        if (!dead) onUpdate(board.users, payload.event);
      });
    }
  });
  return () => {
    dead = true;
    unsub();
  };
}

export async function reportRoomRecharge(input: {
  roomId: string;
  userId: string;
  userName: string;
  coins: number;
}) {
  await fetch(`${apiBase()}/live/rooms/${encodeURIComponent(input.roomId)}/recharge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => undefined);
}
