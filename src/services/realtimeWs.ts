import { Platform } from 'react-native';
import { env } from '../config/env';

type WsHandler = (event: { type: string; payload?: any }) => void;

let socket: WebSocket | null = null;
const handlers = new Set<WsHandler>();

function wsBaseUrl() {
  const api = env.apiBaseUrl.replace(/\/$/, '');
  // https://x/api → wss://x/ws
  const root = api.replace(/\/api$/, '');
  if (root.startsWith('https://')) return `${root.replace('https://', 'wss://')}/ws`;
  if (root.startsWith('http://')) return `${root.replace('http://', 'ws://')}/ws`;
  return `wss://coincall-api.onrender.com/ws`;
}

export function connectHostRealtime(input: {
  hostId: string;
  name: string;
  avatarUrl?: string;
}) {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    socket = new WebSocket(wsBaseUrl());
  } catch {
    return;
  }

  socket.onopen = () => {
    socket?.send(
      JSON.stringify({
        type: 'host:hello',
        payload: {
          hostId: input.hostId,
          name: input.name,
          avatarUrl: input.avatarUrl,
          platform: Platform.OS,
        },
      }),
    );
  };

  socket.onmessage = (msg) => {
    try {
      const data = JSON.parse(String(msg.data)) as { type: string; payload?: any };
      handlers.forEach((h) => h(data));
    } catch {
      /* ignore bad frames */
    }
  };

  socket.onclose = () => {
    socket = null;
    setTimeout(() => connectHostRealtime(input), 5000);
  };
}

export function subscribeRealtime(handler: WsHandler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function sendRealtime(event: { type: string; payload?: any }) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
}

export function joinPartyChannel(roomId: string, hostId: string) {
  sendRealtime({ type: 'party:join', payload: { roomId, hostId } });
}

export function sendPartyGift(roomId: string, fromHostId: string, coins: number) {
  sendRealtime({
    type: 'gift:send',
    payload: { roomId, fromHostId, coins, at: Date.now() },
  });
}
