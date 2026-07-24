import {
  onValue,
  ref,
  remove,
  set,
  update,
  type Database,
} from 'firebase/database';
import { adminKey, apiBaseUrl, db } from './firebase';

export type HostRow = {
  id: string;
  name?: string;
  email?: string;
  country?: string;
  hostId?: string;
  hostStatus?: string;
  photoUrl?: string;
  photoUrls?: string[];
  videoUrl?: string;
  avatarUrl?: string;
  coinBalance?: number;
  isOnline?: boolean;
  isVerified?: boolean;
  applicationSubmittedAt?: number;
  rejectionReason?: string;
  banned?: boolean;
  suspended?: boolean;
  bio?: string;
  languages?: string[];
  categories?: string[];
  callPrice?: number;
  idDocumentUrl?: string;
  selfieUrl?: string;
  docsRequested?: string;
};

export type ActiveCall = {
  id: string;
  channel: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  peerId: string;
  peerName: string;
  startedAt: number;
  status: string;
  coinsEarned?: number;
  seconds?: number;
};

function requireDb(): Database {
  if (!db) throw new Error('Firebase RTDB not configured in admin/.env');
  return db;
}

export async function staffLogin(
  mode: 'admin' | 'agency',
  email: string,
  password: string,
  role = 'super_admin',
) {
  const res = await fetch(
    `${apiBaseUrl}${mode === 'agency' ? '/admin/agency-login' : '/admin/login'}`,
    {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role, adminId: `admin_${role}` }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Invalid email or password');
  return data;
}

export function listenHosts(cb: (hosts: HostRow[]) => void) {
  const database = requireDb();
  return onValue(ref(database, 'hosts'), (snap) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<HostRow, 'id'>>;
    cb(
      Object.entries(val).map(([id, row]) => ({
        id,
        ...row,
      })),
    );
  });
}

export function listenActiveCalls(cb: (calls: ActiveCall[]) => void) {
  const database = requireDb();
  return onValue(ref(database, 'activeCalls'), (snap) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<ActiveCall, 'id'>>;
    cb(
      Object.entries(val).map(([id, row]) => ({
        id,
        ...row,
      })),
    );
  });
}

export async function approveHost(uid: string) {
  await update(ref(requireDb(), `hosts/${uid}`), {
    hostStatus: 'approved',
    isVerified: true,
    banned: false,
    coinBalance: 200,
    approvedAt: Date.now(),
    rejectionReason: null,
  });
}

export async function rejectHost(uid: string, reason: string) {
  await update(ref(requireDb(), `hosts/${uid}`), {
    hostStatus: 'rejected',
    isVerified: false,
    rejectionReason: reason || 'Does not meet beauty host standards',
  });
}

export async function banHost(uid: string) {
  await update(ref(requireDb(), `hosts/${uid}`), {
    banned: true,
    isOnline: false,
    hostStatus: 'rejected',
    rejectionReason: 'Banned by admin',
  });
  await sendControl(uid, { type: 'ban', message: 'Your account was banned by admin.' });
}

export async function setHostCoins(uid: string, coinBalance: number) {
  await update(ref(requireDb(), `hosts/${uid}`), { coinBalance });
}

export async function setHostOnline(uid: string, isOnline: boolean) {
  await update(ref(requireDb(), `hosts/${uid}`), { isOnline });
  await sendControl(uid, {
    type: isOnline ? 'force_online' : 'force_offline',
    message: isOnline ? 'Admin set you Online.' : 'Admin set you Offline.',
  });
}

export async function sendControl(
  uid: string,
  cmd: { type: string; message?: string },
) {
  await set(ref(requireDb(), `hosts/${uid}/control`), {
    ...cmd,
    at: Date.now(),
    by: 'admin',
  });
}

export async function endCallRemote(call: ActiveCall) {
  await sendControl(call.hostUid, {
    type: 'end_call',
    message: 'Admin ended your call.',
  });
  await remove(ref(requireDb(), `activeCalls/${call.id}`));
}

