/**
 * Shared CoinCall backend — hosts, calls, wallet, realtime.
 * Base URL from src/config/apiConfig.ts (no hardcoded mocks in callers).
 */

import { apiConfig, requireApiBase } from "@/config/apiConfig";

export const API_BASE_URL = apiConfig.apiBaseUrl;

export type LiveHost = {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  ratePerMinute: number;
  isOnline: boolean;
  isLive: boolean;
  isOnCall: boolean;
  /** Present when CoinCall API sync is deployed */
  readyToCall?: boolean;
  workspaceMode?: "waiting_1v1" | "solo_calling";
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
  status: "ringing" | "accepted" | "rejected" | "ended" | "missed";
  hostUidAgora: number;
  userUidAgora: number;
};

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

function normalizeHost(raw: Partial<LiveHost> & { id?: string; name?: string }): LiveHost | null {
  if (!raw?.id || !raw?.name) return null;
  const isOnline = Boolean(raw.isOnline);
  const isLive = Boolean(raw.isLive);
  const isOnCall = Boolean(raw.isOnCall);
  const readyToCall =
    typeof raw.readyToCall === "boolean"
      ? raw.readyToCall
      : isOnline && !isOnCall;
  return {
    id: String(raw.id),
    name: String(raw.name),
    avatarUrl: raw.avatarUrl,
    country: raw.country,
    ratePerMinute: Number(raw.ratePerMinute) || 80,
    isOnline,
    isLive,
    isOnCall,
    readyToCall,
    workspaceMode: raw.workspaceMode,
  };
}

function sortHosts(list: LiveHost[]) {
  return [...list].sort((a, b) => {
    const ar = Number(a.readyToCall);
    const br = Number(b.readyToCall);
    if (ar !== br) return br - ar;
    return Number(b.isLive) - Number(a.isLive);
  });
}

/**
 * Online CoinCall hosts for Discover / 1v1.
 * Uses same-origin proxy first, then direct API fallback.
 */
export async function fetchLiveHosts(opts?: {
  readyOnly?: boolean;
}): Promise<LiveHost[]> {
  const readyQs = opts?.readyOnly ? "?ready=1" : "";

  const fromProxy = async () => {
    const res = await fetch(`/api/bridge/hosts${readyQs}`, { cache: "no-store" });
    const data = await parse<{ hosts: Partial<LiveHost>[] }>(res);
    return (data.hosts || [])
      .map((h) => normalizeHost(h))
      .filter((h): h is LiveHost => Boolean(h && h.isOnline));
  };

  const fromApi = async () => {
    const res = await fetch(`${requireApiBase()}/hosts${readyQs}`, {
      cache: "no-store",
    });
    const data = await parse<{ hosts: Partial<LiveHost>[] }>(res);
    return (data.hosts || [])
      .map((h) => normalizeHost(h))
      .filter((h): h is LiveHost => Boolean(h && h.isOnline));
  };

  try {
    const list = await fromProxy();
    if (list.length) return sortHosts(list);
    // Proxy returned empty — try direct (and ready=0 if ready filter empty)
    const direct = await fromApi();
    if (direct.length || !opts?.readyOnly) return sortHosts(direct);
    return sortHosts(await fetchLiveHosts({ readyOnly: false }));
  } catch {
    try {
      return sortHosts(await fromApi());
    } catch {
      return [];
    }
  }
}

/** Hosts ready for a new 1v1 ring */
export async function fetchReadyHosts(): Promise<LiveHost[]> {
  const ready = await fetchLiveHosts({ readyOnly: true });
  if (ready.length) return ready;
  const all = await fetchLiveHosts();
  return all.filter((h) => h.readyToCall !== false && !h.isOnCall);
}

export async function createCall(input: {
  hostId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
}): Promise<BridgeCall> {
  const res = await fetch(`${requireApiBase()}/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": input.userId,
    },
    body: JSON.stringify(input),
  });
  const data = await parse<{ call: BridgeCall }>(res);
  return data.call;
}

/** Authoritative per-minute bill: deducts user coins + credits host (platform cut). */
export async function billCallMinute(input: {
  callId: string;
  userId: string;
  minuteIndex?: number;
}): Promise<{
  ok: boolean;
  amount: number;
  hostCredited: number;
  billedMinutes: number;
  error?: string;
}> {
  const res = await fetch(`${requireApiBase()}/calls/${input.callId}/minute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": input.userId,
    },
    body: JSON.stringify({
      userId: input.userId,
      minuteIndex: input.minuteIndex,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    amount?: number;
    hostCredited?: number;
    billedMinutes?: number;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      amount: 0,
      hostCredited: 0,
      billedMinutes: 0,
      error: data.error || `Bill failed (${res.status})`,
    };
  }
  return {
    ok: true,
    amount: Number(data.amount) || 0,
    hostCredited: Number(data.hostCredited) || 0,
    billedMinutes: Number(data.billedMinutes) || 0,
  };
}

export async function getCall(callId: string): Promise<BridgeCall> {
  const res = await fetch(`${requireApiBase()}/calls/${callId}`, {
    cache: "no-store",
  });
  const data = await parse<{ call: BridgeCall }>(res);
  return data.call;
}

export async function endCall(callId: string) {
  await fetch(`${requireApiBase()}/calls/${callId}/end`, { method: "POST" });
}

export async function fetchCallToken(callId: string) {
  const res = await fetch(
    `${requireApiBase()}/calls/${callId}/token?role=user`,
  );
  return parse<{
    token: string;
    appId: string;
    uid: number;
    channel: string;
    call: BridgeCall;
  }>(res);
}

export async function waitForAccept(
  callId: string,
  onTick?: (status: BridgeCall["status"]) => void,
  timeoutMs = 45_000,
): Promise<BridgeCall> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const call = await getCall(callId);
    onTick?.(call.status);
    if (call.status === "accepted") return call;
    if (
      call.status === "rejected" ||
      call.status === "ended" ||
      call.status === "missed"
    ) {
      throw new Error(
        call.status === "rejected"
          ? "Host declined the call"
          : "Host missed the call",
      );
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  throw new Error("Host did not answer");
}
