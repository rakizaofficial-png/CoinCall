import { env } from '../config/env';
import { GIFT_CATALOG, type GiftItem } from '../data/gifts';
import { sendRealtime, subscribeRealtime } from './realtimeWs';

export type GiftRequest = {
  id: string;
  callId: string;
  hostId: string;
  hostName: string;
  userId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: number;
  updatedAt: number;
  fromUserName?: string;
  hostWallet?: { coinBalance: number };
};

function apiBase() {
  const raw = (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(
    /\/$/,
    '',
  );
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

export function giftCatalog(): GiftItem[] {
  return GIFT_CATALOG;
}

/** Host requests a gift from the user on this call */
export async function requestGiftFromUser(input: {
  callId: string;
  giftId: string;
  message?: string;
}): Promise<GiftRequest> {
  const res = await fetch(`${apiBase()}/calls/${input.callId}/gift-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      giftId: input.giftId,
      message: input.message,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    giftRequest?: GiftRequest;
    error?: string;
  };
  if (!res.ok || !data.giftRequest) {
    throw new Error(data.error || 'Could not send gift request');
  }

  sendRealtime({
    type: 'gift:request',
    payload: data.giftRequest,
  });

  return data.giftRequest;
}

export async function getPendingGiftRequest(callId: string): Promise<GiftRequest | null> {
  const res = await fetch(`${apiBase()}/calls/${callId}/gift-requests/pending`);
  if (!res.ok) return null;
  const data = (await res.json()) as { giftRequest?: GiftRequest | null };
  return data.giftRequest || null;
}

/** User accepts / declines (also usable for demo from host side in __DEV__) */
export async function respondToGiftRequest(input: {
  callId: string;
  requestId: string;
  action: 'accept' | 'decline';
  userId: string;
}): Promise<GiftRequest> {
  const res = await fetch(
    `${apiBase()}/calls/${input.callId}/gift-requests/${input.requestId}/respond`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: input.action,
        userId: input.userId,
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    giftRequest?: GiftRequest;
    error?: string;
    hostWallet?: { coinBalance: number };
  };
  if (!res.ok || !data.giftRequest) {
    throw new Error(data.error || 'Could not respond to gift request');
  }
  sendRealtime({
    type: 'gift:respond',
    payload: { ...data.giftRequest, status: data.giftRequest.status },
  });
  return { ...data.giftRequest, hostWallet: data.hostWallet };
}

export function listenGiftRequestEvents(
  callId: string,
  onEvent: (type: string, gift: GiftRequest) => void,
): () => void {
  return subscribeRealtime((event) => {
    const payload = event.payload as GiftRequest | undefined;
    if (!payload || payload.callId !== callId) return;
    if (
      event.type === 'gift:accepted' ||
      event.type === 'gift:declined' ||
      event.type === 'gift:expired' ||
      event.type === 'gift:request'
    ) {
      onEvent(event.type, payload);
    }
  });
}
