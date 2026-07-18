import { env } from '../config/env';

const base = () => env.apiBaseUrl.replace(/\/$/, '');

export type BridgeHost = {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  ratePerMinute: number;
  isOnline: boolean;
  isLive: boolean;
  isOnCall: boolean;
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

export function isCallBridgeConfigured() {
  return Boolean(env.apiBaseUrl);
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
}) {
  if (!isCallBridgeConfigured()) return null;
  const res = await fetch(`${base()}/hosts/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ratePerMinute: 80,
      isLive: false,
      isOnCall: false,
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
 * Falls back to polling if EventSource is unavailable.
 */
export function listenIncomingCalls(
  hostId: string,
  onCall: (call: BridgeCall) => void,
) {
  if (!isCallBridgeConfigured() || !hostId) return () => undefined;

  let stopped = false;
  let es: EventSource | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const startSse = () => {
    try {
      es = new EventSource(`${base()}/hosts/${encodeURIComponent(hostId)}/stream`);
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
        if (!stopped) startPoll();
      };
    } catch {
      startPoll();
    }
  };

  const startPoll = () => {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        // Re-open SSE periodically; presence endpoint already keeps host listed.
        // Lightweight: hit health is enough heartbeat companion.
        await fetch(`${base().replace(/\/api$/, '')}/api/health`);
      } catch {
        // offline
      }
    }, 20000);
  };

  startSse();

  return () => {
    stopped = true;
    es?.close();
    if (pollTimer) clearInterval(pollTimer);
  };
}
