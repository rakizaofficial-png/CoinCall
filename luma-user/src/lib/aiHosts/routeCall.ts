import { fetchLiveHosts, type LiveHost } from "@/lib/api";
import { resolveAiHostForRequest } from "./catalog";
import type { CallRouteDecision } from "./types";

/**
 * Backend routing action (client-callable + mirrored by /api/call-route).
 * If zero real hosts are online → AI Host Database.
 * If the requested host is online → Agora live path.
 */
export async function routeOneToOneCall(
  requestedHostId: string,
): Promise<CallRouteDecision> {
  let hosts: LiveHost[] = [];
  try {
    hosts = await fetchLiveHosts();
  } catch {
    hosts = [];
  }

  const online = hosts.filter((h) => h.isOnline && !h.isOnCall);
  const realHostsOnline = online.length;
  const matched = online.find((h) => h.id === requestedHostId) ?? null;

  if (matched) {
    return {
      transport: "agora_live",
      reason: "Requested host is online — Agora bridge",
      realHostsOnline,
      aiHost: null,
      liveHostId: matched.id,
    };
  }

  if (realHostsOnline === 0) {
    const aiHost = resolveAiHostForRequest(requestedHostId);
    return {
      transport: "ai_prerecorded",
      reason: "Zero real hosts online — AI Host Database fallback",
      realHostsOnline: 0,
      aiHost,
      liveHostId: null,
    };
  }

  // Real hosts exist but requested one is busy/offline → still fall back to AI
  // so the user always gets a seamless “live” experience.
  const aiHost = resolveAiHostForRequest(requestedHostId);
  return {
    transport: "ai_prerecorded",
    reason:
      "Requested host unavailable — AI fallback (other hosts online but not this id)",
    realHostsOnline,
    aiHost,
    liveHostId: null,
  };
}

/** Random latency 2000–4000ms to mimic server handshake */
export function fakeHandshakeDelayMs(): number {
  return 2000 + Math.floor(Math.random() * 2001);
}
