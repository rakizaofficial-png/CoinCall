/**
 * =============================================================================
 * REALTIME WEBSOCKET CLIENT
 * =============================================================================
 *
 * SETUP:
 * 1. CoinCall API must expose `/ws` (see server/index.ts WebSocket upgrade).
 * 2. Set NEXT_PUBLIC_WS_URL or rely on apiConfig.wsUrl derivation.
 * 3. Events:
 *    - call:incoming / call:update
 *    - gift:received
 *    - party:message / party:seat
 *    - wallet:updated
 *
 * Replaces mock intervals for live gifting + party chat sync.
 * =============================================================================
 */

import { apiConfig } from "@/config/apiConfig";

export type RealtimeEvent =
  | { type: "connected"; payload: { userId: string } }
  | { type: "call:incoming"; payload: Record<string, unknown> }
  | { type: "call:update"; payload: Record<string, unknown> }
  | {
      type: "gift:received";
      payload: {
        roomId?: string;
        fromUserId: string;
        giftId: string;
        coins: number;
        label: string;
      };
    }
  | {
      type: "party:message";
      payload: { roomId: string; userId: string; text: string; at: number };
    }
  | {
      type: "party:seat";
      payload: { roomId: string; seats: unknown[] };
    }
  | {
      type: "wallet:updated";
      payload: { userId: string; coinBalance: number; xp: number };
    }
  | { type: "ping"; payload?: unknown };

type Handler = (event: RealtimeEvent) => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string;
  private closedByUser = false;

  constructor(userId: string) {
    this.userId = userId;
  }

  subscribe(handler: Handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect() {
    this.closedByUser = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const url = `${apiConfig.wsUrl}?userId=${encodeURIComponent(this.userId)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.emit({ type: "connected", payload: { userId: this.userId } });
      ws.send(JSON.stringify({ type: "hello", userId: this.userId }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as RealtimeEvent;
        this.emit(data);
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.closedByUser) this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, ...payload }));
  }

  joinPartyRoom(roomId: string) {
    this.send("party:join", { roomId, userId: this.userId });
  }

  sendPartyMessage(roomId: string, text: string) {
    this.send("party:message", { roomId, userId: this.userId, text });
  }

  sendGift(input: {
    roomId?: string;
    toHostId?: string;
    giftId: string;
    coins: number;
    label: string;
  }) {
    this.send("gift:send", { ...input, fromUserId: this.userId });
  }

  disconnect() {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2500);
  }

  private emit(event: RealtimeEvent) {
    for (const h of this.handlers) h(event);
  }
}

let singleton: RealtimeClient | null = null;

export function getRealtimeClient(userId: string) {
  if (!singleton || (singleton as unknown as { userId: string }).userId !== userId) {
    singleton?.disconnect();
    singleton = new RealtimeClient(userId);
  }
  return singleton;
}
