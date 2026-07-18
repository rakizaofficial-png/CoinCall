import { env } from '../config/env';

export type BridgeHost = {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  ratePerMinute: number;
  isOnline: boolean;
  isLive: boolean;
  isOnCall: boolean;
  readyToCall?: boolean;
  workspaceMode?: 'waiting_1v1' | 'solo_calling';
};

export type BridgeCall = {
  id: string;
  channel: string;
  hostId: string;
  hostName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
  hostUidAgora: number;
  userUidAgora: number;
};

/** Always resolve at call-time so web host never sticks to localhost */
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

const base = () => apiBase();

export function isCallBridgeConfigured() {
  return Boolean(apiBase());
}

export async function publishHostPresence(input: {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  ratePerMinute?: number;
  isOnline: boolean;
  isLive?: boolean;
  isOnCall?: boolean;
  workspaceMode?: 'waiting_1v1' | 'solo_calling';
}) {
  const res = await fetch(`${base()}/hosts/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ratePerMinute: 80,
      isLive: false,
      isOnCall: false,
      workspaceMode: 'waiting_1v1',
      ...input,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || 'Presence failed');
  }
  return (await res.json()) as { ok: boolean; host: BridgeHost };
}

export async function acceptBridgeCall(callId: string) {
  const res = await fetch(`${base()}/calls/${callId}/accept`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { call: BridgeCall };
}

export async function rejectBridgeCall(callId: string) {
  const res = await fetch(`${base()}/calls/${callId}/reject`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { call: BridgeCall };
}

export async function endBridgeCall(callId: string) {
  const res = await fetch(`${base()}/calls/${callId}/end`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { call: BridgeCall };
}

export async function fetchCallToken(callId: string, role: 'host' | 'user') {
  const res = await fetch(`${base()}/calls/${callId}/token?role=${role}`);
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    token: string;
    appId: string;
    uid: number;
    channel: string;
    call: BridgeCall;
  };
}

/**
 * SSE listener for incoming user calls on this host.
 */
export function listenIncomingCalls(
  hostId: string,
  onCall: (call: BridgeCall) => void,
) {
  if (!hostId) return () => undefined;

  let stopped = false;
  let es: EventSource | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const startSse = () => {
    try {
      es = new EventSource(
        `${base()}/hosts/${encodeURIComponent(hostId)}/stream`,
      );
      es.addEventListener('incoming_call', (ev) => {
        try {
          onCall(JSON.parse((ev as MessageEvent).data) as BridgeCall);
        } catch {
          // ignore bad payloads
        }
      });
      es.onerror = () => {
        es?.close();
        es = null;
        if (!stopped) {
          setTimeout(() => {
            if (!stopped) startSse();
          }, 3000);
        }
      };
    } catch {
      if (!pollTimer) {
        pollTimer = setInterval(() => undefined, 20000);
      }
    }
  };

  startSse();

  return () => {
    stopped = true;
    es?.close();
    if (pollTimer) clearInterval(pollTimer);
  };
}
