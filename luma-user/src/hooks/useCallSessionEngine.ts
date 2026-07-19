"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  createCall,
  endCall as endBridgeCall,
  fetchCallToken,
  waitForAccept,
  type BridgeCall,
  type LiveHost,
  fetchLiveHosts,
} from "@/lib/api";
import {
  startUserAgoraCall,
  stopUserAgoraCall,
} from "@/lib/agora";
import { fakeHandshakeDelayMs, routeOneToOneCall } from "@/lib/aiHosts/routeCall";
import type { AiHostRecord, CallEngineState, CallTransport } from "@/lib/aiHosts/types";
import { startRingingTone, stopRingingTone } from "@/lib/ringingTone";

export type CallSessionEngine = {
  state: CallEngineState;
  transport: CallTransport | null;
  statusText: string;
  aiHost: AiHostRecord | null;
  liveHost: LiveHost | null;
  bridgeCall: BridgeCall | null;
  remoteRef: RefObject<HTMLDivElement | null>;
  localRef: RefObject<HTMLDivElement | null>;
  disconnect: () => Promise<void>;
  ratePerMinute: number;
  displayName: string;
  displayAvatar: string;
};

/**
 * Production call-state engine:
 * IDLE → ROUTING → RINGING → CONNECTED → DISCONNECTED
 * Switches Agora live ↔ AI prerecorded backup player.
 */
export function useCallSessionEngine(opts: {
  hostId: string;
  enabled: boolean;
  preferLiveBridge: boolean;
  onConnected?: (info: { transport: CallTransport; name: string }) => void;
  onFailed?: (message: string) => void;
}): CallSessionEngine {
  const { hostId, enabled, preferLiveBridge, onConnected, onFailed } = opts;

  const [state, setState] = useState<CallEngineState>("IDLE");
  const [transport, setTransport] = useState<CallTransport | null>(null);
  const [statusText, setStatusText] = useState("Preparing…");
  const [aiHost, setAiHost] = useState<AiHostRecord | null>(null);
  const [liveHost, setLiveHost] = useState<LiveHost | null>(null);
  const [bridgeCall, setBridgeCall] = useState<BridgeCall | null>(null);

  const remoteRef = useRef<HTMLDivElement | null>(null);
  const localRef = useRef<HTMLDivElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const disconnect = useCallback(async () => {
    cancelledRef.current = true;
    stopRingingTone();
    await stopUserAgoraCall();
    if (callIdRef.current) {
      await endBridgeCall(callIdRef.current);
      callIdRef.current = null;
    }
    setState("DISCONNECTED");
    setStatusText("Call ended");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    cancelledRef.current = false;

    (async () => {
      try {
        setState("ROUTING");
        setStatusText("Finding the best connection…");

        // Prefer server action when available; fall back to client router
        let decision = await routeOneToOneCall(hostId);
        try {
          const res = await fetch("/api/call-route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hostId }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              decision: typeof decision;
            };
            if (data.decision) decision = data.decision;
          }
        } catch {
          /* client routeCall already computed */
        }

        if (cancelledRef.current) return;

        // Force AI path when not preferring live (demo / offline entry)
        if (!preferLiveBridge && decision.transport === "agora_live") {
          // Still allow Agora if user explicitly asked live=1 via preferLiveBridge
        }

        // --- AGORA LIVE PATH ---
        if (decision.transport === "agora_live" && decision.liveHostId) {
          setTransport("agora_live");
          const hosts = await fetchLiveHosts();
          const host = hosts.find((h) => h.id === decision.liveHostId);
          if (!host) throw new Error("Host went offline during handshake");
          if (cancelledRef.current) return;
          setLiveHost(host);

          setState("RINGING");
          setStatusText("Connecting to Host…");
          startRingingTone();
          await sleep(fakeHandshakeDelayMs());
          stopRingingTone();
          if (cancelledRef.current) return;

          setStatusText(`Ringing ${host.name}…`);
          const userId = `luma_${Math.random().toString(36).slice(2, 9)}`;
          const call = await createCall({
            hostId: host.id,
            userId,
            userName: "Luma Fan",
          });
          if (cancelledRef.current) return;
          callIdRef.current = call.id;
          setBridgeCall(call);

          const accepted = await waitForAccept(call.id, (st) => {
            if (st === "ringing") setStatusText(`Waiting for ${host.name}…`);
          });
          if (cancelledRef.current) return;
          setBridgeCall(accepted);

          setStatusText("Host accepted · joining video…");
          const token = await fetchCallToken(accepted.id);
          if (cancelledRef.current) return;

          for (let i = 0; i < 40; i++) {
            if (localRef.current && remoteRef.current) break;
            await new Promise((r) => requestAnimationFrame(() => r(null)));
          }
          if (!localRef.current || !remoteRef.current) {
            throw new Error("Video surface missing — allow camera");
          }

          setState("CONNECTED");
          await sleep(100);
          await startUserAgoraCall({
            appId: token.appId,
            channel: token.channel,
            token: token.token,
            uid: token.uid,
            localVideoEl: localRef.current,
            remoteVideoEl: remoteRef.current,
          });
          if (cancelledRef.current) return;
          setStatusText(`Connected with ${host.name}`);
          onConnected?.({ transport: "agora_live", name: host.name });
          return;
        }

        // --- AI / PRERECORDED FALLBACK PATH ---
        const ai = decision.aiHost;
        if (!ai) throw new Error("AI host catalog empty");
        setTransport("ai_prerecorded");
        setAiHost(ai);
        setLiveHost(null);

        setState("RINGING");
        setStatusText("Connecting to Host…");
        startRingingTone();
        // Fake network handshake 2–4s — never instant
        await sleep(fakeHandshakeDelayMs());
        stopRingingTone();
        if (cancelledRef.current) return;

        setState("CONNECTED");
        setStatusText(`Connected with ${ai.name}`);
        onConnected?.({ transport: "ai_prerecorded", name: ai.name });
      } catch (e: unknown) {
        if (cancelledRef.current) return;
        stopRingingTone();
        const message = e instanceof Error ? e.message : "Could not connect";
        setState("FAILED");
        setStatusText(message);
        onFailed?.(message);
      }
    })();

    return () => {
      cancelledRef.current = true;
      stopRingingTone();
      void stopUserAgoraCall();
      if (callIdRef.current) {
        void endBridgeCall(callIdRef.current);
        callIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hostId, preferLiveBridge]);

  const ratePerMinute =
    aiHost?.cost_per_minute ||
    liveHost?.ratePerMinute ||
    bridgeCall?.ratePerMinute ||
    80;

  const displayName =
    aiHost?.name || liveHost?.name || bridgeCall?.hostName || "Host";
  const displayAvatar =
    aiHost?.avatar ||
    liveHost?.avatarUrl ||
    `https://i.pravatar.cc/800?u=${encodeURIComponent(hostId)}`;

  return {
    state,
    transport,
    statusText,
    aiHost,
    liveHost,
    bridgeCall,
    remoteRef,
    localRef,
    disconnect,
    ratePerMinute,
    displayName,
    displayAvatar,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
