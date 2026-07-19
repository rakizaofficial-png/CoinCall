import { get, onValue, push, ref, remove, set, update } from 'firebase/database';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';
import type { HostStatus } from '../types/models';

export type ActiveCallRecord = {
  id: string;
  channel: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  peerId: string;
  peerName: string;
  startedAt: number;
  status: 'active' | 'ended';
  coinsEarned?: number;
  seconds?: number;
};

export type CallSessionRecord = {
  id: string;
  channel: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
  status: 'active' | 'ended';
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  billedMinutes: number;
  coinsSpent: number;
  endReason?: string;
};

export type WeeklyEarningsRow = {
  weekKey: string;
  weekStart?: number;
  coins: number;
  callMinutes: number;
  callCount: number;
  giftCoins: number;
  updatedAt?: number;
};

export type HostControlCommand = {
  type:
    | 'end_call'
    | 'force_offline'
    | 'force_online'
    | 'force_update'
    | 'ban'
    | 'suspend'
    | 'message'
    | 'kick_live'
    | 'approval'
    | 'approved';
  message?: string;
  at: number;
  by?: string;
  minVersion?: string;
  storeUrl?: string;
};

function currentWeekKey(d = new Date()) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Register live 1:1 so admin panel can see & silently join */
export async function publishActiveCall(input: {
  channel: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  peerId: string;
  peerName: string;
  callId?: string;
}) {
  if (!isFirebaseReady()) return null;
  const db = getFirebaseDb();
  const id = input.callId || push(ref(db, 'activeCalls')).key!;
  const record: ActiveCallRecord = {
    id,
    channel: input.channel,
    hostUid: input.hostUid,
    hostName: input.hostName,
    hostAvatar: input.hostAvatar,
    peerId: input.peerId,
    peerName: input.peerName,
    startedAt: Date.now(),
    status: 'active',
    coinsEarned: 0,
    seconds: 0,
  };
  await set(ref(db, `activeCalls/${id}`), record);
  return record;
}

export async function updateActiveCall(
  callId: string,
  patch: Partial<ActiveCallRecord>,
) {
  if (!isFirebaseReady() || !callId) return;
  await update(ref(getFirebaseDb(), `activeCalls/${callId}`), patch);
}

export async function endActiveCall(callId: string | null | undefined) {
  if (!isFirebaseReady() || !callId) return;
  await remove(ref(getFirebaseDb(), `activeCalls/${callId}`));
}

/**
 * Shared call session — both host + user listen for status === "ended".
 * Free-tier RTDB; no Cloud Functions.
 */
export async function upsertCallSession(input: {
  id: string;
  channel: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
}) {
  if (!isFirebaseReady() || !input.id) return null;
  const db = getFirebaseDb();
  const existing = await get(ref(db, `callSessions/${input.id}`));
  if (existing.exists()) {
    const prev = existing.val() as CallSessionRecord;
    if (prev.status === 'ended') return prev;
    await update(ref(db, `callSessions/${input.id}`), {
      ...input,
      status: 'active',
      updatedAt: Date.now(),
    });
    return { ...prev, ...input, status: 'active' as const };
  }
  const row: CallSessionRecord = {
    ...input,
    status: 'active',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    billedMinutes: 0,
    coinsSpent: 0,
  };
  await set(ref(db, `callSessions/${input.id}`), row);
  await set(ref(db, `activeCalls/${input.id}`), {
    id: input.id,
    channel: input.channel,
    hostUid: input.hostId,
    hostName: input.hostName,
    hostAvatar: input.hostAvatar,
    peerId: input.userId,
    peerName: input.userName,
    startedAt: row.startedAt,
    status: 'active',
    coinsEarned: 0,
    seconds: 0,
  }).catch(() => undefined);
  return row;
}

export async function endCallSession(
  callId: string | null | undefined,
  endReason = 'host_hangup',
) {
  if (!isFirebaseReady() || !callId) return;
  const db = getFirebaseDb();
  const now = Date.now();
  await update(ref(db, `callSessions/${callId}`), {
    status: 'ended',
    endedAt: now,
    updatedAt: now,
    endReason,
  });
  await update(ref(db, `activeCalls/${callId}`), { status: 'ended' }).catch(
    () => undefined,
  );
  setTimeout(() => {
    void remove(ref(db, `activeCalls/${callId}`)).catch(() => undefined);
  }, 1500);
}

