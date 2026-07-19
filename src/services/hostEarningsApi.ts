import { env } from '../config/env';

export type HostCallHistoryRow = {
  id: string;
  hostId: string;
  hostName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
  billedMinutes: number;
  coinsSpent: number;
  status: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  endReason: string;
};

export type HostGiftHistoryRow = {
  id: string;
  fromUserId: string;
  fromName: string;
  toHostId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  roomId?: string | null;
  callId?: string | null;
  createdAt: number;
};

export type HostEarningsPayload = {
  summary: {
    callCoins: number;
    giftCoins: number;
    totalCoins: number;
    totalCalls: number;
    totalDurationSec: number;
    totalGifts: number;
    walletBalance: number;
  };
  calls: HostCallHistoryRow[];
  gifts: HostGiftHistoryRow[];
};

export async function fetchHostEarnings(
  hostId: string,
): Promise<HostEarningsPayload> {
  const api = env.apiBaseUrl.replace(/\/$/, '');
  const res = await fetch(
    `${api}/hosts/${encodeURIComponent(hostId)}/earnings?limit=50`,
    {
      headers: { 'X-User-Id': hostId },
      cache: 'no-store',
    },
  );
  const data = (await res.json().catch(() => ({}))) as HostEarningsPayload & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Earnings failed (${res.status})`);
  }
  return {
    summary: data.summary || {
      callCoins: 0,
      giftCoins: 0,
      totalCoins: 0,
      totalCalls: 0,
      totalDurationSec: 0,
      totalGifts: 0,
      walletBalance: 0,
    },
    calls: data.calls || [],
    gifts: data.gifts || [],
  };
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