export async function fetchMonitorToken(channel: string, uid: number) {
  const url = `${apiBaseUrl}/agora/token?channel=${encodeURIComponent(channel)}&uid=${uid}&role=subscriber&key=${encodeURIComponent(adminKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ token: string; appId: string; uid: number; channel: string }>;
}

export type WithdrawalRow = {
  id: string;
  hostId: string;
  amountCoins: number;
  gateway: string;
  accountName: string;
  accountNumber: string;
  status: string;
  createdAt: number;
  providerRef?: string;
  error?: string;
};

export type ReportAdminRow = {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  reason: string;
  details: string;
  createdAt: number;
  status: string;
};

function adminKeyHeader() {
  return localStorage.getItem('cc_admin_key') || adminKey;
}

export async function fetchAdminWithdrawals() {
  const res = await fetch(
    `${apiBaseUrl}/admin/withdrawals?key=${encodeURIComponent(adminKeyHeader())}`,
  );
  if (!res.ok) throw new Error('Could not load withdrawals');
  return (await res.json()) as { withdrawals: WithdrawalRow[] };
}

export async function setWithdrawalStatus(id: string, status: string) {
  const res = await fetch(`${apiBaseUrl}/admin/withdrawals/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: adminKeyHeader(), status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchAdminReports() {
  const res = await fetch(
    `${apiBaseUrl}/admin/reports?key=${encodeURIComponent(adminKeyHeader())}`,
  );
  if (!res.ok) throw new Error('Could not load reports');
  return (await res.json()) as { reports: ReportAdminRow[] };
}

export async function resolveAdminReport(id: string) {
  const res = await fetch(`${apiBaseUrl}/admin/reports/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: adminKeyHeader() }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function listenReports(cb: (rows: ReportAdminRow[]) => void) {
  const database = requireDb();
  return onValue(ref(database, 'reports'), (snap) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<ReportAdminRow, 'id'>>;
    cb(
      Object.entries(val)
        .map(([id, row]) => ({ id, ...row }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    );
  });
}

export async function resolveFirebaseReport(id: string) {
  await update(ref(requireDb(), `reports/${id}`), { status: 'resolved', resolvedAt: Date.now() });
}


export type AdminWalletRow = {
  userId: string;
  coinBalance: number;
  xp: number;
  isPremium: boolean;
  displayName: string;
  avatarUrl?: string;
  role?: string;
  ledgerCount?: number;
  appId?: string;
  accountStatus?: 'active' | 'suspended' | 'banned';
};

export type AdminStatsPayload = {
  stats: {
    onlineHosts: number;
    liveHosts: number;
    liveRooms: number;
    activeCalls: number;
    activeUsers: number;
    totalUsers: number;
    totalWallets: number;
    pendingWithdrawals: number;
    paidWithdrawals: number;
    revenueCoins: number;
    totalCoinsInWallets: number;
  };
  series: {
    days: string[];
    revenue: number[];
    users: number[];
  };
};

export type LiveRoomAdmin = {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  title?: string;
  channel?: string;
  viewers?: number;
  giftCoins?: number;
  thumbnailUrl?: string;
  isLive?: boolean;
};

export async function fetchAdminWallets() {
  const res = await fetch(
    `${apiBaseUrl}/admin/wallets?key=${encodeURIComponent(adminKeyHeader())}`,
  );
  if (!res.ok) throw new Error('Could not load wallets');
  return (await res.json()) as { wallets: AdminWalletRow[]; count: number };
}

export async function adminCreditWallet(
  userId: string,
  amount: number,
  reason: string,
) {
  const res = await fetch(
    `${apiBaseUrl}/admin/wallets/${encodeURIComponent(userId)}/credit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: adminKeyHeader(), amount, reason }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function setWalletAccountStatus(
  userId: string,
  accountStatus: 'active' | 'suspended' | 'banned',
) {
  const res = await fetch(
    `${apiBaseUrl}/admin/wallets/${encodeURIComponent(userId)}/status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: adminKeyHeader(), accountStatus }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchAdminStats() {
  const res = await fetch(
    `${apiBaseUrl}/admin/stats?key=${encodeURIComponent(adminKeyHeader())}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('Could not load stats');
  return (await res.json()) as AdminStatsPayload;
}

export async function fetchLiveRoomsAdmin() {
  const res = await fetch(`${apiBaseUrl}/live/rooms`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load live rooms');
  return (await res.json()) as { rooms: LiveRoomAdmin[] };
}

export type AdminActiveCall = {
  id: string;
  kind: 'call';
  channel: string;
  hostId: string;
  hostName: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  status: string;
  ratePerMinute: number;
  billedMinutes: number;
  startedAt: number;
  seconds: number;
  coinsEarned: number;
};

export type AdminLiveRoomSession = {
  id: string;
  kind: 'live';
  channel: string;
  hostId: string;
  hostName: string;
  title: string;
  viewers: number;
  giftCoins: number;
  thumbnailUrl?: string;
  status: string;
};

export async function fetchAdminActiveSessions() {
  const res = await fetch(
    `${apiBaseUrl}/admin/active-sessions?key=${encodeURIComponent(adminKeyHeader())}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('Could not load active sessions');
  return (await res.json()) as {
    calls: AdminActiveCall[];
    liveRooms: AdminLiveRoomSession[];
    counts: { calls: number; liveRooms: number; total: number };
  };
}

export async function endBridgeCallAdmin(callId: string) {
  const res = await fetch(
    `${apiBaseUrl}/admin/calls/${encodeURIComponent(callId)}/end`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: adminKeyHeader() }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Admin realtime bus — presence, calls, live rooms */
export function connectAdminRealtime(
  onEvent: (type: string, payload: unknown) => void,
): () => void {
  const base = apiBaseUrl.replace(/\/api\/?$/, '');
  const wsUrl = `${base.replace(/^http/, 'ws')}/ws?userId=admin_${Date.now()}&role=admin`;
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (closed) return;
    try {
      socket = new WebSocket(wsUrl);
    } catch {
      retry = setTimeout(open, 4000);
      return;
    }
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          payload?: unknown;
        };
        if (msg?.type) onEvent(msg.type, msg.payload);
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => {
      if (!closed) retry = setTimeout(open, 3500);
    };
    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
    };
  };
  open();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
}