/** Both sides leave when status becomes ended */
export function listenCallSessionEnded(
  callId: string | null | undefined,
  onEnded: () => void,
) {
  if (!isFirebaseReady() || !callId) return () => undefined;
  return onValue(ref(getFirebaseDb(), `callSessions/${callId}`), (snap) => {
    if (!snap.exists()) return;
    const session = snap.val() as CallSessionRecord;
    if (session.status === 'ended') onEnded();
  });
}

export async function fetchHostWeeklyEarnings(hostId: string): Promise<{
  week: WeeklyEarningsRow;
  stats: {
    totalCallCoins: number;
    totalMinutes: number;
    totalCalls: number;
  };
  walletBalance: number;
}> {
  const emptyWeek: WeeklyEarningsRow = {
    weekKey: currentWeekKey(),
    coins: 0,
    callMinutes: 0,
    callCount: 0,
    giftCoins: 0,
  };
  if (!isFirebaseReady() || !hostId) {
    return {
      week: emptyWeek,
      stats: { totalCallCoins: 0, totalMinutes: 0, totalCalls: 0 },
      walletBalance: 0,
    };
  }
  const db = getFirebaseDb();
  const weekKey = currentWeekKey();
  const [weekSnap, statsSnap, walletSnap, hostSnap] = await Promise.all([
    get(ref(db, `hosts/${hostId}/weeklyEarnings/${weekKey}`)),
    get(ref(db, `hosts/${hostId}/stats`)),
    get(ref(db, `wallets/${hostId}`)),
    get(ref(db, `hosts/${hostId}/coinBalance`)),
  ]);
  const week = weekSnap.exists()
    ? ({ ...emptyWeek, ...(weekSnap.val() as WeeklyEarningsRow) } as WeeklyEarningsRow)
    : emptyWeek;
  const stats = (statsSnap.val() || {}) as Record<string, number>;
  const walletBal = walletSnap.exists()
    ? Number((walletSnap.val() as { coinBalance?: number }).coinBalance || 0)
    : Number(hostSnap.val() || 0);
  return {
    week,
    stats: {
      totalCallCoins: Number(stats.totalCallCoins || 0),
      totalMinutes: Number(stats.totalMinutes || 0),
      totalCalls: Number(stats.totalCalls || 0),
    },
    walletBalance: walletBal,
  };
}

export async function syncHostPresence(
  uid: string,
  patch: Record<string, unknown>,
) {
  if (!isFirebaseReady() || !uid) return;
  await update(ref(getFirebaseDb(), `hosts/${uid}`), {
    ...patch,
    updatedAt: Date.now(),
  });
}

export function listenHostControl(
  uid: string,
  onCommand: (cmd: HostControlCommand) => void,
) {
  if (!isFirebaseReady() || !uid) return () => undefined;
  const controlRef = ref(getFirebaseDb(), `hosts/${uid}/control`);
  return onValue(controlRef, (snap) => {
    if (!snap.exists()) return;
    const cmd = snap.val() as HostControlCommand;
    if (!cmd?.type || !cmd.at) return;
    onCommand(cmd);
    void remove(controlRef);
  });
}

export async function adminSetHostStatus(
  uid: string,
  status: HostStatus,
  extra: Record<string, unknown> = {},
) {
  if (!isFirebaseReady()) throw new Error('Firebase not ready');
  await update(ref(getFirebaseDb(), `hosts/${uid}`), {
    hostStatus: status,
    isVerified: status === 'approved',
    ...extra,
    updatedAt: Date.now(),
  });
}

export async function adminSendHostControl(
  uid: string,
  cmd: Omit<HostControlCommand, 'at' | 'by'>,
) {
  if (!isFirebaseReady()) throw new Error('Firebase not ready');
  await set(ref(getFirebaseDb(), `hosts/${uid}/control`), {
    ...cmd,
    at: Date.now(),
    by: 'admin',
  });
}
