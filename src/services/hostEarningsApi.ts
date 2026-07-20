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

export type HostTodayStats = {
  callCoins: number;
  giftCoins: number;
  liveGiftCoins: number;
  totalCoins: number;
  callsCount: number;
  callMinutes: number;
  giftCount: number;
  liveSeconds: number;
  liveSecondsCompleted?: number;
  liveActiveStartedAt?: number | null;
  liveSessions: number;
  walletBalance?: number;
  dayStartMs?: number;
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
  today: HostTodayStats;
  calls: HostCallHistoryRow[];
  gifts: HostGiftHistoryRow[];
};

export function localDayStartMs(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function fetchHostEarnings(
  hostId: string,
): Promise<HostEarningsPayload> {
  const api = env.apiBaseUrl.replace(/\/$/, '');
  const dayStart = localDayStartMs();
  const res = await fetch(
    `${api}/hosts/${encodeURIComponent(hostId)}/earnings?limit=100&dayStart=${dayStart}`,
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
  const today: HostTodayStats = data.today || {
    callCoins: 0,
    giftCoins: 0,
    liveGiftCoins: 0,
    totalCoins: 0,
    callsCount: 0,
    callMinutes: 0,
    giftCount: 0,
    liveSeconds: 0,
    liveSessions: 0,
  };
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
    today,
    calls: data.calls || [],
    gifts: data.gifts || [],
  };
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
